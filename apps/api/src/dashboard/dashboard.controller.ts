import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import { ownScope } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY = 24 * 60 * 60 * 1000;

/** Responde "¿qué debo hacer hoy?": números clave y listas accionables. */
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get()
  async get() {
    const db = this.prisma.db;
    const own = ownScope();
    const now = new Date();
    const in7 = new Date(+now + 7 * DAY);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const visitInclude = {
      property: { select: { id: true, code: true, title: true } },
      contact: { select: { id: true, fullName: true, phone: true } },
    } as const;

    const [activeProperties, publishedProperties, newLeads, openLeads, upcomingVisitsCount, openCases, wonThisMonth,
      leadsToContact, visitRequests, upcomingVisits, stalledCases, byStage, quietProperties, usage] = await Promise.all([
      db.property.count({ where: { ...own, status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] } } }),
      db.property.count({ where: { ...own, isPublished: true } }),
      db.lead.count({ where: { ...own, createdAt: { gte: new Date(+now - 7 * DAY) } } }),
      db.lead.count({ where: { ...own, status: { notIn: ['CLOSED', 'LOST'] } } }),
      db.visit.count({ where: { ...own, status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] }, scheduledAt: { gte: now, lte: in7 } } }),
      db.commercialCase.count({ where: { ...own, status: 'OPEN' } }),
      db.commercialCase.count({ where: { ...own, status: 'WON', closedAt: { gte: monthStart } } }),
      db.lead.findMany({
        where: { ...own, status: 'NEW' }, orderBy: { createdAt: 'asc' }, take: 8,
        include: { contact: { select: { id: true, fullName: true, phone: true } }, property: { select: { code: true, title: true } } },
      }),
      db.visit.findMany({ where: { ...own, status: 'REQUESTED' }, orderBy: { scheduledAt: 'asc' }, take: 8, include: visitInclude }),
      db.visit.findMany({
        where: { ...own, status: { in: ['CONFIRMED', 'RESCHEDULED'] }, scheduledAt: { gte: new Date(+now - DAY / 2), lte: in7 } },
        orderBy: { scheduledAt: 'asc' }, take: 8, include: visitInclude,
      }),
      db.commercialCase.findMany({
        where: { ...own, status: 'OPEN', updatedAt: { lt: new Date(+now - 14 * DAY) } }, orderBy: { updatedAt: 'asc' }, take: 8,
        include: { property: { select: { code: true, title: true } } },
      }),
      db.commercialCase.groupBy({ by: ['currentStage'], where: { ...own, status: 'OPEN' }, _count: { _all: true } }),
      db.property.findMany({
        where: { ...own, isPublished: true, leads: { none: { createdAt: { gte: new Date(+now - 30 * DAY) } } }, createdAt: { lt: new Date(+now - 30 * DAY) } },
        take: 8, select: { id: true, code: true, title: true, viewCount: true },
      }),
      this.limits.usage(),
    ]);

    return {
      counts: { activeProperties, publishedProperties, newLeads, openLeads, upcomingVisits: upcomingVisitsCount, openCases, wonThisMonth },
      today: { leadsToContact, visitRequests, upcomingVisits, stalledCases, quietProperties },
      casesByStage: Object.fromEntries(byStage.map((r) => [r.currentStage, r._count._all])),
      plan: usage,
    };
  }
}
