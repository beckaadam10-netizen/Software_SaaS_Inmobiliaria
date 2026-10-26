import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { current, ownScope } from '../common/current.js';
import { optText, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AGREEMENT_NOTE, agreementClauses, commissionError, toPct, type CaptationOp } from './tools.js';

const agreementSchema = z.object({
  ownerName: text(150),
  ownerDocId: optText(40),
  operation: z.enum(['SALE', 'RENT', 'ANTICRETICO']),
  price: z.coerce.number().positive('Escribe un precio mayor que cero').max(1e11),
  currency: z.enum(['USD', 'BOB']),
  // Venta y anticrético: porcentaje. Alquiler: meses de alquiler.
  value: z.coerce.number().min(0).max(100),
  isExclusive: z.boolean().default(false),
  endsAt: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish()),
  days: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(1).max(730).nullish()),
  city: optText(80),
  extra: optText(1500),
  // Aplicar comisión, exclusividad y vencimiento al expediente.
  apply: z.boolean().default(true),
});
// pdfkit con fuentes estándar: deja pasar español y reemplaza lo que no se puede dibujar.
const clean = (s: string) => s.replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…]/g, '?');
const HEX = /^#[0-9a-f]{6}$/i;

/** Herramientas del paso 1 (Captación): tipo de cambio de referencia y acuerdo de trabajo en PDF. */
@Controller()
export class CaptationController {
  private readonly dir: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
  }

  /** Último tipo de cambio registrado en Finanzas, para la calculadora (lo ven también los agentes). */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('captation/rate')
  async rate() {
    const r = await this.prisma.db.exchangeRate.findFirst({ where: { date: { lte: new Date() } }, orderBy: { date: 'desc' } });
    return { rate: r ? Number(r.rate) : null, date: r?.date ?? null };
  }

  /** Genera el acuerdo de trabajo con la marca de la empresa, lo guarda en los documentos del expediente y devuelve su id. */
  @Roles('ADMIN', 'AGENT')
  @Post('cases/:id/agreement')
  async agreement(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(agreementSchema, body);
    const me = current();
    const c = await this.prisma.db.commercialCase.findFirst({
      where: { id, ...ownScope() },
      include: { property: { select: { title: true, address: true, zone: true, city: true, code: true } }, agent: { select: { fullName: true } } },
    });
    if (!c) throw new NotFoundException('Expediente no encontrado');
    if (c.status !== 'OPEN') throw new BadRequestException('El expediente ya está cerrado');
    const op = data.operation as CaptationOp;
    const err = commissionError({ operation: op, price: data.price, currency: data.currency, value: data.value, rate: 1 });
    if (err) throw new BadRequestException(err);
    const pct = toPct(op, data.value);
    const company = await this.prisma.platform.tenant.findUniqueOrThrow({
      where: { id: me.tenantId },
      select: { name: true, legalName: true, taxId: true, address: true, phone: true, email: true, logoFile: true, primaryColor: true },
    });
    const brand = company.primaryColor && HEX.test(company.primaryColor) ? company.primaryColor : '#0B3C49';
    const clauses = agreementClauses({
      company: company.name, agentName: c.agent?.fullName ?? 'la inmobiliaria', ownerName: data.ownerName, ownerDocId: data.ownerDocId,
      property: c.property.title, address: [c.property.address, c.property.zone, c.property.city].filter(Boolean).join(', ') || null,
      operation: op, price: data.price, currency: data.currency, pct, isExclusive: data.isExclusive, endsAt: data.endsAt, days: data.days, extra: data.extra,
    });

    const logo = company.logoFile && /\.(png|jpg)$/.test(company.logoFile) ? await readFile(join(this.dir, me.tenantId, company.logoFile)).catch(() => null) : null;
    const pdf = await new Promise<Buffer>((done) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 54, info: { Title: `Acuerdo de trabajo ${c.code}`, Author: company.name } });
      const chunks: Buffer[] = [];
      doc.on('data', (b: Buffer) => chunks.push(b));
      doc.on('end', () => done(Buffer.concat(chunks)));
      const L = 54, W = doc.page.width - 108;
      // Encabezado con el color y el logo de la empresa.
      doc.rect(0, 0, doc.page.width, 92).fill(brand);
      if (logo) {
        doc.roundedRect(L - 4, 20, 60, 52, 6).fill('#FFFFFF');
        try { doc.image(logo, L, 24, { fit: [52, 44], align: 'center', valign: 'center' }); } catch { /* logo no legible */ }
      }
      const tx = logo ? L + 72 : L;
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text(clean(company.name), tx, 28, { width: W - (tx - L) });
      doc.font('Helvetica').fontSize(9).text(clean([company.phone, company.email, company.address].filter(Boolean).join('  ·  ')), tx, doc.y + 2, { width: W - (tx - L) });
      doc.fillColor('#1F2933').font('Helvetica-Bold').fontSize(16).text('ACUERDO DE TRABAJO', L, 120, { width: W });
      doc.font('Helvetica').fontSize(10).fillColor('#4B5563')
        .text(clean(`${data.city ?? c.property.city ?? ''}${data.city || c.property.city ? ', ' : ''}${new Date().toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/La_Paz' })} · Expediente ${c.code} · Propiedad ${c.property.code}`), { width: W });
      doc.moveDown(1.2);
      clauses.forEach((cl, i) => {
        doc.fillColor(brand).font('Helvetica-Bold').fontSize(11).text(clean(`${i + 1}. ${cl.title}`), L, doc.y, { width: W });
        doc.fillColor('#1F2933').font('Helvetica').fontSize(10.5).text(clean(cl.text), L, doc.y + 2, { width: W, align: 'justify', lineGap: 2 });
        doc.moveDown(0.8);
      });
      // Firmas.
      if (doc.y > doc.page.height - 190) doc.addPage();
      const y = Math.max(doc.y + 50, doc.page.height - 200);
      const half = (W - 40) / 2;
      doc.strokeColor('#9CA3AF').lineWidth(0.8).moveTo(L, y).lineTo(L + half, y).stroke().moveTo(L + half + 40, y).lineTo(L + W, y).stroke();
      doc.fillColor('#1F2933').font('Helvetica-Bold').fontSize(10).text(clean(data.ownerName), L, y + 6, { width: half, align: 'center' })
        .text(clean(c.agent?.fullName ?? company.name), L + half + 40, y + 6, { width: half, align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#4B5563').text(clean(`Propietario${data.ownerDocId ? ` · ${data.ownerDocId}` : ''}`), L, y + 20, { width: half, align: 'center' })
        .text(clean(`Agente · ${company.name}`), L + half + 40, y + 20, { width: half, align: 'center' });
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#6B7280').text(clean(AGREEMENT_NOTE), L, doc.page.height - 84, { width: W, align: 'center' });
      doc.end();
    });

    const folder = join(this.dir, me.tenantId, 'docs');
    await mkdir(folder, { recursive: true });
    const fileName = `${randomUUID()}.pdf`;
    await writeFile(join(folder, fileName), pdf);
    const name = `Acuerdo de trabajo con ${data.ownerName}`.slice(0, 150);
    const saved = await this.prisma.db.document.create({
      data: { tenantId: me.tenantId, entityType: 'case', entityId: id, caseId: id, category: 'AUTHORIZATION', name, fileName, mimeType: 'application/pdf', sizeBytes: pdf.length, uploadedById: me.userId },
      select: { id: true, name: true },
    });
    // Las condiciones se aplican solo si la operación es la del expediente (el % se interpreta según la operación).
    const applied = data.apply && op === c.operation;
    if (applied) {
      await this.prisma.db.commercialCase.update({
        where: { id },
        data: { commissionPct: pct, isExclusive: data.isExclusive, ...(data.endsAt ? { captationEnds: data.endsAt } : data.days ? { captationEnds: new Date(Date.now() + data.days * 864e5) } : {}) },
      });
    }
    await this.activity.log('case', id, `Acuerdo de trabajo generado con ${data.ownerName}${applied ? '; condiciones aplicadas al expediente' : ''}`);
    return { documentId: saved.id, name: saved.name, pct, applied };
  }
}
