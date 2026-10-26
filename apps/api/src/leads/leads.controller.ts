import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { canAssign, current, ownScope } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { RefsService } from '../common/refs.service.js';
import { defined, optEmail, optId, optInt, optText, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LeadsService } from './leads.service.js';

const statusEnum = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'INTERESTED', 'VISIT', 'NEGOTIATION', 'RESERVED', 'CLOSED', 'LOST']);
const sourceEnum = z.enum(['WEB', 'WHATSAPP', 'CALL', 'REFERRAL', 'SOCIAL', 'QR', 'WALK_IN', 'OTHER']);
const STATUS_LABEL: Record<z.infer<typeof statusEnum>, string> = {
  NEW: 'Nuevo', CONTACTED: 'Contactado', QUALIFIED: 'Calificado', INTERESTED: 'Interesado', VISIT: 'Visita',
  NEGOTIATION: 'Negociación', RESERVED: 'Reserva', CLOSED: 'Cerrado', LOST: 'Perdido',
};

const createSchema = z.object({
  contactId: optId,
  newContact: z.object({ fullName: text(), phone: optText(30), email: optEmail }).optional(),
  propertyId: optId,
  agentId: optId,
  source: sourceEnum.default('OTHER'),
  message: optText(5000),
});
const updateSchema = z.object({
  status: statusEnum.optional(),
  agentId: optId,
  score: optInt(0, 100),
  message: optText(5000),
});

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly refs: RefsService,
    private readonly limits: LimitsService,
    private readonly activity: ActivityService,
  ) {}

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get()
  list(@Query('status') status?: string) {
    const parsed = statusEnum.safeParse(status);
    return this.prisma.db.lead.findMany({
      where: { ...ownScope(), ...(parsed.success ? { status: parsed.data } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        contact: { select: { id: true, fullName: true, phone: true, email: true } },
        property: { select: { id: true, code: true, title: true } },
        agent: { select: { id: true, fullName: true } },
      },
    });
  }

  @Roles('ADMIN', 'AGENT')
  @Post()
  async create(@Body() body: unknown) {
    const data = validate(createSchema, body);
    const me = current();
    if (!data.contactId && !data.newContact) throw new BadRequestException('Indica un contacto existente o los datos de uno nuevo');
    const agentId = canAssign() ? await this.refs.agentFor(data.agentId, null) : me.userId;
    await this.refs.assert({ contactId: data.contactId, propertyId: data.propertyId, agentId });

    let contactId = data.contactId ?? null;
    if (!contactId && data.newContact) {
      await this.limits.assertCanAdd('contacts');
      const contact = await this.prisma.db.contact.create({
        data: { ...data.newContact, tenantId: me.tenantId, assignedAgentId: agentId },
      });
      contactId = contact.id;
    }
    return this.leads.create({ contactId: contactId!, propertyId: data.propertyId, agentId, source: data.source, message: data.message });
  }

  @Roles('ADMIN', 'AGENT')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(updateSchema, body);
    const before = await this.prisma.db.lead.findFirst({ where: { id, ...ownScope() } });
    if (!before) throw new NotFoundException('Lead no encontrado');
    if (!canAssign()) delete data.agentId;
    else if (data.agentId) await this.refs.assertAssignable(data.agentId);
    await this.refs.assert({ agentId: data.agentId });
    const { score, ...rest } = data;
    const lead = await this.prisma.db.lead.update({ where: { id }, data: { ...defined(rest), ...(score != null ? { score } : {}) } });
    if (data.status && data.status !== before.status) {
      await this.activity.log('lead', id, `Lead pasó de ${STATUS_LABEL[before.status]} a ${STATUS_LABEL[data.status]}`, before.caseId);
    }
    return lead;
  }
}
