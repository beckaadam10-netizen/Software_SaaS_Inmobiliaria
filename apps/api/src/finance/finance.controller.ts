import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { AuditService } from '../common/audit.service.js';
import { current } from '../common/current.js';
import { RefsService } from '../common/refs.service.js';
import { currency, defined, money, optId, optText, text, validate } from '../common/validate.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FinanceService } from './finance.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { totalInBOB } from './fx.js';
import { tiersError, cashFlow, daysOverdue, EXPENSE_CATEGORIES, INCOME_CATEGORIES, round2, type Grouping } from './money.js';

const method = z.enum(['CASH', 'TRANSFER', 'QR', 'CHECK', 'CARD', 'OTHER']);
const date = z.coerce.date();
const optDate = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.date().optional());
const pct = z.coerce.number().min(0).max(100);

const transactionSchema = z.object({
  kind: z.enum(['INCOME', 'EXPENSE']), category: z.string().max(30), amount: money, currency, date,
  description: text(), method: method.default('TRANSFER'), caseId: optId, agentId: optId,
}).refine((t) => (t.kind === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(t.category as never), { message: 'Categoría no válida', path: ['category'] });
const voidSchema = z.object({ reason: text(190) });
const receivableSchema = z.object({ contactId: optId, caseId: optId, concept: text(), category: z.enum(INCOME_CATEGORIES).default('OTHER'), amount: money, currency, dueDate: date });
const payableSchema = z.object({ agentId: optId, supplier: optText(), concept: text(), category: z.enum(EXPENSE_CATEGORIES).default('OTHER'), amount: money, currency, dueDate: date });
const paymentSchema = z.object({ amount: money, date, method: method.default('TRANSFER') });
const ruleFields = {
  name: text(), operation: z.preprocess((v) => (v === '' ? null : v), z.enum(['SALE', 'RENT', 'ANTICRETICO']).nullish()), agentId: optId,
  basis: z.enum(['PERCENT', 'FIXED']).default('PERCENT'), companyValue: z.coerce.number().min(0).max(1e9), agentSharePct: pct, isActive: z.boolean().default(true),
  tiers: z.array(z.object({ from: z.coerce.number().min(0).max(1e11), agentSharePct: pct })).max(6).nullish(),
  tierPeriod: z.enum(['MONTH', 'YEAR']).nullish(),
};
/** Niveles ordenados para guardar; una lista vacía los quita. */
const tiersValue = (t?: Array<{ from: number; agentSharePct: number }> | null) => (t === undefined ? undefined : t && t.length ? [...t].sort((a, b) => a.from - b.from) : Prisma.DbNull);
const checkTiers = (t?: Array<{ from: number; agentSharePct: number }> | null) => { const e = tiersError(t ?? []); if (e) throw new BadRequestException(e); };
const ruleSchema = z.object(ruleFields).refine((r) => r.basis === 'FIXED' || r.companyValue <= 100, { message: 'El porcentaje no puede superar 100', path: ['companyValue'] });
const commissionSchema = z.object({ status: z.enum(['PENDING', 'APPROVED', 'CANCELLED']).optional(), notes: optText(2000) });
const settlementSchema = z.object({ agentId: z.string().min(1), periodStart: date, periodEnd: date, currency });
const adjustmentSchema = z.object({ kind: z.enum(['BONUS', 'DEDUCTION', 'ADVANCE']), amount: money, note: text(190) });
const paySettlementSchema = z.object({ date, method: method.default('TRANSFER') });

const FINANCE = ['ADMIN', 'ACCOUNTANT'] as const;
const DAY = 24 * 60 * 60 * 1000;
const fmt = (n: unknown, cur: string) => `${cur} ${Number(n).toLocaleString('es-BO')}`;
const range = (from?: string, to?: string) => {
  const f = optDate.safeParse(from).data;
  const t = optDate.safeParse(to).data;
  // "Hasta" incluye el día completo.
  return f || t ? { ...(f ? { gte: f } : {}), ...(t ? { lt: new Date(+t + DAY) } : {}) } : undefined;
};
const byCurrency = <T extends { currency: string }>(rows: T[], value: (r: T) => number) =>
  rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.currency]: round2((acc[r.currency] ?? 0) + value(r)) }), {});

