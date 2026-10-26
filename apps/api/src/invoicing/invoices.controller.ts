import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { AuditService } from '../common/audit.service.js';
import { current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { RefsService } from '../common/refs.service.js';
import { currency, optId, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { amountInWords, DEFAULT_TAX_RATE, invoiceTotals } from './invoice.js';

const schema = z.object({
  date: z.coerce.date(), customerName: text(150), customerTaxId: z.string().trim().regex(/^[0-9A-Za-z-]{1,20}$/, 'NIT o CI inválido'), contactId: optId, caseId: optId, currency,
  items: z.array(z.object({ description: text(200), quantity: z.coerce.number().positive().max(100000), unitPrice: z.coerce.number().positive().max(1e10) })).min(1, 'Agrega al menos un concepto').max(30),
});
const money = (n: number, cur: string) => `${cur === 'BOB' ? 'Bs' : 'USD'} ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clean = (s: string) => s.replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…]/g, '?');

/**
 * Facturas que la inmobiliaria emite a sus clientes.
 * La validez fiscal depende de un proveedor de facturación electrónica: sin él, `fiscalStatus` queda en NOT_SENT
 * y el PDF lo dice. El punto de conexión es `sendToFiscalProvider`.
 */
@Roles('ADMIN', 'ACCOUNTANT')
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly refs: RefsService,
    private readonly audit: AuditService,
  ) {}

  private gate() {
    return this.limits.assertFeature('invoicing', 'La facturación');
  }
  private view = <T extends { total: unknown; taxAmount: unknown; taxRate: unknown }>(i: T) => ({ ...i, total: Number(i.total), taxAmount: Number(i.taxAmount), taxRate: Number(i.taxRate), net: Math.round((Number(i.total) - Number(i.taxAmount)) * 100) / 100 });
  private async find(id: string) {
    const invoice = await this.prisma.db.invoice.findFirst({ where: { id } });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  /** Aquí se conecta el proveedor de facturación electrónica (SIAT). Hoy no hay ninguno configurado. */
  private async sendToFiscalProvider(_invoiceId: string): Promise<{ status: string; code: string | null }> {
    return { status: 'NOT_SENT', code: null };
  }

  @Get()
  async list(@Query('status') status?: string) {
    await this.gate();
    const st = z.enum(['DRAFT', 'ISSUED', 'VOIDED']).safeParse(status);
    const rows = await this.prisma.db.invoice.findMany({ where: st.success ? { status: st.data } : {}, orderBy: [{ createdAt: 'desc' }], take: 500 });
    const issued = rows.filter((r) => r.status === 'ISSUED');
    const totals = issued.reduce<Record<string, { total: number; tax: number }>>((acc, r) => {
      const t = (acc[r.currency] ??= { total: 0, tax: 0 });
      t.total = Math.round((t.total + Number(r.total)) * 100) / 100;
      t.tax = Math.round((t.tax + Number(r.taxAmount)) * 100) / 100;
      return acc;
    }, {});
    return { items: rows.map(this.view), totals, taxRate: DEFAULT_TAX_RATE, fiscalProvider: null };
  }

  @Post()
  async create(@Body() body: unknown) {
    await this.gate();
    const data = validate(schema, body);
    await this.refs.assert({ contactId: data.contactId, caseId: data.caseId });
    const t = invoiceTotals(data.items);
    const me = current();
    const invoice = await this.prisma.db.invoice.create({
      data: { ...data, items: t.lines, total: t.total, taxRate: t.taxRate, taxAmount: t.taxAmount, tenantId: me.tenantId, createdById: me.userId },
    });
    return this.view(invoice);
  }

  /** Emitir asigna el número correlativo. Una factura emitida ya no se edita: solo se anula. */
  @Post(':id/issue')
  @HttpCode(200)
  async issue(@Param('id') id: string) {
    await this.gate();
    const invoice = await this.find(id);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Solo se emiten facturas en borrador');
    const company = await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: current().tenantId }, select: { taxId: true, legalName: true } });
    if (!company.taxId || !company.legalName) throw new BadRequestException('Antes de emitir, completa la razón social y el NIT de tu empresa en "Mi empresa"');
    // El índice único (empresa, número) impide que dos emisiones simultáneas tomen el mismo número: se reintenta.
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await this.prisma.db.invoice.findFirst({ where: { number: { not: null } }, orderBy: { number: 'desc' }, select: { number: true } });
      try {
        const fiscal = await this.sendToFiscalProvider(id);
        const issued = await this.prisma.db.invoice.update({ where: { id }, data: { status: 'ISSUED', number: (last?.number ?? 0) + 1, issuedAt: new Date(), fiscalStatus: fiscal.status, fiscalCode: fiscal.code } });
        await this.audit.record('invoices', id, 'Factura emitida', { status: 'DRAFT' }, { status: 'ISSUED', number: issued.number, total: Number(issued.total) });
        return this.view(issued);
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    throw new BadRequestException('No se pudo asignar el número. Intenta de nuevo.');
  }

  @Post(':id/void')
  @HttpCode(200)
  async void(@Param('id') id: string, @Body() body: unknown) {
    const { reason } = validate(z.object({ reason: text(190) }), body);
    const invoice = await this.find(id);
    if (invoice.status === 'VOIDED') throw new BadRequestException('Esta factura ya está anulada');
    const voided = await this.prisma.db.invoice.update({ where: { id }, data: { status: 'VOIDED', voidReason: reason } });
    await this.audit.record('invoices', id, 'Factura anulada', { status: invoice.status }, { status: 'VOIDED', voidReason: reason });
    return this.view(voided);
  }

  @Get(':id/pdf')
  async pdf(@Param('id') id: string, @Res() res: Response) {
    await this.gate();
    const inv = this.view(await this.find(id));
    const company = await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: current().tenantId }, select: { name: true, legalName: true, taxId: true, address: true, phone: true } });
    const items = inv.items as Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `Factura ${inv.number ?? 'borrador'}`, Author: company.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="factura-${inv.number ?? 'borrador'}.pdf"`);
      res.send(Buffer.concat(chunks));
    });
    const L = 48, W = doc.page.width - 96;
    doc.fillColor('#0B3C49').font('Helvetica-Bold').fontSize(18).text(clean(company.legalName ?? company.name), L, 48, { width: W - 170 });
    doc.fillColor('#1F2933').font('Helvetica').fontSize(9).text(clean([company.taxId ? `NIT ${company.taxId}` : null, company.address, company.phone].filter(Boolean).join('  ·  ')), { width: W - 170 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0B3C49').text(inv.status === 'DRAFT' ? 'BORRADOR' : `FACTURA N° ${String(inv.number).padStart(6, '0')}`, L + W - 170, 48, { width: 170, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#1F2933').text(`Fecha: ${inv.date.toLocaleDateString('es-BO', { timeZone: 'UTC' })}`, L + W - 170, doc.y + 2, { width: 170, align: 'right' });
    if (inv.status === 'VOIDED') doc.font('Helvetica-Bold').fillColor('#B91C1C').text('ANULADA', L + W - 170, doc.y + 2, { width: 170, align: 'right' });
    doc.y = 120;
    doc.fillColor('#1F2933').font('Helvetica-Bold').fontSize(10).text('Cliente: ', L, doc.y, { continued: true }).font('Helvetica').text(clean(inv.customerName));
    doc.font('Helvetica-Bold').text('NIT/CI: ', { continued: true }).font('Helvetica').text(inv.customerTaxId);
    doc.moveDown(1);
    const cols = [W * 0.52, W * 0.12, W * 0.18, W * 0.18];
    const row = (cells: string[], bold = false, fill?: string) => {
      const y = doc.y;
      const h = Math.max(...cells.map((c, i) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).heightOfString(c, { width: cols[i] - 10 }))) + 10;
      if (fill) doc.rect(L, y, W, h).fill(fill);
      doc.fillColor(fill ? '#F1FAF7' : '#1F2933');
      let x = L;
      cells.forEach((c, i) => { doc.text(c, x + 5, y + 5, { width: cols[i] - 10, align: i === 0 ? 'left' : 'right' }); x += cols[i]; });
      doc.y = y + h;
      if (!fill) doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor('#D5DDE3').stroke();
    };
    row(['Concepto', 'Cantidad', 'Precio unitario', 'Importe'], true, '#0B3C49');
    for (const i of items) row([clean(i.description), String(i.quantity), money(i.unitPrice, inv.currency), money(i.amount, inv.currency)]);
    doc.moveDown(0.8);
    const totalLine = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor('#1F2933').text(label, L + W - 260, y, { width: 150, align: 'right' }).text(value, L + W - 105, y, { width: 105, align: 'right' });
      doc.moveDown(0.3);
    };
    totalLine('Importe sin IVA', money(inv.net, inv.currency));
    totalLine(`IVA incluido (${inv.taxRate} %)`, money(inv.taxAmount, inv.currency));
    totalLine('TOTAL', money(inv.total, inv.currency), true);
    doc.moveDown(0.6).font('Helvetica').fontSize(9).text(`Son: ${clean(amountInWords(inv.total, inv.currency))}`, L, doc.y, { width: W });
    if (inv.voidReason) doc.moveDown(0.5).fillColor('#B91C1C').text(`Motivo de anulación: ${clean(inv.voidReason)}`, { width: W });
    doc.moveDown(2).fillColor('#52606D').fontSize(8).text(
      inv.fiscalCode ? `Código de autorización: ${inv.fiscalCode}` : 'Documento interno. No es una factura electrónica autorizada por Impuestos Nacionales y no da derecho a crédito fiscal.',
      L, doc.y, { width: W, align: 'center' },
    );
    doc.end();
  }
}
