import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Public, Roles } from '../auth/auth.decorators.js';
import { ownScope } from '../common/current.js';
import { requestContext } from '../common/request-context.js';
import { approxLocation } from '../geo/geo.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { compareProperties, pricePerM2 } from './compare.js';

const SELECT = {
  id: true, code: true, title: true, type: true, operation: true, status: true, price: true, currency: true, zone: true, city: true,
  areaM2: true, builtM2: true, bedrooms: true, bathrooms: true, parking: true, yearBuilt: true, features: true, latitude: true, longitude: true,
  images: { orderBy: { sortOrder: 'asc' as const }, take: 1, select: { id: true } },
} as const;
type Row = { price: unknown; features: unknown } & Record<string, unknown>;
const shape = (p: Row) => ({ ...p, price: Number(p.price), features: Array.isArray(p.features) ? (p.features as unknown[]).filter((f): f is string => typeof f === 'string') : [] });
const list = (raw: string | undefined) => [...new Set((raw ?? '').split(',').map((x) => x.trim()).filter(Boolean))];

/** Comparador de propiedades y datos para mapas. */
@Controller()
export class CompareController {
  constructor(private readonly prisma: PrismaService) {}

  private result(items: Array<Record<string, unknown>>, order: string[], key: 'id' | 'code') {
    const sorted = order.map((k) => items.find((p) => p[key] === k)).filter((p): p is Record<string, unknown> => !!p);
    return { properties: sorted, ...compareProperties(sorted as never) };
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('compare')
  async compare(@Query('ids') ids?: string) {
    const wanted = list(ids);
    if (wanted.length < 2 || wanted.length > 4) throw new BadRequestException('Elige de 2 a 4 propiedades para comparar');
    const rows = await this.prisma.db.property.findMany({ where: { id: { in: wanted }, ...ownScope() }, select: SELECT });
    return this.result(rows.map((r) => shape(r as unknown as Row)), wanted, 'id');
  }

  /** Comparador del portal: solo propiedades publicadas y con ubicación aproximada. */
  @Public()
  @Get('public/compare')
  async publicCompare(@Query('codes') codes?: string) {
    if (!requestContext.get()?.tenantId) throw new BadRequestException('Portal no disponible');
    const wanted = list(codes?.toUpperCase());
    if (wanted.length < 2 || wanted.length > 4) throw new BadRequestException('Elige de 2 a 4 propiedades para comparar');
    const rows = await this.prisma.db.property.findMany({ where: { code: { in: wanted }, isPublished: true, status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] } }, select: SELECT });
    const safe = rows.map(({ id, latitude, longitude, status, ...p }) => (void id, void status, { ...shape(p as Row), location: approxLocation(latitude as number | null, longitude as number | null, p.code as string) }));
    return this.result(safe as never, wanted, 'code');
  }

  /** Propiedades con ubicación, para el mapa del panel. */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('map/properties')
  async map() {
    const rows = await this.prisma.db.property.findMany({
      where: { ...ownScope(), latitude: { not: null }, longitude: { not: null }, status: { not: 'INACTIVE' } }, take: 2000,
      select: { id: true, code: true, title: true, status: true, operation: true, type: true, price: true, currency: true, zone: true, latitude: true, longitude: true, isPublished: true },
    });
    const total = await this.prisma.db.property.count({ where: { ...ownScope(), status: { not: 'INACTIVE' } } });
    return { items: rows.map((p) => ({ ...p, price: Number(p.price), ppm2: null })), withoutLocation: total - rows.length };
  }

  /** Mapa del portal: puntos aproximados de las propiedades publicadas. */
  @Public()
  @Get('public/map')
  async publicMap() {
    if (!requestContext.get()?.tenantId) throw new BadRequestException('Portal no disponible');
    const rows = await this.prisma.db.property.findMany({
      where: { isPublished: true, status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] }, latitude: { not: null }, longitude: { not: null } }, take: 1000,
      select: { code: true, title: true, operation: true, price: true, currency: true, zone: true, latitude: true, longitude: true, builtM2: true, areaM2: true },
    });
    return rows.map(({ latitude, longitude, ...p }) => ({ ...p, price: Number(p.price), ppm2: pricePerM2({ price: Number(p.price), builtM2: p.builtM2, areaM2: p.areaM2 }), location: approxLocation(latitude, longitude, p.code) }));
  }
}
