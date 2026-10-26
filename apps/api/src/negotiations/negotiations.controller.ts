import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { CasesService } from '../cases/cases.service.js';
import { ActivityService } from '../common/activity.service.js';
import { current, ownScope } from '../common/current.js';
import { RefsService } from '../common/refs.service.js';
import { money, optText, validate } from '../common/validate.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const optDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish());
const offerSchema = z.object({
  contactId: z.string().min(1),
  kind: z.enum(['OFFER', 'COUNTER']).default('OFFER'),
  amount: money,
  conditions: optText(5000),
});
const decideSchema = z.object({ status: z.enum(['ACCEPTED', 'REJECTED', 'WITHDRAWN']) });
const reservationSchema = z.object({
  contactId: z.string().min(1),
  amount: money,
  paidAt: z.coerce.date(),
  expiresAt: optDate,
  notes: optText(5000),
});
const fmt = (n: unknown, currency: string) => `${currency} ${Number(n).toLocaleString('es-BO')}`;
const DECISION = { ACCEPTED: 'aceptada', REJECTED: 'rechazada', WITHDRAWN: 'retirada' } as const;

/** Paso 6: ofertas, contraofertas y reservas. Todo queda en el historial. */
@Controller()
export class NegotiationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly refs: RefsService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private async openCase(id: string) {
    const found = await this.prisma.db.commercialCase.findFirst({
      where: { id, ...ownScope() },
      include: { property: { select: { id: true, code: true, status: true } } },
    });
    if (!found) throw new NotFoundException('Expediente no encontrado');
    if (found.status !== 'OPEN') throw new BadRequestException('Este expediente ya está cerrado');
    return found;
  }

  /** Expedientes abiertos con negociación en marcha. */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('negotiations')
  async list() {
    const rows = await this.prisma.db.commercialCase.findMany({
      where: { ...ownScope(), status: 'OPEN', offers: { some: {} } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        property: { select: { id: true, code: true, title: true } },
        agent: { select: { id: true, fullName: true } },
        offers: { orderBy: { createdAt: 'desc' }, include: { contact: { select: { id: true, fullName: true } } } },
        reservations: { where: { status: 'ACTIVE' }, select: { id: true, amount: true, currency: true } },
      },
    });
    return rows.map(({ offers, ...c }) => ({ ...c, lastOffer: offers[0], offerCount: offers.length, pending: offers.filter((o) => o.status === 'PENDING').length }));
  }

  @Roles('ADMIN', 'AGENT')
  @Post('cases/:id/offers')
  async createOffer(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(offerSchema, body);
    const me = current();
    const found = await this.openCase(id);
    await this.refs.assert({ contactId: data.contactId });
    const contact = await this.prisma.db.contact.findUniqueOrThrow({ where: { id: data.contactId }, select: { fullName: true } });

    const offer = await this.prisma.db.offer.create({
      data: { ...data, tenantId: me.tenantId, caseId: id, currency: found.currency, createdById: me.userId },
    });
    await this.prisma.db.lead.updateMany({
      where: { caseId: id, contactId: data.contactId, status: { notIn: ['CLOSED', 'LOST', 'RESERVED'] } },
      data: { status: 'NEGOTIATION' },
    });
    await this.cases.onEvent(found.property.id, 'offer');
    const text = data.kind === 'OFFER'
      ? `Oferta de ${contact.fullName} por ${fmt(data.amount, found.currency)}`
      : `Contraoferta a ${contact.fullName} por ${fmt(data.amount, found.currency)}`;
    await this.activity.log('case', id, text);
    await this.notifications.notify([found.agentId, ...(await this.notifications.admins())], {
      type: 'offer', title: `${text} · ${found.property.code}`, link: `/app/gestion/${id}`,
    });
    return offer;
  }

  @Roles('ADMIN', 'AGENT')
  @Patch('offers/:id')
  async decide(@Param('id') id: string, @Body() body: unknown) {
    const { status } = validate(decideSchema, body);
    const offer = await this.prisma.db.offer.findUnique({ where: { id }, include: { contact: { select: { fullName: true } } } });
    if (!offer) throw new NotFoundException('Oferta no encontrada');
    const found = await this.openCase(offer.caseId);
    if (offer.status !== 'PENDING') throw new BadRequestException('Esta oferta ya fue resuelta');

    await this.prisma.db.offer.update({ where: { id }, data: { status, decidedAt: new Date() } });
    if (status === 'ACCEPTED') {
      // Aceptar una oferta descarta las demás pendientes y fija al cliente del expediente.
      await this.prisma.db.offer.updateMany({ where: { caseId: offer.caseId, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: new Date() } });
      await this.prisma.db.commercialCase.update({ where: { id: offer.caseId }, data: { clientId: offer.contactId } });
    }
    const what = offer.kind === 'OFFER' ? 'Oferta' : 'Contraoferta';
    await this.activity.log('case', offer.caseId, `${what} de ${fmt(offer.amount, offer.currency)} ${DECISION[status]} (${offer.contact.fullName})`);
    if (status === 'ACCEPTED') {
      await this.notifications.notify([found.agentId, ...(await this.notifications.admins())], {
        type: 'offer', title: `Oferta aceptada · ${found.property.code}`, body: `${offer.contact.fullName} por ${fmt(offer.amount, offer.currency)}`, link: `/app/gestion/${offer.caseId}`,
      });
    }
    return { id };
  }

  @Roles('ADMIN', 'AGENT')
  @Post('cases/:id/reservations')
  async reserve(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(reservationSchema, body);
    const me = current();
    const found = await this.openCase(id);
    await this.refs.assert({ contactId: data.contactId });
    if (await this.prisma.db.reservation.count({ where: { caseId: id, status: 'ACTIVE' } })) {
      throw new BadRequestException('Este expediente ya tiene una reserva activa');
    }
    const contact = await this.prisma.db.contact.findUniqueOrThrow({ where: { id: data.contactId }, select: { fullName: true } });
    const reservation = await this.prisma.db.reservation.create({ data: { ...data, tenantId: me.tenantId, caseId: id, currency: found.currency } });
    await this.prisma.db.property.update({ where: { id: found.property.id }, data: { status: 'RESERVED' } });
    await this.prisma.db.commercialCase.update({ where: { id }, data: { clientId: data.contactId } });
    await this.prisma.db.lead.updateMany({ where: { caseId: id, contactId: data.contactId, status: { notIn: ['CLOSED', 'LOST'] } }, data: { status: 'RESERVED' } });
    await this.cases.onEvent(found.property.id, 'offer');
    // La negociación en curso no debe devolver la propiedad a "en negociación" mientras haya reserva.
    await this.prisma.db.property.update({ where: { id: found.property.id }, data: { status: 'RESERVED' } });
    await this.activity.log('case', id, `Reserva de ${fmt(data.amount, found.currency)} registrada a nombre de ${contact.fullName}`);
    await this.activity.log('property', found.property.id, 'Propiedad reservada', id);
    await this.notifications.notify([found.agentId, ...(await this.notifications.admins())], {
      type: 'reservation', title: `Reserva registrada · ${found.property.code}`, body: `${contact.fullName} · ${fmt(data.amount, found.currency)}`, link: `/app/gestion/${id}`,
    });
    return reservation;
  }

  @Roles('ADMIN', 'AGENT')
  @Patch('reservations/:id/cancel')
  async cancelReservation(@Param('id') id: string) {
    const reservation = await this.prisma.db.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('Reserva no encontrada');
    const found = await this.openCase(reservation.caseId);
    if (reservation.status !== 'ACTIVE') throw new BadRequestException('Esta reserva ya no está activa');
    await this.prisma.db.reservation.update({ where: { id }, data: { status: 'CANCELLED' } });
    if (found.property.status === 'RESERVED') {
      await this.prisma.db.property.update({ where: { id: found.property.id }, data: { status: 'NEGOTIATING' } });
    }
    await this.prisma.db.lead.updateMany({ where: { caseId: reservation.caseId, contactId: reservation.contactId, status: 'RESERVED' }, data: { status: 'NEGOTIATION' } });
    await this.activity.log('case', reservation.caseId, `Reserva de ${fmt(reservation.amount, reservation.currency)} cancelada`);
    return { id };
  }
}
