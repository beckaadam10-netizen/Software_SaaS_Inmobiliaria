import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { assertCan, current, ownScope } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { currency, defined, optNumber, optText, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';

const channel = z.enum(['PORTAL', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'WHATSAPP', 'EXTERNAL_PORTAL', 'PRINT', 'OTHER']);
const CHANNEL_LABEL: Record<z.infer<typeof channel>, string> = {
  PORTAL: 'Portal propio', FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', TIKTOK: 'TikTok', WHATSAPP: 'WhatsApp',
  EXTERNAL_PORTAL: 'Portal inmobiliario', PRINT: 'Material impreso', OTHER: 'Otro',
};
const optDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish());
const optUrl = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(500).regex(/^https?:\/\//i, 'Debe empezar con http:// o https://').nullish());
const publicationSchema = z.object({ channel, url: optUrl, notes: optText(2000) });
const publicationUpdate = z.object({ isActive: z.boolean().optional(), url: optUrl, notes: optText(2000) });
const campaignFields = {
  name: text(), channel, budget: optNumber(0, 1e9), currency: currency.default('BOB'),
  startsAt: optDate, endsAt: optDate, status: z.enum(['PLANNED', 'ACTIVE', 'FINISHED']).default('PLANNED'), notes: optText(5000),
};
const campaignCreate = z.object(campaignFields);
const campaignUpdate = z.object(campaignFields).partial();

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });

@Controller()
export class MarketingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly activity: ActivityService,
  ) {}

  private async property(id: string) {
    const p = await this.prisma.db.property.findFirst({ where: { id, ...ownScope() }, select: { id: true, code: true, viewCount: true } });
    if (!p) throw new NotFoundException('Propiedad no encontrada');
    return p;
  }

  /** Estadísticas de la publicación: vistas por fuente y por día, escaneos de QR y favoritos. Solo datos reales y agregados. */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('properties/:id/stats')
  async stats(@Param('id') id: string) {
    const p = await this.property(id);
    const since = dayKey(new Date(Date.now() - 13 * DAY));
    const [bySource, recent, favorites, leads, visits] = await Promise.all([
      this.prisma.db.propertyStat.groupBy({ by: ['source'], where: { propertyId: id }, _sum: { views: true } }),
      this.prisma.db.propertyStat.groupBy({ by: ['day'], where: { propertyId: id, day: { gte: since } }, _sum: { views: true } }),
      this.prisma.db.favorite.count({ where: { propertyId: id } }),
      this.prisma.db.lead.count({ where: { propertyId: id } }),
      this.prisma.db.visit.count({ where: { propertyId: id } }),
    ]);
    const perDay = new Map(recent.map((r) => [r.day, r._sum.views ?? 0]));
    const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(Date.now() - (13 - i) * DAY)));
    const sources = Object.fromEntries(bySource.map((r) => [r.source, r._sum.views ?? 0]));
    return {
      views: p.viewCount, favorites, leads, visits, qrScans: sources.QR ?? 0, sources,
      daily: days.map((day) => ({ day, views: perDay.get(day) ?? 0 })),
    };
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('properties/:id/publications')
  async publications(@Param('id') id: string) {
    await this.property(id);
    return this.prisma.db.publication.findMany({ where: { propertyId: id }, orderBy: { publishedAt: 'desc' } });
  }

  @Roles('ADMIN', 'AGENT')
  @Post('properties/:id/publications')
  async publish(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(publicationSchema, body);
    await this.property(id);
    const pub = await this.prisma.db.publication.create({ data: { ...data, tenantId: current().tenantId, propertyId: id } });
    await this.activity.log('property', id, `Publicada en ${CHANNEL_LABEL[data.channel]}`);
    return pub;
  }

  @Roles('ADMIN', 'AGENT')
  @Patch('publications/:id')
  async updatePublication(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(publicationUpdate, body);
    const pub = await this.prisma.db.publication.findUnique({ where: { id } });
    if (!pub) throw new NotFoundException('Publicación no encontrada');
    await this.property(pub.propertyId);
    return this.prisma.db.publication.update({ where: { id }, data: defined(data) });
  }

  /** Centro de marketing: de dónde llegan las vistas y los leads. */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('marketing/overview')
  async overview() {
    await this.limits.assertFeature('marketing', 'El centro de marketing');
    const own = ownScope();
    const since = dayKey(new Date(Date.now() - 29 * DAY));
    const mine = Object.keys(own).length ? { property: own } : {};
    const [leadSources, viewSources, top, activePublications, favorites] = await Promise.all([
      this.prisma.db.lead.groupBy({ by: ['source'], where: { ...own, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, _count: { _all: true } }),
      this.prisma.db.propertyStat.groupBy({ by: ['source'], where: { day: { gte: since }, ...mine }, _sum: { views: true } }),
      this.prisma.db.property.findMany({
        where: { ...own, isPublished: true }, orderBy: { viewCount: 'desc' }, take: 8,
        select: { id: true, code: true, title: true, viewCount: true, _count: { select: { leads: true, favorites: true } } },
      }),
      this.prisma.db.publication.count({ where: { isActive: true, ...mine } }),
      this.prisma.db.favorite.count({ where: mine }),
    ]);
    return {
      leadsBySource: Object.fromEntries(leadSources.map((r) => [r.source, r._count._all])),
      viewsBySource: Object.fromEntries(viewSources.map((r) => [r.source, r._sum.views ?? 0])),
      topProperties: top, activePublications, favorites,
    };
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('campaigns')
  async campaigns() {
    await this.limits.assertFeature('marketing', 'El centro de marketing');
    return this.prisma.db.campaign.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Roles('ADMIN', 'AGENT')
  @Post('campaigns')
  async createCampaign(@Body() body: unknown) {
    assertCan('manage_campaigns', 'Tu usuario no puede gestionar campañas. Pídeselo al administrador.');
    await this.limits.assertFeature('marketing', 'El centro de marketing');
    const data = validate(campaignCreate, body);
    return this.prisma.db.campaign.create({ data: { ...data, tenantId: current().tenantId } });
  }

  @Roles('ADMIN', 'AGENT')
  @Patch('campaigns/:id')
  async updateCampaign(@Param('id') id: string, @Body() body: unknown) {
    assertCan('manage_campaigns', 'Tu usuario no puede gestionar campañas. Pídeselo al administrador.');
    const data = validate(campaignUpdate, body);
    if (!(await this.prisma.db.campaign.count({ where: { id } }))) throw new NotFoundException('Campaña no encontrada');
    return this.prisma.db.campaign.update({ where: { id }, data: defined(data) });
  }
}
