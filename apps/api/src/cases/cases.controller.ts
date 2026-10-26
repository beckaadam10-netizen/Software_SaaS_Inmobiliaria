import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { ownScope } from '../common/current.js';
import { RefsService } from '../common/refs.service.js';
import { defined, money, optId, optNumber, optText, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CasesService, STAGES } from './cases.service.js';

const stageEnum = z.enum(['CAPTATION', 'MARKETING', 'LEADS', 'VISIT', 'FOLLOW_UP', 'NEGOTIATION', 'LEGAL', 'POST_SALE']);
const optDate = z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish());

const createSchema = z.object({
  propertyId: z.string().min(1),
  isExclusive: z.boolean().optional(),
  commissionPct: optNumber(0, 100),
  captationEnds: optDate,
});
const updateSchema = z.object({
  clientId: optId,
  agentId: optId,
  isExclusive: z.boolean().optional(),
  commissionPct: optNumber(0, 100),
  captationEnds: optDate,
  price: money.optional(),
});
const stageSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'DONE']).optional(),
  notes: optText(5000),
});
const closeSchema = z.object({
  result: z.enum(['WON', 'LOST']),
  clientId: optId,
  closedPrice: optNumber(0, 1e11),
  lostReason: optText(),
});
const noteSchema = z.object({ note: z.string().trim().min(1).max(500) });

const listInclude = {
  property: { select: { id: true, code: true, title: true, zone: true, city: true, status: true } },
  agent: { select: { id: true, fullName: true } },
  client: { select: { id: true, fullName: true } },
  stages: { select: { stage: true, status: true } },
} as const;

@Controller('cases')
export class CasesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly refs: RefsService,
    private readonly activity: ActivityService,
  ) {}

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get()
  list(@Query('status') status?: string) {
    const parsed = z.enum(['OPEN', 'WON', 'LOST']).safeParse(status);
    return this.prisma.db.commercialCase.findMany({
      where: { ...ownScope(), ...(parsed.success ? { status: parsed.data } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 300,
      include: listInclude,
    });
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get(':id')
  async get(@Param('id') id: string) {
    const found = await this.prisma.db.commercialCase.findFirst({
      where: { id, ...ownScope() },
      include: {
        property: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } },
        owner: { select: { id: true, fullName: true, phone: true, email: true } },
        client: { select: { id: true, fullName: true, phone: true, email: true } },
        agent: { select: { id: true, fullName: true } },
        stages: true,
        leads: { orderBy: { createdAt: 'desc' }, include: { contact: { select: { id: true, fullName: true, phone: true } } } },
        visits: { orderBy: { scheduledAt: 'desc' }, include: { contact: { select: { id: true, fullName: true } } } },
        offers: { orderBy: { createdAt: 'desc' }, include: { contact: { select: { id: true, fullName: true } } } },
        reservations: { orderBy: { createdAt: 'desc' }, include: { contact: { select: { id: true, fullName: true } } } },
        referrals: { orderBy: { createdAt: 'desc' } },
        postSale: true,
        commission: { select: { id: true, companyAmount: true, agentAmount: true, agentSharePct: true, currency: true, status: true, ruleName: true } },
      },
    });
    if (!found) throw new NotFoundException('Expediente no encontrado');
    const stages = STAGES.map((s) => found.stages.find((x) => x.stage === s)!);
    return { ...found, stages, timeline: await this.activity.forCase(id) };
  }

  @Roles('ADMIN', 'AGENT')
  @Post()
  async create(@Body() body: unknown) {
    const data = validate(createSchema, body);
    const property = await this.prisma.db.property.findFirst({ where: { id: data.propertyId, ...ownScope() } });
    if (!property) throw new NotFoundException('Propiedad no encontrada');
    if (await this.cases.openCaseFor(property.id)) {
      throw new BadRequestException('Esta propiedad ya tiene un expediente abierto');
    }
    return this.cases.createForProperty(property, data);
  }

  private async assertAccess(id: string) {
    const count = await this.prisma.db.commercialCase.count({ where: { id, ...ownScope() } });
    if (!count) throw new NotFoundException('Expediente no encontrado');
  }

  @Roles('ADMIN', 'AGENT')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(updateSchema, body);
    await this.assertAccess(id);
    await this.refs.assert({ clientId: data.clientId, agentId: data.agentId });
    return this.prisma.db.commercialCase.update({ where: { id }, data: defined(data) });
  }

  @Roles('ADMIN', 'AGENT')
  @Patch(':id/stages/:stage')
  async updateStage(@Param('id') id: string, @Param('stage') stage: string, @Body() body: unknown) {
    const parsedStage = validate(stageEnum, stage);
    const data = validate(stageSchema, body);
    await this.assertAccess(id);
    await this.cases.updateStage(id, parsedStage, data);
    return { id };
  }

  @Roles('ADMIN', 'AGENT')
  @Post(':id/close')
  async close(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(closeSchema, body);
    await this.assertAccess(id);
    await this.refs.assert({ clientId: data.clientId });
    await this.cases.close(id, data);
    return { id };
  }

  @Roles('ADMIN', 'AGENT')
  @Post(':id/notes')
  async note(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(noteSchema, body);
    await this.assertAccess(id);
    await this.activity.log('case', id, `Nota: ${data.note}`);
    return { id };
  }
}
