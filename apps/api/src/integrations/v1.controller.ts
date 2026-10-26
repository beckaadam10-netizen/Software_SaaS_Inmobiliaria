import { Body, CanActivate, Controller, ExecutionContext, Get, HttpException, Injectable, NotFoundException, Param, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../auth/auth.decorators.js';
import { LimitsService } from '../common/limits.service.js';
import { requestContext } from '../common/request-context.js';
import { optEmail, optText, text, validate } from '../common/validate.js';
import { LeadsService } from '../leads/leads.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashKey } from './integrations.controller.js';

const calls = new Map<string, number[]>();

/** Autentica por clave de API y fija la empresa de la petición. Límite: 120 llamadas por minuto por clave. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? (req.headers['x-api-key'] as string | undefined);
    if (!header?.startsWith('si_live_')) throw new UnauthorizedException('Falta la clave de API. Envíala en la cabecera Authorization: Bearer <clave>');
    const key = await this.prisma.platform.apiKey.findUnique({ where: { hash: hashKey(header) } });
    const ctx = requestContext.get();
    // La clave sirve en la dirección general de la API o en el subdominio de su propia empresa, nunca en el de otra.
    if (!key || key.revokedAt || !ctx || (ctx.tenantId && ctx.tenantId !== key.tenantId)) throw new UnauthorizedException('Clave de API inválida o revocada');
    const tenant = await this.prisma.platform.tenant.findUnique({ where: { id: key.tenantId }, select: { status: true, slug: true } });
    if (tenant?.status !== 'ACTIVE') throw new UnauthorizedException('La cuenta de esta empresa está suspendida');

    const now = Date.now();
    const recent = (calls.get(key.id) ?? []).filter((t) => now - t < 60000);
    if (recent.length >= 120) throw new HttpException('Demasiadas llamadas. El límite es 120 por minuto.', 429);
    calls.set(key.id, [...recent, now]);

    ctx.tenantId = key.tenantId;
    ctx.tenantSlug = tenant.slug;
    await this.limits.assertFeature('integrations', 'La API');
    if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > 60000) await this.prisma.platform.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    return true;
  }
}

const FIELDS = {
  code: true, title: true, type: true, operation: true, status: true, isPublished: true, price: true, currency: true, zone: true, city: true,
  areaM2: true, builtM2: true, bedrooms: true, bathrooms: true, parking: true, description: true, features: true, updatedAt: true,
} as const;
const leadSchema = z.object({
  fullName: text(120), phone: z.string().trim().min(6).max(30), email: optEmail, message: optText(1000), propertyCode: optText(20),
  source: z.enum(['WEB', 'WHATSAPP', 'CALL', 'REFERRAL', 'SOCIAL', 'QR', 'WALK_IN', 'OTHER']).default('WEB'),
});

/** API pública (v1) para sitios web y sistemas de la empresa. Se usa con una clave de API. */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('v1')
export class V1Controller {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly limits: LimitsService,
  ) {}

  private view = (p: { price: unknown } & Record<string, unknown>) => ({ ...p, price: Number(p.price) });

  /** Propiedades publicadas y en oferta. */
  @Get('properties')
  async properties(@Query('operation') operation?: string, @Query('limit') limit?: string) {
    const op = z.enum(['SALE', 'RENT', 'ANTICRETICO']).safeParse(operation);
    const rows = await this.prisma.db.property.findMany({
      where: { isPublished: true, status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] }, ...(op.success ? { operation: op.data } : {}) },
      select: FIELDS, orderBy: { updatedAt: 'desc' }, take: Math.min(Math.max(Number(limit) || 50, 1), 200),
    });
    return { data: rows.map(this.view) };
  }

  @Get('properties/:code')
  async property(@Param('code') code: string) {
    const p = await this.prisma.db.property.findFirst({ where: { code: code.toUpperCase(), isPublished: true }, select: FIELDS });
    if (!p) throw new NotFoundException('Propiedad no encontrada');
    return { data: this.view(p) };
  }

  /** Registra un interesado que llegó por otro canal (sitio web propio, formulario, chatbot). */
  @Post('leads')
  async createLead(@Body() body: unknown) {
    const data = validate(leadSchema, body);
    const db = this.prisma.db;
    const tenantId = requestContext.get()!.tenantId!;
    const property = data.propertyCode ? await db.property.findFirst({ where: { code: data.propertyCode.toUpperCase() }, select: { id: true } }) : null;
    if (data.propertyCode && !property) throw new NotFoundException('Propiedad no encontrada');
    let contact = await db.contact.findFirst({ where: { phone: data.phone } });
    if (!contact) {
      await this.limits.assertCanAdd('contacts');
      contact = await db.contact.create({ data: { tenantId, fullName: data.fullName, phone: data.phone, email: data.email ?? null, type: 'PROSPECT' } });
    }
    const lead = await this.leads.create({ contactId: contact.id, propertyId: property?.id, source: data.source, message: data.message });
    return { data: { id: lead.id, status: lead.status, score: lead.score, createdAt: lead.createdAt } };
  }
}
