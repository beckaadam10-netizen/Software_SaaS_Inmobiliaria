import { BadRequestException, Body, Controller, Get, HttpCode, HttpException, NotFoundException, Param, Patch, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Public, Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { current, ownScope } from '../common/current.js';
import { requestContext } from '../common/request-context.js';
import { optInt, optText, text, validate } from '../common/validate.js';
import { LeadsService } from '../leads/leads.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { avatarUrl } from '../users/avatar.js';

const postSaleSchema = z.object({
  deliveredAt: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish()),
  satisfaction: optInt(1, 5),
  testimonial: optText(2000),
  testimonialPublic: z.boolean().default(false),
  notes: optText(5000),
});
const referralSchema = z.object({ fullName: text(120), phone: optText(30), notes: optText(2000) });
const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Elige de 1 a 5 estrellas').max(5, 'Elige de 1 a 5 estrellas'),
  text: z.string().trim().min(10, 'Cuéntanos un poco más (al menos 10 letras)').max(1000, 'Máximo 1000 letras'),
  publish: z.boolean().default(true),
});
const OPERATION_LABEL: Record<string, string> = { SALE: 'compra', RENT: 'alquiler', ANTICRETICO: 'anticrético' };
const firstName = (name?: string | null) => name?.trim().split(/\s+/)[0] ?? 'Cliente';
/** Freno contra abuso del formulario público de reseñas: 10 intentos cada 15 minutos por IP y enlace. */
const tries = new Map<string, number[]>();

const statusSchema = z.object({ status: z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'DISCARDED']) });

/** Paso 8: entrega, satisfacción, testimonio y referidos de las operaciones ganadas. */
@Controller()
export class PostSaleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly leads: LeadsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async wonCase(id: string) {
    const found = await this.prisma.db.commercialCase.findFirst({
      where: { id, ...ownScope() },
      include: { client: { select: { id: true, fullName: true } }, property: { select: { code: true } } },
    });
    if (!found) throw new NotFoundException('Expediente no encontrado');
    if (found.status !== 'WON') throw new BadRequestException('La postventa empieza cuando la operación se cierra como ganada');
    return found;
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('post-sale')
  list() {
    return this.prisma.db.commercialCase.findMany({
      where: { ...ownScope(), status: 'WON' },
      orderBy: { closedAt: 'desc' },
      take: 200,
      select: {
        id: true, code: true, operation: true, closedAt: true, closedPrice: true, currency: true,
        property: { select: { code: true, title: true } },
        client: { select: { id: true, fullName: true, phone: true } },
        agent: { select: { fullName: true } },
        postSale: true,
        _count: { select: { referrals: true } },
      },
    });
  }

  @Roles('ADMIN', 'AGENT')
  @Put('cases/:id/post-sale')
  async save(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(postSaleSchema, body);
    const me = current();
    await this.wonCase(id);
    if (data.testimonialPublic && !data.testimonial) throw new BadRequestException('Escribe el testimonio antes de publicarlo');
    const before = await this.prisma.db.postSale.findFirst({ where: { caseId: id } });
    // La reseña que escribió el cliente por enlace no se reemplaza desde el panel.
    if (before?.reviewedAt) { delete (data as Partial<typeof data>).satisfaction; delete (data as Partial<typeof data>).testimonial; delete (data as Partial<typeof data>).testimonialPublic; }
    // PostSale tiene caseId único global: se busca dentro de la empresa y luego se actualiza por id.
    const saved = before
      ? await this.prisma.db.postSale.update({ where: { id: before.id }, data })
      : await this.prisma.db.postSale.create({ data: { ...data, tenantId: me.tenantId, caseId: id } });
    if (data.deliveredAt && !before?.deliveredAt) await this.activity.log('case', id, 'Inmueble entregado al cliente');
    if (data.satisfaction && data.satisfaction !== before?.satisfaction) await this.activity.log('case', id, `Satisfacción del cliente: ${data.satisfaction} de 5`);
    if (data.testimonial && !before?.testimonial) await this.activity.log('case', id, 'Testimonio del cliente registrado');
    return saved;
  }

