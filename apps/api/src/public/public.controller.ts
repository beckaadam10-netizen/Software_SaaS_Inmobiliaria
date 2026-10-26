import { Body, Controller, Get, HttpCode, HttpException, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../auth/auth.decorators.js';
import { CasesService } from '../cases/cases.service.js';
import { ActivityService } from '../common/activity.service.js';
import { requestContext } from '../common/request-context.js';
import { approxLocation } from '../geo/geo.js';
import { BRAND_SELECT, brandView } from '../company/brand-view.js';
import { optEmail, optText, text, validate } from '../common/validate.js';
import { LeadsService } from '../leads/leads.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { avatarUrl } from '../users/avatar.js';
import { describeCriteria, searchProperties } from './search.js';

const interestSchema = z.object({
  fullName: text(120),
  phone: z.string().trim().min(6, 'Ingresa un teléfono válido').max(30),
  email: optEmail,
  message: optText(1000),
  visitAt: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish()),
});

const trafficSource = z.enum(['DIRECT', 'QR', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'OTHER']);
const favoriteSchema = z.object({ visitorId: z.string().regex(/^[a-zA-Z0-9-]{8,40}$/), on: z.boolean() });

// Solo lo expresamente autorizado sale al portal: nada de propietario, dirección exacta ni datos internos.
const publicFields = {
  code: true, title: true, type: true, operation: true, price: true, currency: true, zone: true, city: true,
  areaM2: true, builtM2: true, bedrooms: true, bathrooms: true, parking: true, floor: true, yearBuilt: true,
  description: true, features: true, latitude: true, longitude: true,
  // latitude y longitude se usan solo para calcular la ubicación aproximada; nunca salen tal cual.
  images: { orderBy: { sortOrder: 'asc' as const }, select: { id: true } },
} as const;

/** Freno simple contra abuso del formulario público: 5 envíos cada 10 minutos por IP. */
const hits = new Map<string, number[]>();
function rateLimit(key: string, max = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new HttpException('Demasiadas solicitudes. Intenta de nuevo en unos minutos.', 429);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
}

