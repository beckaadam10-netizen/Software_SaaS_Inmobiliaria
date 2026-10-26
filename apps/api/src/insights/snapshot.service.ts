import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DAY, type Snapshot } from './snapshot.js';

export interface SnapshotScope {
  /** Si se indica, solo los datos asignados a ese agente. */
  agentId?: string;
  /** Si se indica, solo los datos de los agentes de esa sucursal. */
  branchId?: string;
  /** Incluir comisiones y cuentas por cobrar (administrador y contador). */
  finance?: boolean;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Carga los datos de la empresa en curso con la forma que usan analítica, alertas y asistente. */
@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async load(scope: SnapshotScope = {}): Promise<Snapshot> {
    const db = this.prisma.db;
    const now = new Date();
    const own = scope.agentId ? { agentId: scope.agentId } : scope.branchId ? { agent: { branchId: scope.branchId } } : {};
    const [users, properties, contacts, leads, visits, cases] = await Promise.all([
      db.user.findMany({ where: { isActive: true, role: { in: ['ADMIN', 'AGENT'] }, ...(scope.agentId ? { id: scope.agentId } : {}), ...(scope.branchId ? { branchId: scope.branchId } : {}) }, select: { id: true, fullName: true, role: true } }),
      db.property.findMany({
        where: own, take: 5000,
        select: { id: true, code: true, title: true, type: true, operation: true, status: true, isPublished: true, price: true, currency: true, zone: true, bedrooms: true, viewCount: true, agentId: true, ownerId: true, createdAt: true },
      }),
      db.contact.findMany({
        where: scope.agentId ? { assignedAgentId: scope.agentId } : scope.branchId ? { assignedAgent: { branchId: scope.branchId } } : {}, take: 10000,
        select: { id: true, fullName: true, phone: true, type: true, assignedAgentId: true, createdAt: true, prefOperation: true, prefType: true, prefZone: true, prefBudgetMax: true, prefCurrency: true, prefBedrooms: true },
      }),
      db.lead.findMany({ where: own, take: 10000, select: { id: true, contactId: true, propertyId: true, agentId: true, status: true, source: true, score: true, createdAt: true, updatedAt: true } }),
      db.visit.findMany({ where: own, take: 10000, select: { id: true, propertyId: true, contactId: true, agentId: true, status: true, scheduledAt: true } }),
      db.commercialCase.findMany({
        where: own, take: 5000,
        select: { id: true, code: true, propertyId: true, agentId: true, clientId: true, status: true, currentStage: true, price: true, closedPrice: true, currency: true, createdAt: true, updatedAt: true, closedAt: true, captationEnds: true },
      }),
    ]);
    const caseIds = cases.map((c) => c.id);
    const propertyIds = properties.map((p) => p.id);
    const [offers, stats, commissions, receivables] = await Promise.all([
      db.offer.findMany({ where: { caseId: { in: caseIds } }, select: { id: true, caseId: true, contactId: true, kind: true, amount: true, currency: true, status: true, createdAt: true } }),
      db.propertyStat.groupBy({ by: ['propertyId', 'day'], where: { propertyId: { in: propertyIds }, day: { gte: day(new Date(+now - 60 * DAY)) } }, _sum: { views: true } }),
      scope.finance ? db.commission.findMany({ select: { caseId: true, agentId: true, agentAmount: true, currency: true, status: true } }) : [],
      scope.finance ? db.receivable.findMany({ where: { status: { in: ['PENDING', 'PARTIAL'] } }, select: { id: true, concept: true, amount: true, paidAmount: true, currency: true, dueDate: true, status: true } }) : [],
    ]);
    // Los contactos de las ofertas pueden no estar asignados al agente: se agregan para poder nombrarlos.
    const known = new Set(contacts.map((c) => c.id));
    const missing = [...new Set([...offers.map((o) => o.contactId), ...leads.map((l) => l.contactId), ...visits.map((v) => v.contactId)])].filter((id) => !known.has(id));
    const extra = missing.length
      ? await db.contact.findMany({ where: { id: { in: missing } }, select: { id: true, fullName: true, phone: true, type: true, assignedAgentId: true, createdAt: true } })
      : [];
    const noPrefs = { prefOperation: null, prefType: null, prefZone: null, prefBudgetMax: null, prefCurrency: null, prefBedrooms: null };
    return {
      now,
      users,
      properties: properties.map((p) => ({ ...p, price: Number(p.price) })),
      contacts: [...contacts.map((c) => ({ ...c, prefBudgetMax: c.prefBudgetMax == null ? null : Number(c.prefBudgetMax) })), ...extra.map((c) => ({ ...c, ...noPrefs }))],
      leads,
      visits,
      cases: cases.map((c) => ({ ...c, price: Number(c.price), closedPrice: c.closedPrice == null ? null : Number(c.closedPrice) })),
      offers: offers.map((o) => ({ ...o, amount: Number(o.amount) })),
      stats: stats.map((x) => ({ propertyId: x.propertyId, day: x.day, views: x._sum.views ?? 0 })),
      commissions: commissions.map((c) => ({ ...c, agentAmount: Number(c.agentAmount) })),
      receivables: receivables.map((r) => ({ ...r, amount: Number(r.amount), paidAmount: Number(r.paidAmount) })),
    };
  }
}
