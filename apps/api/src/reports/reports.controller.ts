import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { can, current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { daysOverdue, round2 } from '../finance/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toCsv, toPdf, toXlsx, type Column, type Report } from './exporters.js';

const DAY = 24 * 60 * 60 * 1000;
const L = {
  operation: { SALE: 'Venta', RENT: 'Alquiler', ANTICRETICO: 'Anticrético' },
  propertyType: { HOUSE: 'Casa', APARTMENT: 'Departamento', LAND: 'Terreno', OFFICE: 'Oficina', COMMERCIAL: 'Local comercial', WAREHOUSE: 'Galpón', OTHER: 'Otro' },
  propertyStatus: { AVAILABLE: 'Disponible', RESERVED: 'Reservada', NEGOTIATING: 'En negociación', SOLD: 'Vendida', RENTED: 'Alquilada', INACTIVE: 'Inactiva' },
  contactType: { PROSPECT: 'Prospecto', BUYER: 'Comprador', TENANT: 'Arrendatario', OWNER: 'Propietario', INVESTOR: 'Inversionista', COMPANY: 'Empresa' },
  lead: { NEW: 'Nuevo', CONTACTED: 'Contactado', QUALIFIED: 'Calificado', INTERESTED: 'Interesado', VISIT: 'Visita', NEGOTIATION: 'Negociación', RESERVED: 'Reserva', CLOSED: 'Cerrado', LOST: 'Perdido' },
  source: { WEB: 'Portal web', WHATSAPP: 'WhatsApp', CALL: 'Llamada', REFERRAL: 'Referido', SOCIAL: 'Redes sociales', QR: 'Código QR', WALK_IN: 'Visita a oficina', OTHER: 'Otro' },
  visit: { REQUESTED: 'Solicitada', CONFIRMED: 'Confirmada', RESCHEDULED: 'Reprogramada', DONE: 'Realizada', CANCELLED: 'Cancelada', NO_SHOW: 'No asistió' },
  caseStatus: { OPEN: 'Abierto', WON: 'Ganado', LOST: 'Perdido' },
  stage: { CAPTATION: 'Captación', MARKETING: 'Marketing', LEADS: 'Interesados', VISIT: 'Visita', FOLLOW_UP: 'Post-visita', NEGOTIATION: 'Negociación', LEGAL: 'Legal', POST_SALE: 'Postventa' },
  kind: { INCOME: 'Ingreso', EXPENSE: 'Gasto' },
  category: {
    SALE_COMMISSION: 'Comisión por venta', RENT_COMMISSION: 'Comisión por alquiler', FEE: 'Honorarios', SERVICE: 'Servicios', RESERVATION: 'Reservas',
    COMMISSION_PAID: 'Comisiones pagadas', ADVERTISING: 'Publicidad', MARKETING: 'Marketing', STAFF: 'Personal', SERVICES: 'Servicios', OFFICE: 'Oficina',
    TRANSPORT: 'Transporte', ADMIN: 'Administración', OTHER: 'Otros',
  },
  method: { CASH: 'Efectivo', TRANSFER: 'Transferencia', QR: 'QR', CHECK: 'Cheque', CARD: 'Tarjeta', OTHER: 'Otro' },
  account: { PENDING: 'Pendiente', PARTIAL: 'Pago parcial', PAID: 'Pagada', CANCELLED: 'Cancelada' },
  commission: { GENERATED: 'Generada', PENDING: 'Pendiente', APPROVED: 'Aprobada', PAID: 'Pagada', CANCELLED: 'Cancelada' },
} as const;
const label = (map: Record<string, string>, key: string | null | undefined) => (key ? (map[key] ?? key) : '');

type Range = { gte?: Date; lt?: Date } | undefined;
type Builder = { title: string; finance?: boolean; columns: Column[]; rows: (db: PrismaService['db'], range: Range) => Promise<Array<Record<string, unknown>>> };

const REPORTS: Record<string, Builder> = {
  propiedades: {
    title: 'Propiedades',
    columns: [
      { header: 'Código', key: 'code', width: 12 }, { header: 'Título', key: 'title', width: 34 }, { header: 'Tipo', key: 'type', width: 16 }, { header: 'Operación', key: 'operation', width: 13 },
      { header: 'Estado', key: 'status', width: 15 }, { header: 'Precio', key: 'price', type: 'money' }, { header: 'Moneda', key: 'currency', width: 9 }, { header: 'Zona', key: 'zone', width: 18 },
      { header: 'Agente', key: 'agent', width: 20 }, { header: 'Vistas', key: 'views', type: 'number', width: 9 }, { header: 'Alta', key: 'createdAt', type: 'date' },
    ],
    rows: async (db, range) =>
      (await db.property.findMany({ where: range ? { createdAt: range } : {}, orderBy: { createdAt: 'desc' }, take: 5000, include: { agent: { select: { fullName: true } } } })).map((p) => ({
        code: p.code, title: p.title, type: label(L.propertyType, p.type), operation: label(L.operation, p.operation), status: label(L.propertyStatus, p.status) + (p.isPublished ? ' · publicada' : ''),
        price: p.price, currency: p.currency, zone: p.zone, agent: p.agent?.fullName, views: p.viewCount, createdAt: p.createdAt,
      })),
  },
  clientes: {
    title: 'Clientes y contactos',
    columns: [
      { header: 'Nombre', key: 'fullName', width: 28 }, { header: 'Tipo', key: 'type', width: 15 }, { header: 'Teléfono', key: 'phone', width: 15 }, { header: 'Email', key: 'email', width: 26 },
      { header: 'Busca', key: 'prefs', width: 34 }, { header: 'Agente', key: 'agent', width: 20 }, { header: 'Alta', key: 'createdAt', type: 'date' },
    ],
    rows: async (db, range) =>
      (await db.contact.findMany({ where: range ? { createdAt: range } : {}, orderBy: { fullName: 'asc' }, take: 5000, include: { assignedAgent: { select: { fullName: true } } } })).map((c) => ({
        fullName: c.fullName, type: label(L.contactType, c.type), phone: c.phone, email: c.email, agent: c.assignedAgent?.fullName, createdAt: c.createdAt,
        prefs: [label(L.propertyType, c.prefType), label(L.operation, c.prefOperation), c.prefZone, c.prefBudgetMax ? `hasta ${c.prefCurrency ?? 'USD'} ${Number(c.prefBudgetMax).toLocaleString('es-BO')}` : ''].filter(Boolean).join(' · '),
      })),
  },
  leads: {
    title: 'Leads',
    columns: [
      { header: 'Fecha', key: 'createdAt', type: 'datetime' }, { header: 'Contacto', key: 'contact', width: 26 }, { header: 'Teléfono', key: 'phone', width: 15 }, { header: 'Propiedad', key: 'property', width: 30 },
      { header: 'Fuente', key: 'source', width: 15 }, { header: 'Estado', key: 'status', width: 14 }, { header: 'Puntaje', key: 'score', type: 'number', width: 9 }, { header: 'Agente', key: 'agent', width: 20 },
    ],
    rows: async (db, range) =>
      (await db.lead.findMany({ where: range ? { createdAt: range } : {}, orderBy: { createdAt: 'desc' }, take: 5000, include: { contact: true, property: { select: { code: true, title: true } }, agent: { select: { fullName: true } } } })).map((l) => ({
        createdAt: l.createdAt, contact: l.contact.fullName, phone: l.contact.phone, property: l.property ? `${l.property.code} · ${l.property.title}` : 'Consulta general',
        source: label(L.source, l.source), status: label(L.lead, l.status), score: l.score, agent: l.agent?.fullName,
      })),
  },
  visitas: {
    title: 'Visitas',
    columns: [
      { header: 'Fecha', key: 'scheduledAt', type: 'datetime' }, { header: 'Cliente', key: 'contact', width: 24 }, { header: 'Propiedad', key: 'property', width: 30 },
      { header: 'Estado', key: 'status', width: 14 }, { header: 'Agente', key: 'agent', width: 20 }, { header: 'Resultado', key: 'result', width: 40 },
    ],
    rows: async (db, range) =>
      (await db.visit.findMany({ where: range ? { scheduledAt: range } : {}, orderBy: { scheduledAt: 'desc' }, take: 5000, include: { contact: { select: { fullName: true } }, property: { select: { code: true, title: true } }, agent: { select: { fullName: true } } } })).map((v) => ({
        scheduledAt: v.scheduledAt, contact: v.contact.fullName, property: `${v.property.code} · ${v.property.title}`, status: label(L.visit, v.status), agent: v.agent?.fullName, result: v.result ?? v.notes,
      })),
  },
  operaciones: {
    title: 'Operaciones',
    columns: [
      { header: 'Expediente', key: 'code', width: 12 }, { header: 'Propiedad', key: 'property', width: 30 }, { header: 'Operación', key: 'operation', width: 12 }, { header: 'Estado', key: 'status', width: 10 },
      { header: 'Paso actual', key: 'stage', width: 14 }, { header: 'Precio pedido', key: 'price', type: 'money' }, { header: 'Precio de cierre', key: 'closedPrice', type: 'money' }, { header: 'Moneda', key: 'currency', width: 9 },
      { header: 'Cliente', key: 'client', width: 22 }, { header: 'Agente', key: 'agent', width: 18 }, { header: 'Apertura', key: 'createdAt', type: 'date' }, { header: 'Cierre', key: 'closedAt', type: 'date' },
    ],
    rows: async (db, range) =>
      (await db.commercialCase.findMany({ where: range ? { createdAt: range } : {}, orderBy: { createdAt: 'desc' }, take: 5000, include: { property: { select: { code: true, title: true } }, client: { select: { fullName: true } }, agent: { select: { fullName: true } } } })).map((c) => ({
        code: c.code, property: `${c.property.code} · ${c.property.title}`, operation: label(L.operation, c.operation), status: label(L.caseStatus, c.status), stage: label(L.stage, c.currentStage),
        price: c.price, closedPrice: c.closedPrice, currency: c.currency, client: c.client?.fullName, agent: c.agent?.fullName, createdAt: c.createdAt, closedAt: c.closedAt,
      })),
  },
  agentes: {
    title: 'Rendimiento de agentes',
    columns: [
      { header: 'Agente', key: 'agent', width: 26 }, { header: 'Propiedades', key: 'properties', type: 'number' }, { header: 'Leads', key: 'leads', type: 'number' }, { header: 'Visitas', key: 'visits', type: 'number' },
      { header: 'Expedientes abiertos', key: 'open', type: 'number', width: 16 }, { header: 'Operaciones ganadas', key: 'won', type: 'number', width: 16 }, { header: 'Conversión de leads (%)', key: 'conversion', type: 'number', width: 18 },
    ],
    rows: async (db, range) => {
      const when = range ? { createdAt: range } : {};
      const [users, props, leads, visits, cases] = await Promise.all([
        db.user.findMany({ where: { role: { in: ['AGENT', 'ADMIN'] }, isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } }),
        db.property.groupBy({ by: ['agentId'], where: when, _count: { _all: true } }),
        db.lead.groupBy({ by: ['agentId'], where: when, _count: { _all: true } }),
        db.visit.groupBy({ by: ['agentId'], where: range ? { scheduledAt: range } : {}, _count: { _all: true } }),
        db.commercialCase.groupBy({ by: ['agentId', 'status'], where: when, _count: { _all: true } }),
      ]);
      const of = (rows: Array<{ agentId: string | null; _count: { _all: number } }>, id: string) => rows.filter((r) => r.agentId === id).reduce((s, r) => s + r._count._all, 0);
      return users.map((u) => {
        const won = of(cases.filter((c) => c.status === 'WON'), u.id);
        const totalLeads = of(leads, u.id);
        return { agent: u.fullName, properties: of(props, u.id), leads: totalLeads, visits: of(visits, u.id), open: of(cases.filter((c) => c.status === 'OPEN'), u.id), won, conversion: totalLeads ? Math.round((won / totalLeads) * 100) : null };
      });
    },
  },
  finanzas: {
    title: 'Ingresos y gastos', finance: true,
    columns: [
      { header: 'Fecha', key: 'date', type: 'date' }, { header: 'Tipo', key: 'kind', width: 10 }, { header: 'Categoría', key: 'category', width: 20 }, { header: 'Descripción', key: 'description', width: 36 },
      { header: 'Ingreso', key: 'income', type: 'money' }, { header: 'Gasto', key: 'expense', type: 'money' }, { header: 'Moneda', key: 'currency', width: 9 }, { header: 'Forma de pago', key: 'method', width: 14 }, { header: 'Expediente', key: 'case', width: 12 },
    ],
    rows: async (db, range) =>
      (await db.transaction.findMany({ where: { voidedAt: null, ...(range ? { date: range } : {}) }, orderBy: { date: 'asc' }, take: 20000, include: { case: { select: { code: true } } } })).map((t) => ({
        date: t.date, kind: label(L.kind, t.kind), category: label(L.category, t.category), description: t.description, income: t.kind === 'INCOME' ? t.amount : null, expense: t.kind === 'EXPENSE' ? t.amount : null,
        currency: t.currency, method: label(L.method, t.method), case: t.case?.code,
      })),
  },
  comisiones: {
    title: 'Comisiones', finance: true,
    columns: [
      { header: 'Expediente', key: 'code', width: 12 }, { header: 'Propiedad', key: 'property', width: 30 }, { header: 'Agente', key: 'agent', width: 20 }, { header: 'Cierre', key: 'closedAt', type: 'date' },
      { header: 'Precio de cierre', key: 'base', type: 'money' }, { header: 'Comisión empresa', key: 'company', type: 'money' }, { header: 'Comisión agente', key: 'agentAmount', type: 'money' },
      { header: 'Moneda', key: 'currency', width: 9 }, { header: 'Estado', key: 'status', width: 12 }, { header: 'Regla', key: 'rule', width: 28 },
    ],
    rows: async (db, range) =>
      (await db.commission.findMany({ where: range ? { createdAt: range } : {}, orderBy: { createdAt: 'desc' }, take: 5000, include: { agent: { select: { fullName: true } }, case: { select: { code: true, closedAt: true, property: { select: { code: true, title: true } } } } } })).map((c) => ({
        code: c.case.code, property: `${c.case.property.code} · ${c.case.property.title}`, agent: c.agent?.fullName, closedAt: c.case.closedAt, base: c.baseAmount, company: c.companyAmount, agentAmount: c.agentAmount,
        currency: c.currency, status: label(L.commission, c.status), rule: c.ruleName,
      })),
  },
  'por-cobrar': {
    title: 'Cuentas por cobrar', finance: true,
    columns: [
      { header: 'Concepto', key: 'concept', width: 34 }, { header: 'Cliente', key: 'contact', width: 24 }, { header: 'Monto', key: 'amount', type: 'money' }, { header: 'Cobrado', key: 'paid', type: 'money' },
      { header: 'Saldo', key: 'balance', type: 'money' }, { header: 'Moneda', key: 'currency', width: 9 }, { header: 'Vencimiento', key: 'dueDate', type: 'date' }, { header: 'Días de atraso', key: 'overdue', type: 'number', width: 12 }, { header: 'Estado', key: 'status', width: 13 },
    ],
    rows: async (db, range) =>
      (await db.receivable.findMany({ where: range ? { dueDate: range } : {}, orderBy: { dueDate: 'asc' }, take: 5000, include: { contact: { select: { fullName: true } } } })).map((r) => ({
        concept: r.concept, contact: r.contact?.fullName, amount: r.amount, paid: r.paidAmount, balance: round2(Number(r.amount) - Number(r.paidAmount)), currency: r.currency, dueDate: r.dueDate,
        overdue: daysOverdue(r.dueDate, r.status), status: label(L.account, r.status),
      })),
  },
  'por-pagar': {
    title: 'Cuentas por pagar', finance: true,
    columns: [
      { header: 'Concepto', key: 'concept', width: 34 }, { header: 'A quién', key: 'who', width: 24 }, { header: 'Monto', key: 'amount', type: 'money' }, { header: 'Pagado', key: 'paid', type: 'money' },
      { header: 'Saldo', key: 'balance', type: 'money' }, { header: 'Moneda', key: 'currency', width: 9 }, { header: 'Vencimiento', key: 'dueDate', type: 'date' }, { header: 'Estado', key: 'status', width: 13 },
    ],
    rows: async (db, range) =>
      (await db.payable.findMany({ where: range ? { dueDate: range } : {}, orderBy: { dueDate: 'asc' }, take: 5000, include: { agent: { select: { fullName: true } } } })).map((r) => ({
        concept: r.concept, who: r.agent?.fullName ?? r.supplier, amount: r.amount, paid: r.paidAmount, balance: round2(Number(r.amount) - Number(r.paidAmount)), currency: r.currency, dueDate: r.dueDate, status: label(L.account, r.status),
      })),
  },
  rentabilidad: {
    title: 'Rentabilidad por operación', finance: true,
    columns: [
      { header: 'Expediente', key: 'code', width: 12 }, { header: 'Propiedad', key: 'property', width: 30 }, { header: 'Cierre', key: 'closedAt', type: 'date' }, { header: 'Precio de cierre', key: 'price', type: 'money' },
      { header: 'Comisión empresa', key: 'company', type: 'money' }, { header: 'Comisión agente', key: 'agentAmount', type: 'money' }, { header: 'Gastos', key: 'expenses', type: 'money' },
      { header: 'Ganancia neta', key: 'net', type: 'money' }, { header: 'Moneda', key: 'currency', width: 9 },
    ],
    rows: async (db, range) =>
      (await db.commercialCase.findMany({
        where: { status: 'WON', ...(range ? { closedAt: range } : {}) }, orderBy: { closedAt: 'desc' }, take: 5000,
        include: { property: { select: { code: true, title: true } }, commission: true, transactions: { where: { kind: 'EXPENSE', voidedAt: null, category: { not: 'COMMISSION_PAID' } }, select: { amount: true } } },
      })).map((c) => {
        const ok = c.commission && c.commission.status !== 'CANCELLED';
        const company = ok ? Number(c.commission!.companyAmount) : 0;
        const agentAmount = ok ? Number(c.commission!.agentAmount) : 0;
        const expenses = round2(c.transactions.reduce((s, t) => s + Number(t.amount), 0));
        return { code: c.code, property: `${c.property.code} · ${c.property.title}`, closedAt: c.closedAt, price: c.closedPrice, company, agentAmount, expenses, net: round2(company - agentAmount - expenses), currency: c.currency };
      }),
  },
};

const FORMATS = {
  csv: { type: 'text/csv; charset=utf-8', build: async (r: Report) => toCsv(r) },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', build: toXlsx },
  pdf: { type: 'application/pdf', build: toPdf },
} as const;

/** Reportes exportables en PDF, Excel y CSV. Solo administrador y contador. */
@Roles('ADMIN', 'ACCOUNTANT', 'AGENT')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  /** El agente exporta solo reportes comerciales, y solo si puede ver toda la empresa. */
  private agentGate() {
    if (current().role !== 'AGENT') return false;
    if (!can('export_reports') || !can('view_all')) throw new ForbiddenException('Tu usuario no puede exportar reportes. Pídeselo al administrador.');
    return true;
  }

  @Get()
  async list() {
    const agent = this.agentGate();
    const level = await this.limits.financeLevel();
    return Object.entries(REPORTS)
      .filter(([, r]) => !r.finance || (level !== 'none' && !agent))
      .map(([id, r]) => ({ id, title: r.title, finance: !!r.finance }));
  }

  @Get(':id')
  async export(@Param('id') id: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const builder = Object.hasOwn(REPORTS, id) ? REPORTS[id] : null;
    if (!builder) throw new NotFoundException('Reporte no encontrado');
    if (this.agentGate() && builder.finance) throw new ForbiddenException('Los reportes financieros son solo para administración y contabilidad.');
    if (builder.finance && (await this.limits.financeLevel()) === 'none') throw new ForbiddenException('Tu plan no incluye el módulo de finanzas.');
    const format = z.enum(['csv', 'xlsx', 'pdf']).safeParse(q.format).data ?? 'xlsx';
    const from = z.coerce.date().safeParse(q.from || undefined).data;
    const to = z.coerce.date().safeParse(q.to || undefined).data;
    const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(+to + DAY) } : {}) } : undefined;

    const tenant = await this.prisma.platform.tenant.findUnique({ where: { id: current().tenantId }, select: { name: true } });
    const day = (d: Date) => d.toLocaleDateString('es-BO', { timeZone: 'UTC' });
    const period = from && to ? `del ${day(from)} al ${day(to)}` : from ? `desde el ${day(from)}` : to ? `hasta el ${day(to)}` : 'todo el historial';
    const rows = await builder.rows(this.prisma.db, range);
    const report: Report = {
      title: builder.title, columns: builder.columns, rows,
      subtitle: `${tenant?.name ?? ''} · ${period} · ${rows.length} registro(s) · generado el ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' })}`,
    };
    const buffer = await FORMATS[format].build(report);
    res.setHeader('Content-Type', FORMATS[format].type);
    res.setHeader('Content-Disposition', `attachment; filename="${id}-${new Date().toISOString().slice(0, 10)}.${format}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }
}
