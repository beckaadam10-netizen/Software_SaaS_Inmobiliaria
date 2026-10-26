import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { requestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const WEBHOOK_EVENTS = ['lead.created', 'visit.scheduled', 'offer.received', 'case.won', 'case.lost'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | 'ping';

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:/i];

/** Avisos a sistemas externos. Cada envío va firmado con el secreto del webhook. */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Motivo por el que una dirección no sirve como destino, o null si sirve. Evita que se use para alcanzar la red interna. */
  async urlError(raw: string): Promise<string | null> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return 'La dirección no es válida';
    }
    const allowPrivate = this.config.get<string>('WEBHOOK_ALLOW_PRIVATE') === '1';
    if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) return 'La dirección debe empezar con https://';
    if (allowPrivate) return null;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
    if (!addresses.length) return 'No se pudo resolver esa dirección';
    return addresses.some((a) => PRIVATE.some((re) => re.test(a))) || host === 'localhost' ? 'No se admiten direcciones de redes internas' : null;
  }

  /** Avisa a los webhooks suscritos de la empresa en curso. No bloquea ni interrumpe la operación que lo dispara. */
  async emit(event: WebhookEvent, data: Record<string, unknown>) {
    const tenantId = requestContext.get()?.tenantId;
    if (!tenantId) return;
    try {
      const hooks = await this.prisma.platform.webhook.findMany({ where: { tenantId, isActive: true } });
      for (const h of hooks.filter((x) => (x.events as string[]).includes(event))) void this.deliver(h, event, data);
    } catch (e) {
      this.logger.error(`No se pudo preparar el webhook ${event}: ${e}`);
    }
  }

  async deliver(hook: { id: string; tenantId: string; url: string; secret: string }, event: WebhookEvent, data: Record<string, unknown>) {
    const body = JSON.stringify({ event, createdAt: new Date().toISOString(), data });
    let status: number | null = null, error: string | null = null;
    try {
      const blocked = await this.urlError(hook.url);
      if (blocked) throw new Error(blocked);
      const res = await fetch(hook.url, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000), body,
        headers: { 'content-type': 'application/json', 'user-agent': 'Soft_Inmo-Webhooks/1', 'x-softinmo-event': event, 'x-softinmo-signature': `sha256=${createHmac('sha256', hook.secret).update(body).digest('hex')}` },
      });
      status = res.status;
      if (!res.ok) error = `El destino respondió ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 180) : 'Error de conexión';
    }
    await this.prisma.platform.webhookDelivery.create({ data: { tenantId: hook.tenantId, webhookId: hook.id, event, ok: !error, status, error } }).catch(() => undefined);
    return { ok: !error, status, error };
  }
}