  /** Un referido entra directo al embudo como contacto y lead con fuente "Referido". */
  @Roles('ADMIN', 'AGENT')
  @Post('cases/:id/referrals')
  async refer(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(referralSchema, body);
    const me = current();
    const found = await this.wonCase(id);
    const phone = data.phone ? data.phone.replace(/[^\d+]/g, '') : null;
    let contact = phone ? await this.prisma.db.contact.findFirst({ where: { phone } }) : null;
    contact ??= await this.prisma.db.contact.create({
      data: { tenantId: me.tenantId, fullName: data.fullName, phone, type: 'PROSPECT', assignedAgentId: found.agentId, notes: `Referido por ${found.client?.fullName ?? 'un cliente'}` },
    });
    const lead = await this.leads.create({
      contactId: contact.id, agentId: found.agentId, source: 'REFERRAL',
      message: `Referido por ${found.client?.fullName ?? 'un cliente'} (${found.property.code}).${data.notes ? ` ${data.notes}` : ''}`,
    });
    const referral = await this.prisma.db.referral.create({
      data: { tenantId: me.tenantId, caseId: id, fullName: data.fullName, phone, notes: data.notes ?? null, contactId: contact.id, leadId: lead.id },
    });
    await this.activity.log('case', id, `Referido registrado: ${data.fullName}`);
    await this.notifications.notify([found.agentId], { type: 'referral', title: `Nuevo referido: ${data.fullName}`, body: `De ${found.client?.fullName ?? 'un cliente'}`, link: '/app/leads' });
    return referral;
  }

  @Roles('ADMIN', 'AGENT')
  @Patch('referrals/:id')
  async updateReferral(@Param('id') id: string, @Body() body: unknown) {
    const { status } = validate(statusSchema, body);
    const referral = await this.prisma.db.referral.findUnique({ where: { id } });
    if (!referral || !(await this.prisma.db.commercialCase.count({ where: { id: referral.caseId, ...ownScope() } }))) {
      throw new NotFoundException('Referido no encontrado');
    }
    return this.prisma.db.referral.update({ where: { id }, data: { status } });
  }

  /**
   * Enlace de reseña: el agente lo envía al cliente cuando la operación se cierra como ganada.
   * Si ya existe, devuelve el mismo; el cliente puede escribir una sola reseña.
   */
  @Roles('ADMIN', 'AGENT')
  @Post('cases/:id/review-link')
  async reviewLink(@Param('id') id: string) {
    const me = current();
    const c = await this.wonCase(id);
    let ps = await this.prisma.db.postSale.findFirst({ where: { caseId: id } });
    if (ps?.reviewedAt) throw new BadRequestException('El cliente ya dejó su reseña');
    if (!ps?.reviewToken) {
      const reviewToken = randomBytes(24).toString('hex');
      ps = ps
        ? await this.prisma.db.postSale.update({ where: { id: ps.id }, data: { reviewToken, reviewRequestedAt: new Date() } })
        : await this.prisma.db.postSale.create({ data: { tenantId: me.tenantId, caseId: id, reviewToken, reviewRequestedAt: new Date() } });
      await this.activity.log('case', id, 'Enlace de reseña generado para el cliente');
    }
    const link = `/resena/${ps.reviewToken}`;
    const message = `Hola ${firstName(c.client?.fullName)}, gracias por confiar en nosotros. ¿Nos ayudas con una reseña de tu ${OPERATION_LABEL[c.operation] ?? 'operación'}? Toma un minuto: `;
    return { link, message, phone: (await this.prisma.db.contact.findFirst({ where: { id: c.client?.id ?? '' }, select: { phone: true } }))?.phone ?? null };
  }

  /** El administrador oculta o vuelve a mostrar una reseña publicada. */
  @Roles('ADMIN')
  @Patch('cases/:id/review')
  async hideReview(@Param('id') id: string, @Body() body: unknown) {
    const { hidden } = validate(z.object({ hidden: z.boolean() }), body);
    const ps = await this.prisma.db.postSale.findFirst({ where: { caseId: id } });
    if (!ps?.testimonial) throw new NotFoundException('Esta operación no tiene reseña');
    const updated = await this.prisma.db.postSale.update({ where: { id: ps.id }, data: { reviewHidden: hidden } });
    await this.activity.log('case', id, hidden ? 'Reseña ocultada del portal' : 'Reseña visible otra vez en el portal');
    return updated;
  }

