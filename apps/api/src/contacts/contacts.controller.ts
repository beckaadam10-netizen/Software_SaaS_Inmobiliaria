import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { canAssign, current, ownScope } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { RefsService } from '../common/refs.service.js';
import { currency, defined, optEmail, optId, optInt, optNumber, optText, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';

const contactType = z.enum(['PROSPECT', 'BUYER', 'TENANT', 'OWNER', 'INVESTOR', 'COMPANY']);
const operation = z.enum(['SALE', 'RENT', 'ANTICRETICO']);
const propertyType = z.enum(['HOUSE', 'APARTMENT', 'LAND', 'OFFICE', 'COMMERCIAL', 'WAREHOUSE', 'OTHER']);

const fields = {
  type: contactType.default('PROSPECT'),
  fullName: text(),
  email: optEmail,
  phone: optText(30),
  notes: optText(5000),
  prefOperation: operation.nullish(),
  prefType: propertyType.nullish(),
  prefZone: optText(),
  prefBudgetMax: optNumber(),
  prefCurrency: currency.nullish(),
  prefBedrooms: optInt(0, 50),
  assignedAgentId: optId,
};
const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, type: contactType.optional(), fullName: text().optional() });

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly refs: RefsService,
    private readonly activity: ActivityService,
  ) {}

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get()
  list(@Query('q') q?: string, @Query('type') type?: string) {
    const parsedType = contactType.safeParse(type);
    return this.prisma.db.contact.findMany({
      where: {
        ...ownScope('assignedAgentId'),
        ...(parsedType.success ? { type: parsedType.data } : {}),
        ...(q?.trim()
          ? { OR: [{ fullName: { contains: q.trim() } }, { email: { contains: q.trim() } }, { phone: { contains: q.trim() } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { assignedAgent: { select: { id: true, fullName: true } }, _count: { select: { leads: true, ownedProperties: true } } },
    });
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get(':id')
  async get(@Param('id') id: string) {
    const contact = await this.prisma.db.contact.findFirst({
      where: { id, ...ownScope('assignedAgentId') },
      include: {
        assignedAgent: { select: { id: true, fullName: true } },
        ownedProperties: { select: { id: true, code: true, title: true, status: true } },
        leads: { orderBy: { createdAt: 'desc' }, include: { property: { select: { code: true, title: true } } } },
        visits: { orderBy: { scheduledAt: 'desc' }, include: { property: { select: { code: true, title: true } } } },
      },
    });
    if (!contact) throw new NotFoundException('Contacto no encontrado');
    return { ...contact, timeline: await this.activity.forEntity('contact', id) };
  }

  @Roles('ADMIN', 'AGENT')
  @Post()
  async create(@Body() body: unknown) {
    const data = validate(createSchema, body);
    const me = current();
    await this.limits.assertCanAdd('contacts');
    // Un agente siempre queda como responsable de los contactos que registra.
    const assignedAgentId = canAssign() ? await this.refs.agentFor(data.assignedAgentId, null) : me.userId;
    await this.refs.assert({ agentId: assignedAgentId });
    const contact = await this.prisma.db.contact.create({ data: { ...data, assignedAgentId, tenantId: me.tenantId } });
    await this.activity.log('contact', contact.id, 'Contacto registrado');
    return contact;
  }

  @Roles('ADMIN', 'AGENT')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(updateSchema, body);
    const found = await this.prisma.db.contact.count({ where: { id, ...ownScope('assignedAgentId') } });
    if (!found) throw new NotFoundException('Contacto no encontrado');
    if (!canAssign()) delete data.assignedAgentId;
    else if (data.assignedAgentId) await this.refs.assertAssignable(data.assignedAgentId);
    await this.refs.assert({ agentId: data.assignedAgentId });
    return this.prisma.db.contact.update({ where: { id }, data: defined(data) });
  }
}
