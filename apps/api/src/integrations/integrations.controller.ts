import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WEBHOOK_EVENTS, WebhooksService } from './webhooks.service.js';

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const webhookSchema = z.object({ url: text(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, 'Elige al menos un evento') });

/** Claves de API y webhooks: conectan Soft_Inmo con otros sistemas. Solo el administrador. */
@Roles('ADMIN')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly webhooks: WebhooksService,
  ) {}

  private gate() {
    return this.limits.assertFeature('integrations', 'Las integraciones');
  }
  private hookView = (h: { id: string; url: string; events: unknown; isActive: boolean; createdAt: Date; deliveries?: unknown[] }) => ({ id: h.id, url: h.url, events: h.events, isActive: h.isActive, createdAt: h.createdAt, deliveries: h.deliveries ?? [] });

  @Get()
  async overview() {
    await this.gate();
    const [keys, hooks] = await Promise.all([
      this.prisma.db.apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true } }),
      this.prisma.db.webhook.findMany({ orderBy: { createdAt: 'desc' }, include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 5, select: { event: true, ok: true, status: true, error: true, createdAt: true } } } }),
    ]);
    return { keys, webhooks: hooks.map(this.hookView), events: WEBHOOK_EVENTS };
  }

  /** La clave completa se devuelve una sola vez; en la base queda solo su huella. */
  @Post('keys')
  async createKey(@Body() body: unknown) {
    await this.gate();
    const { name } = validate(z.object({ name: text(80) }), body);
    if ((await this.prisma.db.apiKey.count({ where: { revokedAt: null } })) >= 10) throw new BadRequestException('Puedes tener hasta 10 claves activas');
    const key = `si_live_${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.db.apiKey.create({ data: { tenantId: current().tenantId, name, prefix: key.slice(0, 12), hash: hashKey(key) }, select: { id: true, name: true, prefix: true, createdAt: true } });
    return { ...row, key };
  }

  @Delete('keys/:id')
  async revokeKey(@Param('id') id: string) {
    const { count } = await this.prisma.db.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw new NotFoundException('Clave no encontrada');
    return { id };
  }

  @Post('webhooks')
  async createWebhook(@Body() body: unknown) {
    await this.gate();
    const data = validate(webhookSchema, body);
    const error = await this.webhooks.urlError(data.url);
    if (error) throw new BadRequestException(error);
    if ((await this.prisma.db.webhook.count()) >= 10) throw new BadRequestException('Puedes tener hasta 10 webhooks');
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.db.webhook.create({ data: { tenantId: current().tenantId, url: data.url, events: data.events, secret } });
    return { ...this.hookView(row), secret };
  }

  @Patch('webhooks/:id')
  async toggleWebhook(@Param('id') id: string, @Body() body: unknown) {
    const { isActive } = validate(z.object({ isActive: z.boolean() }), body);
    const { count } = await this.prisma.db.webhook.updateMany({ where: { id }, data: { isActive } });
    if (!count) throw new NotFoundException('Webhook no encontrado');
    return { id, isActive };
  }

  @Delete('webhooks/:id')
  async removeWebhook(@Param('id') id: string) {
    const { count } = await this.prisma.db.webhook.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Webhook no encontrado');
    return { id };
  }

  /** Envía un aviso de prueba y devuelve qué respondió el destino. */
  @Post('webhooks/:id/test')
  async testWebhook(@Param('id') id: string) {
    const hook = await this.prisma.db.webhook.findFirst({ where: { id } });
    if (!hook) throw new NotFoundException('Webhook no encontrado');
    return this.webhooks.deliver(hook, 'ping', { message: 'Aviso de prueba de Soft_Inmo' });
  }
}