  private async byReviewToken(token: string) {
    if (!requestContext.get()?.tenantId || !/^[a-f0-9]{48}$/.test(token)) throw new NotFoundException('Enlace no válido');
    const ps = await this.prisma.db.postSale.findFirst({
      where: { reviewToken: token },
      include: { case: { select: { id: true, code: true, operation: true, agentId: true, client: { select: { fullName: true } }, property: { select: { title: true, zone: true, city: true } }, agent: { select: { id: true, fullName: true, avatarFile: true } } } } },
    });
    if (!ps) throw new NotFoundException('Enlace no válido');
    return ps;
  }

  /** Página pública de la reseña: muestra a quién y qué se califica. No expone montos ni datos del cliente. */
  @Public()
  @Get('public/reviews/:token')
  async reviewPage(@Param('token') token: string) {
    const ps = await this.byReviewToken(token);
    const c = ps.case;
    return {
      clientName: firstName(c.client?.fullName), operation: c.operation, property: c.property.title, zone: [c.property.zone, c.property.city].filter(Boolean).join(', '),
      agent: c.agent ? { fullName: c.agent.fullName, avatar: avatarUrl(c.agent) } : null,
      done: !!ps.reviewedAt, review: ps.reviewedAt ? { rating: ps.satisfaction, text: ps.testimonial, publish: ps.testimonialPublic } : null,
    };
  }

  /** El cliente envía su reseña. Con su autorización se publica al instante en el portal. */
  @Public()
  @Post('public/reviews/:token')
  @HttpCode(200)
  async submitReview(@Param('token') token: string, @Body() body: unknown, @Req() req: Request) {
    const key = `${req.ip}|${token}`;
    const recent = (tries.get(key) ?? []).filter((t) => Date.now() - t < 15 * 60e3);
    if (recent.length >= 10) throw new HttpException('Demasiados intentos. Espera unos minutos.', 429);
    tries.set(key, [...recent, Date.now()]);
    if (tries.size > 5000) for (const [k, v] of tries) if (v.every((t) => Date.now() - t >= 15 * 60e3)) tries.delete(k);
    const data = validate(reviewSchema, body);
    const ps = await this.byReviewToken(token);
    if (ps.reviewedAt) throw new BadRequestException('Ya enviaste tu reseña. ¡Gracias!');
    await this.prisma.db.postSale.update({
      where: { id: ps.id },
      data: { satisfaction: data.rating, testimonial: data.text, testimonialPublic: data.publish, reviewedAt: new Date() },
    });
    await this.activity.log('case', ps.case.id, `Reseña del cliente: ${data.rating} de 5${data.publish ? ' (publicada en el portal)' : ' (sin publicar)'}`);
    await this.notifications.notify([ps.case.agentId, ...(await this.notifications.admins())], {
      type: 'case', title: `Nueva reseña: ${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)}`, body: `${firstName(ps.case.client?.fullName)} · ${ps.case.code}`, link: `/app/postventa`,
    });
    return { done: true, published: data.publish };
  }

  /** Testimonios que el cliente autorizó publicar. Solo nombre de pila y texto. */
  @Public()
  @Get('public/testimonials')
  async testimonials() {
    if (!requestContext.get()?.tenantId) throw new NotFoundException('Portal no disponible');
    const rows = await this.prisma.db.postSale.findMany({
      where: { testimonialPublic: true, reviewHidden: false, testimonial: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { testimonial: true, satisfaction: true, reviewedAt: true, updatedAt: true, case: { select: { operation: true, client: { select: { fullName: true } }, agent: { select: { id: true, fullName: true, avatarFile: true } } } } },
    });
    return rows.map((r) => ({
      text: r.testimonial, satisfaction: r.satisfaction, operation: r.case.operation, date: r.reviewedAt ?? r.updatedAt,
      author: firstName(r.case.client?.fullName),
      agent: r.case.agent ? { fullName: r.case.agent.fullName, avatar: avatarUrl(r.case.agent) } : null,
    }));
  }
}