@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly cases: CasesService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private tenantId() {
    const id = requestContext.get()?.tenantId;
    if (!id) throw new NotFoundException('Portal no disponible');
    return id;
  }

  @Get('site')
  async site() {
    const tenant = await this.prisma.platform.tenant.findUnique({
      where: { id: this.tenantId() },
      select: { ...BRAND_SELECT, plan: { select: { features: true } } },
    });
    if (!tenant) throw new NotFoundException('Portal no disponible');
    return brandView(tenant);
  }

  @Get('properties')
  list(@Query() query: Record<string, string>) {
    this.tenantId();
    const o = z.enum(['SALE', 'RENT', 'ANTICRETICO']).safeParse(query.operation);
    const t = z.enum(['HOUSE', 'APARTMENT', 'LAND', 'OFFICE', 'COMMERCIAL', 'WAREHOUSE', 'OTHER']).safeParse(query.type);
    const q = query.q?.trim().slice(0, 80);
    return this.prisma.db.property.findMany({
      where: {
        isPublished: true,
        status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] },
        ...(o.success ? { operation: o.data } : {}),
        ...(t.success ? { type: t.data } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { zone: { contains: q } }, { city: { contains: q } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: { ...publicFields, description: false, features: false, latitude: false, longitude: false, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true } } },
    });
  }

  /**
   * Búsqueda en vivo del portal: entiende frases ("casa en venta en Equipetrol 3 dormitorios"), tolera errores
   * y, si no hay coincidencias, propone alternativas parecidas con lo que cambia.
   */
  @Get('search')
  async search(@Query() query: Record<string, string>) {
    this.tenantId();
    const o = z.enum(['SALE', 'RENT', 'ANTICRETICO']).safeParse(query.operation);
    const t = z.enum(['HOUSE', 'APARTMENT', 'LAND', 'OFFICE', 'COMMERCIAL', 'WAREHOUSE', 'OTHER']).safeParse(query.type);
    const rows = await this.prisma.db.property.findMany({
      where: { isPublished: true, status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { ...publicFields, latitude: false, longitude: false, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true } } },
    });
    const items = rows.map((r) => ({ ...r, price: Number(r.price) }));
    const out = searchProperties(items, (query.q ?? '').slice(0, 120), { type: t.data, operation: o.data });
    const card = <T extends { features?: unknown; description?: string | null }>({ features, description, ...r }: T) => { void features; void description; return r; };
    return {
      understood: describeCriteria(out.criteria),
      results: out.results.slice(0, 60).map(card),
      alternatives: out.alternatives.map(({ why, ...r }) => ({ ...card(r), why })),
      suggestions: out.suggestions,
    };
  }

  /** Cifras para la portada: cuántas propiedades hay por operación, por tipo y en qué ciudades. */
  @Get('summary')
  async summary() {
    this.tenantId();
    const rows = await this.prisma.db.property.findMany({
      where: { isPublished: true, status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] } },
      select: { operation: true, type: true, city: true, zone: true },
      take: 2000,
    });
    const count = (key: 'operation' | 'type' | 'city' | 'zone') => {
      const m: Record<string, number> = {};
      for (const r of rows) if (r[key]) m[r[key]!] = (m[r[key]!] ?? 0) + 1;
      return m;
    };
    const top = (m: Record<string, number>, n: number) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
    const zones = count('zone');
    return { total: rows.length, byOperation: count('operation'), byType: count('type'), cities: top(count('city'), 3), zones: top(zones, 8) };
  }

  private async findPublished(code: string) {
    this.tenantId();
    const property = await this.prisma.db.property.findFirst({
      where: { code: code.toUpperCase().slice(0, 20), isPublished: true, status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] } },
      select: { ...publicFields, id: true, agentId: true, agent: { select: { id: true, fullName: true, phone: true, avatarFile: true } } },
    });
    if (!property) throw new NotFoundException('Propiedad no encontrada');
    return property;
  }

  @Get('properties/:code')
  async detail(@Param('code') code: string, @Query('src') src?: string) {
    const tenantId = this.tenantId();
    const { id, agentId, agent, ...property } = await this.findPublished(code);
    await this.prisma.db.property.update({ where: { id }, data: { viewCount: { increment: 1 } } });

    // Estadística agregada por día y fuente (QR, WhatsApp, redes...). No se guarda quién visitó.
    const source = trafficSource.safeParse(src?.toUpperCase()).data ?? 'DIRECT';
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    // Incremento atómico; si dos visitas crean la fila a la vez, la segunda vuelve a sumar en vez de perderse.
    const bump = () => this.prisma.db.propertyStat.updateMany({ where: { propertyId: id, day, source }, data: { views: { increment: 1 } } });
    if ((await bump()).count === 0) {
      await this.prisma.db.propertyStat.create({ data: { tenantId, propertyId: id, day, source, views: 1 } }).catch(bump);
    }

    const favorites = await this.prisma.db.favorite.count({ where: { propertyId: id } });
    const { latitude, longitude, ...rest } = property;
    return { ...rest, favorites, location: approxLocation(latitude, longitude, property.code), agent: agent ? await this.agentCard(agent, agentId!) : null };
  }

  /** Tarjeta pública del agente: foto, contacto y reseñas que sus clientes autorizaron publicar. */
  private async agentCard(agent: { id: string; fullName: string; phone: string | null; avatarFile: string | null }, agentId: string) {
    const rows = await this.prisma.db.postSale.findMany({
      where: { testimonialPublic: true, reviewHidden: false, satisfaction: { not: null }, case: { agentId } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { satisfaction: true, testimonial: true, reviewedAt: true, updatedAt: true, case: { select: { operation: true, client: { select: { fullName: true } } } } },
    });
    const count = rows.length;
    const average = count ? Math.round((rows.reduce((s, r) => s + (r.satisfaction ?? 0), 0) / count) * 10) / 10 : null;
    return {
      fullName: agent.fullName, phone: agent.phone, avatar: avatarUrl(agent), rating: { average, count },
      reviews: rows.filter((r) => r.testimonial).slice(0, 3).map((r) => ({
        text: r.testimonial, rating: r.satisfaction, operation: r.case.operation, date: r.reviewedAt ?? r.updatedAt,
        author: r.case.client?.fullName.trim().split(/\s+/)[0] ?? 'Cliente',
      })),
    };
  }

  /** Guardar o quitar de favoritos. El visitante se identifica con un código anónimo de su navegador. */
  @Post('properties/:code/favorite')
  @HttpCode(200)
  async favorite(@Param('code') code: string, @Body() body: unknown) {
    const tenantId = this.tenantId();
    const data = validate(favoriteSchema, body);
    const property = await this.findPublished(code);
    const existing = await this.prisma.db.favorite.findFirst({ where: { propertyId: property.id, visitorId: data.visitorId } });
    if (data.on && !existing) {
      await this.prisma.db.favorite.create({ data: { tenantId, propertyId: property.id, visitorId: data.visitorId } }).catch(() => undefined);
    } else if (!data.on && existing) {
      await this.prisma.db.favorite.delete({ where: { id: existing.id } });
    }
    return { on: data.on, favorites: await this.prisma.db.favorite.count({ where: { propertyId: property.id } }) };
  }

  /** "Me interesa" y "Agendar visita": crea el contacto, el lead y, si pidió fecha, la visita. */
  @Post('properties/:code/interest')
  @HttpCode(201)
  async interest(@Param('code') code: string, @Body() body: unknown, @Req() req: Request) {
    const tenantId = this.tenantId();
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim() || req.ip || 'desconocido';
    rateLimit(`${tenantId}:${ip}`);

    const data = validate(interestSchema, body);
    const property = await this.findPublished(code);

    const phone = data.phone.replace(/[^\d+]/g, '');
    let contact = await this.prisma.db.contact.findFirst({ where: { phone } });
    contact ??= await this.prisma.db.contact.create({
      data: { tenantId, fullName: data.fullName, phone, email: data.email ?? null, type: 'PROSPECT', assignedAgentId: property.agentId },
    });

    const lead = await this.leads.create({
      contactId: contact.id, propertyId: property.id, agentId: property.agentId, source: 'WEB',
      message: data.message, wantsVisit: !!data.visitAt,
    });

    if (data.visitAt && +data.visitAt > Date.now()) {
      const caseId = await this.cases.onEvent(property.id, 'visit_scheduled');
      const visit = await this.prisma.db.visit.create({
        data: { tenantId, propertyId: property.id, contactId: contact.id, agentId: lead.agentId, leadId: lead.id, caseId, scheduledAt: data.visitAt, status: 'REQUESTED' },
      });
      await this.activity.log('visit', visit.id, `Visita solicitada desde el portal para ${property.code}`, caseId);
      await this.notifications.notify([lead.agentId], { type: 'visit', title: `Solicitud de visita · ${property.code}`, body: contact.fullName, link: '/app/visitas' });
    }
    return { ok: true };
  }
}
