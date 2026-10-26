import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpException, NotFoundException, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { Public, Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { current, ownScope } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { requestContext } from '../common/request-context.js';
import { text, validate } from '../common/validate.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LEGAL_STEPS } from './steps.js';

const ROLES = ['OWNER', 'CLIENT', 'AGENT', 'WITNESS', 'OTHER'] as const;
const ROLE_LABEL: Record<string, string> = { OWNER: 'Propietario', CLIENT: 'Cliente', AGENT: 'Agente', WITNESS: 'Testigo', OTHER: 'Otro' };
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const status = (s: { status: string; expiresAt: Date }) => (s.status === 'PENDING' && s.expiresAt.getTime() < Date.now() ? 'EXPIRED' : s.status);

const tries = new Map<string, number[]>();

/** Proceso legal: checklist de trámites y firma de documentos por enlace. */
@Controller()
export class LegalController {
  private readonly dir: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
  }

  private async caseOf(id: string) {
    const c = await this.prisma.db.commercialCase.findFirst({ where: { id, ...ownScope() }, select: { id: true, code: true, operation: true, agentId: true, tenantId: true } });
    if (!c) throw new NotFoundException('Expediente no encontrado');
    return c;
  }
  private async signaturesEnabled() {
    const { plan } = await this.limits.usage();
    return plan.features.includes('legal_signatures');
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('cases/:id/legal')
  async get(@Param('id') id: string) {
    const c = await this.caseOf(id);
    const db = this.prisma.db;
    if (!(await db.legalItem.count({ where: { caseId: id } }))) {
      await db.legalItem.createMany({ data: (LEGAL_STEPS[c.operation] ?? LEGAL_STEPS.SALE).map((label, i) => ({ tenantId: c.tenantId, caseId: id, label, sortOrder: i })) });
    }
    const [items, signatures, documents] = await Promise.all([
      db.legalItem.findMany({ where: { caseId: id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      db.signatureRequest.findMany({ where: { caseId: id }, orderBy: { createdAt: 'desc' } }),
      db.document.findMany({ where: { caseId: id }, select: { id: true, name: true } }),
    ]);
    return {
      items, documents, signaturesEnabled: await this.signaturesEnabled(),
      signatures: signatures.map((s) => ({ id: s.id, documentId: s.documentId, documentName: documents.find((d) => d.id === s.documentId)?.name ?? 'Documento eliminado', signerName: s.signerName, signerRole: s.signerRole, status: status(s), link: `/firmar/${s.token}`, expiresAt: s.expiresAt, signedAt: s.signedAt, signedName: s.signedName, signedIp: s.signedIp, documentHash: s.documentHash })),
    };
  }

  @Roles('ADMIN', 'AGENT')
  @Post('cases/:id/legal/items')
  async addItem(@Param('id') id: string, @Body() body: unknown) {
    const { label } = validate(z.object({ label: text(190) }), body);
    const c = await this.caseOf(id);
    const last = await this.prisma.db.legalItem.findFirst({ where: { caseId: id }, orderBy: { sortOrder: 'desc' } });
    return this.prisma.db.legalItem.create({ data: { tenantId: c.tenantId, caseId: id, label, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  }

  private async item(id: string) {
    const item = await this.prisma.db.legalItem.findFirst({ where: { id } });
    if (!item) throw new NotFoundException('Trámite no encontrado');
    await this.caseOf(item.caseId);
    return item;
  }

  @Roles('ADMIN', 'AGENT')
  @Patch('legal/items/:id')
  async toggle(@Param('id') id: string, @Body() body: unknown) {
    const { done } = validate(z.object({ done: z.boolean() }), body);
    const item = await this.item(id);
    const updated = await this.prisma.db.legalItem.update({ where: { id }, data: done ? { doneAt: new Date(), doneById: current().userId } : { doneAt: null, doneById: null } });
    await this.activity.log('case', item.caseId, `${done ? 'Trámite completado' : 'Trámite reabierto'}: ${item.label}`);
    const pending = await this.prisma.db.legalItem.count({ where: { caseId: item.caseId, doneAt: null } });
    if (done && pending === 0) await this.activity.log('case', item.caseId, 'Todos los trámites legales están completos');
    return updated;
  }

  @Roles('ADMIN', 'AGENT')
  @Delete('legal/items/:id')
  async removeItem(@Param('id') id: string) {
    await this.item(id);
    await this.prisma.db.legalItem.delete({ where: { id } });
    return { id };
  }

  /** Pide la firma de un documento del expediente. Devuelve el enlace para enviar al firmante. */
  @Roles('ADMIN', 'AGENT')
  @Post('cases/:id/signatures')
  async request(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(z.object({ documentId: z.string().min(1).max(40), signerName: text(150), signerRole: z.enum(ROLES) }), body);
    if (!(await this.signaturesEnabled())) await this.limits.assertFeature('legal_signatures', 'La firma de documentos');
    const c = await this.caseOf(id);
    const doc = await this.prisma.db.document.findFirst({ where: { id: data.documentId, caseId: id } });
    if (!doc) throw new BadRequestException('El documento no pertenece a este expediente');
    const token = randomBytes(24).toString('hex');
    const row = await this.prisma.db.signatureRequest.create({ data: { ...data, tenantId: c.tenantId, caseId: id, token, expiresAt: new Date(Date.now() + 30 * 864e5), createdById: current().userId } });
    await this.activity.log('case', id, `Firma solicitada a ${data.signerName} (${ROLE_LABEL[data.signerRole]}): ${doc.name}`);
    return { id: row.id, link: `/firmar/${token}` };
  }

  @Roles('ADMIN', 'AGENT')
  @Post('signatures/:id/cancel')
  @HttpCode(200)
  async cancel(@Param('id') id: string) {
    const s = await this.prisma.db.signatureRequest.findFirst({ where: { id } });
    if (!s) throw new NotFoundException('Solicitud de firma no encontrada');
    await this.caseOf(s.caseId);
    if (s.status !== 'PENDING') throw new BadRequestException('Solo se cancelan firmas pendientes');
    await this.prisma.db.signatureRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.activity.log('case', s.caseId, `Solicitud de firma cancelada (${s.signerName})`);
    return { id };
  }

  // ---------- Firma pública por enlace ----------
  private async byToken(token: string) {
    if (!requestContext.get()?.tenantId || !/^[a-f0-9]{48}$/.test(token)) throw new NotFoundException('Enlace de firma no válido');
    const s = await this.prisma.db.signatureRequest.findFirst({ where: { token } });
    if (!s) throw new NotFoundException('Enlace de firma no válido');
    const doc = await this.prisma.db.document.findFirst({ where: { id: s.documentId } });
    return { s, doc };
  }

  @Public()
  @Get('public/sign/:token')
  async view(@Param('token') token: string) {
    const { s, doc } = await this.byToken(token);
    const [c, company] = await Promise.all([
      this.prisma.db.commercialCase.findFirst({ where: { id: s.caseId }, select: { code: true, property: { select: { title: true } } } }),
      this.prisma.platform.tenant.findUnique({ where: { id: s.tenantId }, select: { name: true } }),
    ]);
    return { status: doc ? status(s) : 'CANCELLED', signerName: s.signerName, signerRole: ROLE_LABEL[s.signerRole], document: doc ? { name: doc.name, mimeType: doc.mimeType } : null, company: company?.name, caseCode: c?.code, propertyTitle: c?.property.title, expiresAt: s.expiresAt, signedAt: s.signedAt };
  }

  /** El firmante puede ver el documento mientras el enlace esté vigente o ya firmado. */
  @Public()
  @Get('public/sign/:token/document')
  async document(@Param('token') token: string, @Res() res: Response) {
    const { s, doc } = await this.byToken(token);
    if (!doc || !['PENDING', 'SIGNED'].includes(status(s)) || !/^[a-f0-9-]+\.[a-z]{3,4}$/.test(doc.fileName)) throw new NotFoundException('Documento no disponible');
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(this.dir, doc.tenantId, 'docs', doc.fileName), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Documento no disponible', statusCode: 404 });
    });
  }

  /** Firma: el firmante escribe su nombre completo, que debe coincidir con el indicado, y acepta. */
  @Public()
  @Post('public/sign/:token')
  @HttpCode(200)
  async sign(@Param('token') token: string, @Body() body: unknown, @Req() req: Request) {
    const key = `${req.ip}|${token}`;
    const recent = (tries.get(key) ?? []).filter((t) => Date.now() - t < 15 * 60e3);
    if (recent.length >= 10) throw new HttpException('Demasiados intentos. Espera unos minutos.', 429);
    tries.set(key, [...recent, Date.now()]);
    const data = validate(z.object({ fullName: text(150), accept: z.literal(true, { message: 'Debes aceptar el documento para firmarlo' }) }), body);
    const { s, doc } = await this.byToken(token);
    const st = status(s);
    if (st !== 'PENDING' || !doc) throw new BadRequestException(st === 'SIGNED' ? 'Este documento ya fue firmado' : st === 'EXPIRED' ? 'El enlace venció. Pide uno nuevo.' : 'Esta solicitud de firma ya no está vigente');
    if (norm(data.fullName) !== norm(s.signerName)) throw new BadRequestException('El nombre no coincide con el de la persona que debe firmar');
    // Huella del archivo: prueba de qué versión exacta del documento se firmó.
    const file = await readFile(join(this.dir, doc.tenantId, 'docs', doc.fileName)).catch(() => null);
    if (!file) throw new BadRequestException('El documento no está disponible. Avisa a la inmobiliaria.');
    const signed = await this.prisma.db.signatureRequest.update({
      where: { id: s.id },
      data: { status: 'SIGNED', signedAt: new Date(), signedName: data.fullName, signedIp: String(req.ip ?? '').slice(0, 64), signedAgent: String(req.headers['user-agent'] ?? '').slice(0, 255), documentHash: createHash('sha256').update(file).digest('hex') },
    });
    const c = await this.prisma.db.commercialCase.findFirst({ where: { id: s.caseId }, select: { agentId: true, code: true } });
    await this.activity.log('case', s.caseId, `${s.signerName} firmó: ${doc.name}`);
    await this.notifications.notify([c?.agentId, ...(await this.notifications.admins())], { type: 'document', title: `${s.signerName} firmó ${doc.name}`, body: c?.code, link: `/app/gestion/${s.caseId}` });
    return { status: 'SIGNED', signedAt: signed.signedAt };
  }
}