/** Finanzas de la inmobiliaria. Administrador y contador gestionan; el agente solo ve sus comisiones. */
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly refs: RefsService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  // ---------- Resumen ----------
  @Roles(...FINANCE)
  @Get('summary')
  async summary(@Query('from') from?: string, @Query('to') to?: string) {
    const level = await this.finance.assertLevel('basic');
    const now = new Date();
    const period = range(from, to) ?? { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    const [transactions, receivables, payables, commissions, recent] = await Promise.all([
      this.db.transaction.findMany({ where: { voidedAt: null, date: period }, select: { kind: true, amount: true, currency: true } }),
      this.db.receivable.findMany({ where: { status: { in: ['PENDING', 'PARTIAL'] } }, select: { amount: true, paidAmount: true, currency: true, dueDate: true } }),
      this.db.payable.findMany({ where: { status: { in: ['PENDING', 'PARTIAL'] } }, select: { amount: true, paidAmount: true, currency: true } }),
      this.db.commission.findMany({ where: { status: { in: ['GENERATED', 'PENDING', 'APPROVED'] } }, select: { agentAmount: true, currency: true } }),
      this.db.transaction.findMany({ where: { voidedAt: null }, orderBy: { date: 'desc' }, take: 8 }),
    ]);
    const fx = await this.db.exchangeRate.findFirst({ where: { date: { lte: now } }, orderBy: { date: 'desc' } });
    const balance = (r: { amount: unknown; paidAmount: unknown }) => Number(r.amount) - Number(r.paidAmount);
    const income = byCurrency(transactions.filter((t) => t.kind === 'INCOME'), (t) => Number(t.amount));
    const expense = byCurrency(transactions.filter((t) => t.kind === 'EXPENSE'), (t) => Number(t.amount));
    const currencies = [...new Set([...Object.keys(income), ...Object.keys(expense), ...receivables.map((r) => r.currency), ...payables.map((r) => r.currency), ...commissions.map((r) => r.currency)])].sort();
    const receivable = byCurrency(receivables, balance);
    const overdue = byCurrency(receivables.filter((r) => r.dueDate < now), balance);
    const payable = byCurrency(payables, balance);
    const pendingCommissions = byCurrency(commissions, (c) => Number(c.agentAmount));
    return {
      level,
      totals: currencies.map((cur) => ({
        currency: cur, income: income[cur] ?? 0, expense: expense[cur] ?? 0, net: round2((income[cur] ?? 0) - (expense[cur] ?? 0)),
        receivable: receivable[cur] ?? 0, overdue: overdue[cur] ?? 0, payable: payable[cur] ?? 0, pendingCommissions: pendingCommissions[cur] ?? 0,
      })),
      recent,
      // Equivalente en bolivianos con el tipo de cambio vigente. Es solo una referencia: los montos siguen en su moneda.
      consolidated: fx ? (() => {
        const rate = Number(fx.rate);
        const t = (m: Record<string, number>) => totalInBOB(m, rate);
        return { rate, date: fx.date, income: t(income), expense: t(expense), net: round2(t(income) - t(expense)), receivable: t(receivable), payable: t(payable) };
      })() : null,
    };
  }

  // ---------- Tipo de cambio ----------
  @Roles(...FINANCE)
  @Get('exchange-rates')
  async rates() {
    const rows = await this.db.exchangeRate.findMany({ orderBy: { date: 'desc' }, take: 60 });
    return rows.map((r) => ({ ...r, rate: Number(r.rate) }));
  }

  /** Registra el tipo de cambio de una fecha (bolivianos por 1 dólar). Si ya había uno ese día, lo reemplaza. */
  @Roles(...FINANCE)
  @Post('exchange-rates')
  async addRate(@Body() body: unknown) {
    const data = validate(z.object({ date, rate: z.coerce.number().min(0.5).max(100) }), body);
    const day = new Date(Date.UTC(data.date.getUTCFullYear(), data.date.getUTCMonth(), data.date.getUTCDate(), 4));
    const me = current();
    const before = await this.db.exchangeRate.findFirst({ where: { date: day } });
    const row = before
      ? await this.db.exchangeRate.update({ where: { id: before.id }, data: { rate: data.rate, createdById: me.userId } })
      : await this.db.exchangeRate.create({ data: { tenantId: me.tenantId, date: day, rate: data.rate, createdById: me.userId } });
    await this.audit.record('exchange_rates', row.id, 'Tipo de cambio registrado', before ? { rate: Number(before.rate) } : null, { date: day, rate: data.rate });
    return { ...row, rate: Number(row.rate) };
  }

  // ---------- Ingresos y gastos ----------
  @Roles(...FINANCE)
  @Get('transactions')
  async transactions(@Query() q: Record<string, string>) {
    await this.finance.assertLevel('basic');
    const kind = z.enum(['INCOME', 'EXPENSE']).safeParse(q.kind).data;
    return this.db.transaction.findMany({
      where: { ...(kind ? { kind } : {}), ...(q.category ? { category: q.category.slice(0, 30) } : {}), ...(q.caseId ? { caseId: q.caseId } : {}), ...(range(q.from, q.to) ? { date: range(q.from, q.to) } : {}) },
      orderBy: { date: 'desc' }, take: 500,
      include: { case: { select: { id: true, code: true } } },
    });
  }

  @Roles(...FINANCE)
  @Post('transactions')
  async createTransaction(@Body() body: unknown) {
    await this.finance.assertLevel('basic');
    const data = validate(transactionSchema, body);
    const me = current();
    await this.refs.assert({ caseId: data.caseId, agentId: data.agentId });
    await this.finance.assertOpenPeriod(data.date, data.currency);
    const created = await this.db.transaction.create({ data: { ...data, amount: round2(data.amount), tenantId: me.tenantId, createdById: me.userId } });
    await this.audit.record('transactions', created.id, data.kind === 'INCOME' ? 'Ingreso registrado' : 'Gasto registrado', null, created);
    if (data.caseId) await this.activity.log('case', data.caseId, `${data.kind === 'INCOME' ? 'Ingreso' : 'Gasto'} registrado: ${data.description} (${fmt(data.amount, data.currency)})`);
    return created;
  }

  @Roles(...FINANCE)
  @Post('transactions/:id/void')
  @HttpCode(200)
  async voidTransaction(@Param('id') id: string, @Body() body: unknown) {
    await this.finance.assertLevel('basic');
    await this.finance.voidTransaction(id, validate(voidSchema, body).reason);
    return { id };
  }

  // ---------- Cuentas por cobrar ----------
  @Roles(...FINANCE)
  @Get('receivables')
  async receivables() {
    await this.finance.assertLevel('full');
    const rows = await this.db.receivable.findMany({
      orderBy: { dueDate: 'asc' }, take: 500,
      include: { contact: { select: { id: true, fullName: true, phone: true } }, case: { select: { id: true, code: true } } },
    });
    return rows.map((r) => ({ ...r, balance: round2(Number(r.amount) - Number(r.paidAmount)), daysOverdue: daysOverdue(r.dueDate, r.status) }));
  }

  @Roles(...FINANCE)
  @Post('receivables')
  async createReceivable(@Body() body: unknown) {
    await this.finance.assertLevel('full');
    const data = validate(receivableSchema, body);
    await this.refs.assert({ contactId: data.contactId, caseId: data.caseId });
    const created = await this.db.receivable.create({ data: { ...data, amount: round2(data.amount), tenantId: current().tenantId } });
    await this.audit.record('receivables', created.id, 'Cuenta por cobrar creada', null, created);
    return created;
  }

  @Roles(...FINANCE)
  @Post('receivables/:id/payments')
  async payReceivable(@Param('id') id: string, @Body() body: unknown) {
    await this.finance.assertLevel('full');
    return this.finance.pay('receivable', id, validate(paymentSchema, body));
  }

  // ---------- Cuentas por pagar ----------
  @Roles(...FINANCE)
  @Get('payables')
  async payables() {
    await this.finance.assertLevel('full');
    const rows = await this.db.payable.findMany({ orderBy: { dueDate: 'asc' }, take: 500, include: { agent: { select: { id: true, fullName: true } }, settlement: { select: { id: true, code: true } } } });
    return rows.map((r) => ({ ...r, balance: round2(Number(r.amount) - Number(r.paidAmount)), daysOverdue: daysOverdue(r.dueDate, r.status) }));
  }

  @Roles(...FINANCE)
  @Post('payables')
  async createPayable(@Body() body: unknown) {
    await this.finance.assertLevel('full');
    const data = validate(payableSchema, body);
    if (!data.agentId && !data.supplier) throw new BadRequestException('Indica el proveedor o el agente a quien se le debe');
    await this.refs.assert({ agentId: data.agentId });
    const created = await this.db.payable.create({ data: { ...data, amount: round2(data.amount), tenantId: current().tenantId } });
    await this.audit.record('payables', created.id, 'Cuenta por pagar creada', null, created);
    return created;
  }

  @Roles(...FINANCE)
  @Post('payables/:id/payments')
  async payPayable(@Param('id') id: string, @Body() body: unknown) {
    await this.finance.assertLevel('full');
    return this.finance.pay('payable', id, validate(paymentSchema, body));
  }

  @Roles(...FINANCE)
  @Post(':kind/:id/cancel')
  @HttpCode(200)
  async cancelAccount(@Param('kind') kind: string, @Param('id') id: string) {
    await this.finance.assertLevel('full');
    const which = validate(z.enum(['receivables', 'payables']), kind);
    const model = (which === 'receivables' ? this.db.receivable : this.db.payable) as typeof this.db.receivable;
    const account = await model.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (Number(account.paidAmount) > 0) throw new BadRequestException('No se puede cancelar una cuenta con pagos; anula primero los pagos');
    if ((account as { settlementId?: string | null }).settlementId) throw new BadRequestException('Esta cuenta pertenece a una liquidación');
    if (account.status === 'CANCELLED') throw new BadRequestException('Esta cuenta ya está cancelada');
    await model.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.record(which, id, 'Cuenta cancelada', { status: account.status }, { status: 'CANCELLED' });
    return { id };
  }

  // ---------- Reglas de comisión ----------
  @Roles(...FINANCE)
  @Get('rules')
  async rules() {
    await this.finance.assertLevel('basic');
    const rules = await this.finance.rules();
    const agents = await this.db.user.findMany({ where: { id: { in: rules.map((r) => r.agentId).filter((x): x is string => !!x) } }, select: { id: true, fullName: true } });
    return rules.map((r) => ({ ...r, agent: agents.find((a) => a.id === r.agentId) ?? null }));
  }

  @Roles('ADMIN')
  @Post('rules')
  async createRule(@Body() body: unknown) {
    await this.finance.assertLevel('basic');
    const data = validate(ruleSchema, body);
    checkTiers(data.tiers);
    await this.refs.assert({ agentId: data.agentId });
    const created = await this.db.commissionRule.create({ data: { ...data, tiers: tiersValue(data.tiers) ?? Prisma.DbNull, tierPeriod: data.tiers?.length ? (data.tierPeriod ?? 'MONTH') : null, operation: data.operation ?? null, tenantId: current().tenantId } });
    await this.audit.record('commission-rules', created.id, 'Regla de comisión creada', null, created);
    return created;
  }

  @Roles('ADMIN')
  @Patch('rules/:id')
  async updateRule(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(z.object(ruleFields).partial(), body);
    const before = await this.db.commissionRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Regla no encontrada');
    if ((data.basis ?? before.basis) === 'PERCENT' && (data.companyValue ?? Number(before.companyValue)) > 100) throw new BadRequestException('El porcentaje no puede superar 100');
    checkTiers(data.tiers);
    await this.refs.assert({ agentId: data.agentId });
    const tiers = tiersValue(data.tiers);
    const updated = await this.db.commissionRule.update({ where: { id }, data: { ...defined({ ...data, tiers: undefined }), ...(tiers !== undefined ? { tiers, tierPeriod: tiers === Prisma.DbNull ? null : (data.tierPeriod ?? before.tierPeriod ?? 'MONTH') } : {}) } });
    await this.audit.record('commission-rules', id, 'Regla de comisión modificada', before, updated);
    return updated;
  }

  // ---------- Comisiones ----------
  private commissionInclude = {
    case: { select: { id: true, code: true, operation: true, closedAt: true, property: { select: { code: true, title: true } } } },
    agent: { select: { id: true, fullName: true } },
    settlement: { select: { id: true, code: true } },
  } as const;

  @Roles(...FINANCE)
  @Get('commissions')
  async commissions() {
    await this.finance.assertLevel('basic');
    return this.db.commission.findMany({ orderBy: { createdAt: 'desc' }, take: 500, include: this.commissionInclude });
  }

  /** Comisiones y liquidaciones propias: lo único financiero que ve un agente. */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('my')
  async mine() {
    await this.finance.assertLevel('basic');
    const { userId } = current();
    const [commissions, settlements] = await Promise.all([
      this.db.commission.findMany({ where: { agentId: userId }, orderBy: { createdAt: 'desc' }, take: 300, include: this.commissionInclude }),
      this.db.settlement.findMany({ where: { agentId: userId, status: { not: 'DRAFT' } }, orderBy: { createdAt: 'desc' }, take: 100, include: { adjustments: true } }),
    ]);
    const active = commissions.filter((c) => c.status !== 'CANCELLED');
    return {
      commissions, settlements,
      totals: {
        generated: byCurrency(active, (c) => Number(c.agentAmount)),
        paid: byCurrency(active.filter((c) => c.status === 'PAID'), (c) => Number(c.agentAmount)),
        pending: byCurrency(active.filter((c) => c.status !== 'PAID'), (c) => Number(c.agentAmount)),
      },
    };
  }

  @Roles(...FINANCE)
  @Patch('commissions/:id')
  async updateCommission(@Param('id') id: string, @Body() body: unknown) {
    await this.finance.assertLevel('basic');
    const data = validate(commissionSchema, body);
    const before = await this.db.commission.findUnique({ where: { id }, include: { case: { select: { code: true } } } });
    if (!before) throw new NotFoundException('Comisión no encontrada');
    if (data.status && data.status !== before.status) {
      if (before.status === 'PAID') throw new BadRequestException('Una comisión pagada no se puede modificar');
      if (before.status === 'CANCELLED') throw new BadRequestException('Esta comisión está cancelada');
      if (before.settlementId) throw new BadRequestException('Esta comisión está en una liquidación; quítala de la liquidación primero');
      if (data.status === 'PENDING' && before.status !== 'GENERATED') throw new BadRequestException('Solo una comisión recién generada pasa a pendiente');
    }
    const updated = await this.db.commission.update({
      where: { id },
      data: { ...(data.status ? { status: data.status, approvedAt: data.status === 'APPROVED' ? new Date() : before.approvedAt } : {}), ...(data.notes !== undefined ? { notes: data.notes } : {}) },
    });
    if (data.status && data.status !== before.status) {
      const label = { PENDING: 'pendiente de aprobación', APPROVED: 'aprobada', CANCELLED: 'cancelada' }[data.status];
      await this.audit.record('commissions', id, `Comisión ${label}`, { status: before.status }, { status: data.status });
      await this.activity.log('case', before.caseId, `Comisión ${label}`);
      if (data.status === 'APPROVED') {
        await this.notifications.notify([before.agentId], { type: 'case', title: `Comisión aprobada · ${before.case.code}`, body: fmt(before.agentAmount, before.currency), link: '/app/finanzas/mis-comisiones' });
      }
    }
    return updated;
  }

  // ---------- Liquidaciones ----------
  @Roles(...FINANCE)
  @Get('settlements')
  async settlements() {
    await this.finance.assertLevel('full');
    return this.db.settlement.findMany({ orderBy: { createdAt: 'desc' }, take: 300, include: { agent: { select: { id: true, fullName: true } }, _count: { select: { commissions: true } } } });
  }

  @Roles(...FINANCE)
  @Get('settlements/:id')
  async settlement(@Param('id') id: string) {
    await this.finance.assertLevel('full');
    const s = await this.db.settlement.findUnique({
      where: { id },
      include: { agent: { select: { id: true, fullName: true } }, adjustments: true, commissions: { include: this.commissionInclude }, payable: { select: { id: true, status: true } } },
    });
    if (!s) throw new NotFoundException('Liquidación no encontrada');
    return s;
  }

  /** Crea la liquidación del periodo con las comisiones aprobadas del agente que aún no se liquidaron. */
  @Roles(...FINANCE)
  @Post('settlements')
  async createSettlement(@Body() body: unknown) {
    await this.finance.assertLevel('full');
    const data = validate(settlementSchema, body);
    if (data.periodEnd < data.periodStart) throw new BadRequestException('El periodo termina antes de empezar');
    const me = current();
    await this.refs.assert({ agentId: data.agentId });
    const commissions = await this.db.commission.findMany({
      where: { agentId: data.agentId, status: 'APPROVED', settlementId: null, currency: data.currency, case: { closedAt: { gte: data.periodStart, lt: new Date(+data.periodEnd + DAY) } } },
      select: { id: true },
    });
    if (!commissions.length) throw new BadRequestException('El agente no tiene comisiones aprobadas sin liquidar en ese periodo y moneda');

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = `LIQ-${String((await this.db.settlement.count()) + 1 + attempt).padStart(4, '0')}`;
      try {
        const created = await this.db.settlement.create({ data: { ...data, tenantId: me.tenantId, code } });
        await this.db.commission.updateMany({ where: { id: { in: commissions.map((c) => c.id) } }, data: { settlementId: created.id } });
        const result = await this.finance.recomputeSettlement(created.id);
        await this.audit.record('settlements', created.id, 'Liquidación creada', null, result);
        return result;
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    throw new BadRequestException('No se pudo generar el código de la liquidación');
  }

  private async draft(id: string) {
    const s = await this.db.settlement.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Liquidación no encontrada');
    if (s.status !== 'DRAFT') throw new BadRequestException('Solo se puede modificar una liquidación en borrador');
    return s;
  }

  @Roles(...FINANCE)
  @Post('settlements/:id/adjustments')
  async addAdjustment(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(adjustmentSchema, body);
    const before = await this.draft(id);
    await this.db.settlementAdjustment.create({ data: { ...data, amount: round2(data.amount), tenantId: current().tenantId, settlementId: id } });
    const after = await this.finance.recomputeSettlement(id);
    await this.audit.record('settlements', id, `Ajuste agregado: ${data.note}`, { total: before.total }, { total: after.total });
    return after;
  }

  @Roles(...FINANCE)
  @Delete('settlements/:id/adjustments/:adjustmentId')
  async removeAdjustment(@Param('id') id: string, @Param('adjustmentId') adjustmentId: string) {
    const before = await this.draft(id);
    const adj = await this.db.settlementAdjustment.findFirst({ where: { id: adjustmentId, settlementId: id } });
    if (!adj) throw new NotFoundException('Ajuste no encontrado');
    await this.db.settlementAdjustment.delete({ where: { id: adjustmentId } });
    const after = await this.finance.recomputeSettlement(id);
    await this.audit.record('settlements', id, `Ajuste eliminado: ${adj.note}`, { total: before.total }, { total: after.total });
    return after;
  }

  @Roles(...FINANCE)
  @Delete('settlements/:id')
  async removeSettlement(@Param('id') id: string) {
    const before = await this.draft(id);
    await this.db.commission.updateMany({ where: { settlementId: id }, data: { settlementId: null } });
    await this.db.settlement.delete({ where: { id } });
    await this.audit.record('settlements', id, 'Liquidación en borrador eliminada', before, null);
    return { id };
  }

  /** Aprobar la liquidación la convierte en una cuenta por pagar al agente. */
  @Roles('ADMIN')
  @Post('settlements/:id/approve')
  @HttpCode(200)
  async approveSettlement(@Param('id') id: string) {
    const s = await this.draft(id);
    if (Number(s.total) <= 0) throw new BadRequestException('El total a pagar debe ser mayor que cero');
    await this.db.settlement.update({ where: { id }, data: { status: 'APPROVED', approvedAt: new Date() } });
    await this.db.payable.create({
      data: { tenantId: current().tenantId, agentId: s.agentId, concept: `Liquidación ${s.code}`, category: 'COMMISSION_PAID', amount: s.total, currency: s.currency, dueDate: new Date(Date.now() + 7 * DAY), settlementId: id },
    });
    await this.audit.record('settlements', id, 'Liquidación aprobada', { status: 'DRAFT' }, { status: 'APPROVED' });
    await this.notifications.notify([s.agentId], { type: 'case', title: `Liquidación ${s.code} aprobada`, body: `Total a pagar: ${fmt(s.total, s.currency)}`, link: '/app/finanzas/mis-comisiones' });
    return { id };
  }

  /** Pagar la liquidación registra el gasto, salda la cuenta por pagar y marca las comisiones como pagadas. */
  @Roles(...FINANCE)
  @Post('settlements/:id/pay')
  @HttpCode(200)
  async paySettlement(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(paySettlementSchema, body);
    const me = current();
    const s = await this.db.settlement.findUnique({ where: { id }, include: { payable: true } });
    if (!s) throw new NotFoundException('Liquidación no encontrada');
    if (s.status !== 'APPROVED' || !s.payable) throw new BadRequestException(s.status === 'PAID' ? 'Esta liquidación ya está pagada' : 'Aprueba la liquidación antes de pagarla');
    await this.finance.assertOpenPeriod(data.date, s.currency);
    await this.db.transaction.create({
      data: { tenantId: me.tenantId, kind: 'EXPENSE', category: 'COMMISSION_PAID', amount: s.total, currency: s.currency, date: data.date, method: data.method, description: `Pago de liquidación ${s.code}`, agentId: s.agentId, payableId: s.payable.id, createdById: me.userId },
    });
    await this.db.payable.update({ where: { id: s.payable.id }, data: { paidAmount: s.total, status: 'PAID' } });
    await this.db.settlement.update({ where: { id }, data: { status: 'PAID', paidAt: data.date } });
    await this.db.commission.updateMany({ where: { settlementId: id }, data: { status: 'PAID', paidAt: data.date } });
    await this.audit.record('settlements', id, 'Liquidación pagada', { status: 'APPROVED' }, { status: 'PAID', paidAt: data.date });
    await this.notifications.notify([s.agentId], { type: 'case', title: `Liquidación ${s.code} pagada`, body: fmt(s.total, s.currency), link: '/app/finanzas/mis-comisiones' });
    return { id };
  }

  // ---------- Flujo de caja ----------
  @Roles(...FINANCE)
  @Get('cashflow')
  async cashflow(@Query() q: Record<string, string>) {
    await this.finance.assertLevel('full');
    const group = (z.enum(['day', 'week', 'month', 'quarter', 'year']).safeParse(q.group).data ?? 'month') as Grouping;
    const rows = await this.db.transaction.findMany({ where: { voidedAt: null, ...(range(q.from, q.to) ? { date: range(q.from, q.to) } : {}) }, select: { kind: true, amount: true, currency: true, date: true }, take: 20000 });
    const currencies = [...new Set(rows.map((r) => r.currency))].sort();
    return currencies.map((cur) => {
      const flow = cashFlow(rows.filter((r) => r.currency === cur).map((r) => ({ kind: r.kind, amount: Number(r.amount), date: r.date })), group);
      return { currency: cur, rows: flow, income: round2(flow.reduce((s, r) => s + r.income, 0)), expense: round2(flow.reduce((s, r) => s + r.expense, 0)), net: flow.at(-1)?.balance ?? 0 };
    });
  }

  // ---------- Rentabilidad ----------
  @Roles(...FINANCE)
  @Get('profitability')
  async profitability() {
    await this.finance.assertLevel('full');
    const [cases, agents, leads] = await Promise.all([
      this.db.commercialCase.findMany({
        where: { status: 'WON' }, orderBy: { closedAt: 'desc' }, take: 500,
        select: {
          id: true, code: true, operation: true, currency: true, closedPrice: true, closedAt: true, agentId: true,
          property: { select: { code: true, title: true } }, commission: { select: { companyAmount: true, agentAmount: true, status: true } },
          transactions: { where: { kind: 'EXPENSE', voidedAt: null, category: { not: 'COMMISSION_PAID' } }, select: { amount: true } },
        },
      }),
      this.db.user.findMany({ where: { role: { in: ['AGENT', 'ADMIN'] } }, select: { id: true, fullName: true } }),
      this.db.lead.groupBy({ by: ['agentId'], _count: { _all: true } }),
    ]);
    const byCase = cases.map(({ transactions, commission, agentId, ...c }) => {
      void agentId;
      const company = commission && commission.status !== 'CANCELLED' ? Number(commission.companyAmount) : 0;
      const agent = commission && commission.status !== 'CANCELLED' ? Number(commission.agentAmount) : 0;
      const expenses = round2(transactions.reduce((s, t) => s + Number(t.amount), 0));
      return { ...c, companyCommission: company, agentCommission: agent, expenses, net: round2(company - agent - expenses) };
    });
    const byAgent = agents
      .map((a) => {
        const mine = cases.filter((c) => c.agentId === a.id);
        const totalLeads = leads.find((l) => l.agentId === a.id)?._count._all ?? 0;
        const active = mine.filter((c) => c.commission && c.commission.status !== 'CANCELLED');
        return {
          agent: a, sales: mine.length, leads: totalLeads, conversion: totalLeads ? Math.round((mine.length / totalLeads) * 100) : null,
          valueSold: byCurrency(mine, (c) => Number(c.closedPrice ?? 0)),
          generated: byCurrency(active, (c) => Number(c.commission!.agentAmount)),
          paid: byCurrency(active.filter((c) => c.commission!.status === 'PAID'), (c) => Number(c.commission!.agentAmount)),
          pending: byCurrency(active.filter((c) => c.commission!.status !== 'PAID'), (c) => Number(c.commission!.agentAmount)),
        };
      })
      .filter((a) => a.sales > 0 || a.leads > 0);
    return { byCase, byAgent };
  }
}
