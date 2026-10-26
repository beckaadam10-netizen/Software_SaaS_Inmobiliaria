import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { AutomationsService } from '../automations/automations.service.js';
import { CasesService } from '../cases/cases.service.js';
import { ActivityService } from '../common/activity.service.js';
import { canAssign, current, ownScope } from '../common/current.js';
import { RefsService } from '../common/refs.service.js';
import { defined, optId, optText, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';

const statusEnum = z.enum(['REQUESTED', 'CONFIRMED', 'RESCHEDULED', 'DONE', 'CANCELLED', 'NO_SHOW']);
const STATUS_LABEL: Record<z.infer<typeof statusEnum>, string> = {
  REQUESTED: 'Solicitada', CONFIRMED: 'Confirmada', RESCHEDULED: 'Reprogramada', DONE: 'Realizada', CANCELLED: 'Cancelada', NO_SHOW: 'No asistió',
};
const createSchema = z.object({
  propertyId: z.string().min(1),
  contactId: z.string().min(1),
  agentId: optId,
  leadId: optId,
  scheduledAt: z.coerce.date(),
  status: z.enum(['REQUESTED', 'CONFIRMED']).default('CONFIRMED'),
  notes: optText(5000),
});
const updateSchema = z.object({
  status: statusEnum.optional(),
  scheduledAt: z.coerce.date().optional(),
  agentId: optId,
  notes: optText(5000),
  result: optText(5000),
});

const fmt = (d: Date) => d.toLocaleString('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/La_Paz' });

@Controller('visits')
export class VisitsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: RefsService,
    private readonly activity: ActivityService,
    private readonly cases: CasesService,
    private readonly automations: AutomationsService,
  ) {}

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get()
  list(@Query() query: Record<string, string>) {
    const s = statusEnum.safeParse(query.status);
    const from = z.coerce.date().safeParse(query.from);
    const to = z.coerce.date().safeParse(query.to);
    return this.prisma.db.visit.findMany({
      where: {
        ...ownScope(),
        ...(s.success ? { status: s.data } : {}),
        ...(query.from || query.to
          ? { scheduledAt: { ...(query.from && from.success ? { gte: from.data } : {}), ...(query.to && to.success ? { lte: to.data } : {}) } }
          : {}),
      },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
      include: {
        property: { select: { id: true, code: true, title: true, zone: true } },
        contact: { select: { id: true, fullName: true, phone: true } },
        agent: { select: { id: true, fullName: true } },
      },
    });
  }

  @Roles('ADMIN', 'AGENT')
  @Post()
  async create(@Body() body: unknown) {
    const data = validate(createSchema, body);
    const me = current();
    const property = await this.prisma.db.property.findFirst({ where: { id: data.propertyId, ...ownScope() }, select: { id: true, code: true, agentId: true } });
    if (!property) throw new NotFoundException('Propiedad no encontrada');
    const agentId = canAssign() ? await this.refs.agentFor(data.agentId, property.agentId) : me.userId;
    await this.refs.assert({ contactId: data.contactId, agentId, leadId: data.leadId });

    const caseId = await this.cases.onEvent(property.id, 'visit_scheduled');
    const visit = await this.prisma.db.visit.create({ data: { ...data, agentId, caseId, tenantId: me.tenantId } });
    if (data.leadId) {
      await this.prisma.db.lead.updateMany({
        where: { id: data.leadId, status: { in: ['NEW', 'CONTACTED', 'QUALIFIED', 'INTERESTED'] } },
        data: { status: 'VISIT' },
      });
    }
    await this.activity.log('visit', visit.id, `Visita agendada a ${property.code} para el ${fmt(visit.scheduledAt)}`, caseId);
    return visit;
  }

  @Roles('ADMIN', 'AGENT')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(updateSchema, body);
    const before = await this.prisma.db.visit.findFirst({ where: { id, ...ownScope() } });
    if (!before) throw new NotFoundException('Visita no encontrada');
    if (!canAssign()) delete data.agentId;
    else if (data.agentId) await this.refs.assertAssignable(data.agentId);
    await this.refs.assert({ agentId: data.agentId });

    const next = { ...defined(data) } as Record<string, unknown>;
    // Cambiar la fecha de una visita ya programada la marca como reprogramada.
    if (data.scheduledAt && +data.scheduledAt !== +before.scheduledAt && !data.status) next.status = 'RESCHEDULED';
    const visit = await this.prisma.db.visit.update({ where: { id }, data: next });

    if (visit.status !== before.status) {
      await this.activity.log('visit', id, `Visita: ${STATUS_LABEL[visit.status]}${visit.status === 'RESCHEDULED' ? ` para el ${fmt(visit.scheduledAt)}` : ''}`, before.caseId);
      if (visit.status === 'DONE') {
        const caseId = await this.cases.onEvent(before.propertyId, 'visit_done');
        if (caseId) await this.activity.log('case', caseId, 'Visita realizada. Corresponde hacer el seguimiento post-visita');
        const who = await this.prisma.db.contact.findUnique({ where: { id: visit.contactId }, select: { fullName: true } });
        await this.automations.onVisitDone(visit, who?.fullName ?? 'el cliente');
      }
    }
    return visit;
  }
}
