import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService } from '../common/activity.service.js';
import { AuditService } from '../common/audit.service.js';
import { LimitsService } from '../common/limits.service.js';
import { requestContext } from '../common/request-context.js';
import type { PaymentMethod } from '../generated/prisma/enums.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Tier, accountStatus, computeCommission, pickRule, round2, settlementTotals, tierFor, tierPeriodStart } from './money.js';

const DAY = 24 * 60 * 60 * 1000;
const fmt = (n: unknown, currency: string) => `${currency} ${Number(n).toLocaleString('es-BO')}`;

/** Reglas con las que arranca cada empresa; se editan desde Finanzas > Reglas de comisión. */
const DEFAULT_RULES = [
  { name: 'Venta: 3 % del precio', operation: 'SALE' as const, basis: 'PERCENT' as const, companyValue: 3, agentSharePct: 50 },
  { name: 'Alquiler: un mes de alquiler', operation: 'RENT' as const, basis: 'PERCENT' as const, companyValue: 100, agentSharePct: 50 },
  { name: 'Anticrético: 3 % del monto', operation: 'ANTICRETICO' as const, basis: 'PERCENT' as const, companyValue: 3, agentSharePct: 50 },
];

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private tenantId() {
    return requestContext.get()!.tenantId!;
  }

  async assertLevel(min: 'basic' | 'full') {
    const level = await this.limits.financeLevel();
    if (level === 'none' || (min === 'full' && level !== 'full')) {
      throw new ForbiddenException(
        min === 'full' ? 'Este módulo financiero requiere el plan Profesional o superior.' : 'Tu plan no incluye el módulo de finanzas.',
      );
    }
    return level;
  }

  async rules() {
    const existing = await this.prisma.db.commissionRule.findMany({ orderBy: { createdAt: 'asc' } });
    if (existing.length) return existing;
    await this.prisma.db.commissionRule.createMany({ data: DEFAULT_RULES.map((r) => ({ ...r, tenantId: this.tenantId() })) });
    return this.prisma.db.commissionRule.findMany({ orderBy: { createdAt: 'asc' } });
  }

  /**
   * Una operación ganada alimenta finanzas: genera la comisión y, en planes con finanzas completas,
   * la cuenta por cobrar de la comisión de la empresa. Nunca interrumpe el cierre.
   */
  async onCaseWon(caseId: string) {
    const level = await this.limits.financeLevel();
    if (level === 'none') return;
    const c = await this.prisma.db.commercialCase.findUnique({ where: { id: caseId }, include: { property: { select: { code: true } } } });
    if (!c || c.status !== 'WON' || (await this.prisma.db.commission.count({ where: { caseId } }))) return;

    const rule = pickRule(await this.rules(), { agentId: c.agentId, operation: c.operation });
    const closedPrice = Number(c.closedPrice ?? c.price);
    // Comisión por nivel: lo vendido por el agente en el periodo, en la misma moneda, incluida esta operación.
    const tiers = (Array.isArray(rule?.tiers) ? rule!.tiers : []) as unknown as Tier[];
    let tier: ReturnType<typeof tierFor> = null;
    if (tiers.length && c.agentId) {
      const won = await this.prisma.db.commercialCase.findMany({
        where: { agentId: c.agentId, status: 'WON', currency: c.currency, closedAt: { gte: tierPeriodStart(rule!.tierPeriod ?? 'MONTH') } },
        select: { closedPrice: true, price: true },
      });
      tier = tierFor(tiers, won.reduce((s, k) => s + Number(k.closedPrice ?? k.price), 0));
    }
    const result = computeCommission({ closedPrice, agreedPct: c.commissionPct == null ? null : Number(c.commissionPct), rule, tier });
    if (!result) {
      await this.activity.log('case', caseId, 'No se generó comisión: no hay una regla de comisión que aplique');
      return;
    }
    const commission = await this.prisma.db.commission.create({
      data: {
        tenantId: this.tenantId(), caseId, agentId: c.agentId, baseAmount: closedPrice, currency: c.currency,
        companyAmount: result.companyAmount, agentAmount: result.agentAmount, agentSharePct: result.agentSharePct, ruleName: result.ruleName,
      },
    });
    await this.audit.record('commissions', commission.id, 'Comisión generada', null, commission);
    await this.activity.log('case', caseId, `Comisión generada: empresa ${fmt(result.companyAmount, c.currency)}, agente ${fmt(result.agentAmount, c.currency)}`);

    if (level === 'full' && result.companyAmount > 0) {
      const receivable = await this.prisma.db.receivable.create({
        data: {
          tenantId: this.tenantId(), caseId, contactId: c.ownerId, concept: `Comisión ${c.code} · ${c.property.code}`,
          category: c.operation === 'SALE' ? 'SALE_COMMISSION' : 'RENT_COMMISSION', amount: result.companyAmount, currency: c.currency,
          dueDate: new Date(Date.now() + 15 * DAY),
        },
      });
      await this.audit.record('receivables', receivable.id, 'Cuenta por cobrar creada al cerrar la operación', null, receivable);
    }
    await this.notifications.notify([c.agentId], {
      type: 'case', title: `Comisión generada · ${c.code}`, body: `Te corresponden ${fmt(result.agentAmount, c.currency)}`, link: '/app/finanzas/mis-comisiones',
    });
  }

  /** Registra un cobro o un pago contra una cuenta y actualiza su saldo. */
  /** Lanza 400 si la fecha cae en una gestión contable cerrada. El cierre vale para toda la empresa. */
  async assertOpenPeriod(date: Date, _currency?: string) {
    const closed = await this.prisma.db.accountingClosing.findFirst({ orderBy: { year: 'desc' } });
    if (closed && date.getTime() < Date.UTC(closed.year + 1, 0, 1, 4)) {
      throw new BadRequestException(`La gestión ${closed.year} está cerrada: registra el movimiento con una fecha posterior al 31/12/${closed.year}.`);
    }
  }

  async pay(kind: 'receivable' | 'payable', id: string, input: { amount: number; date: Date; method: PaymentMethod }) {
    const model = kind === 'receivable' ? this.prisma.db.receivable : this.prisma.db.payable;
    const account = await (model as typeof this.prisma.db.receivable).findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (account.status === 'PAID' || account.status === 'CANCELLED') throw new BadRequestException('Esta cuenta ya no admite pagos');
    if ((account as { settlementId?: string | null }).settlementId) {
      throw new BadRequestException('Esta cuenta es de una liquidación: págala desde la liquidación');
    }
    await this.assertOpenPeriod(input.date, account.currency);
    const balance = round2(Number(account.amount) - Number(account.paidAmount));
    if (round2(input.amount) > balance) throw new BadRequestException(`El monto supera el saldo pendiente (${fmt(balance, account.currency)})`);

    const paidAmount = round2(Number(account.paidAmount) + input.amount);
    const status = accountStatus(Number(account.amount), paidAmount);
    const ctx = requestContext.get()!;
    const transaction = await this.prisma.db.transaction.create({
      data: {
        tenantId: this.tenantId(), kind: kind === 'receivable' ? 'INCOME' : 'EXPENSE', category: account.category, amount: round2(input.amount),
        currency: account.currency, date: input.date, method: input.method, description: account.concept,
        caseId: (account as { caseId?: string | null }).caseId ?? null, agentId: (account as { agentId?: string | null }).agentId ?? null,
        ...(kind === 'receivable' ? { receivableId: id } : { payableId: id }), createdById: ctx.userId,
      },
    });
    const updated = await (model as typeof this.prisma.db.receivable).update({ where: { id }, data: { paidAmount, status } });
    await this.audit.record(kind === 'receivable' ? 'receivables' : 'payables', id, kind === 'receivable' ? 'Cobro registrado' : 'Pago registrado',
      { paidAmount: account.paidAmount, status: account.status }, { paidAmount, status, transactionId: transaction.id });
    return updated;
  }

  /** Anula un movimiento (no se borra) y revierte su efecto en la cuenta asociada. */
  async voidTransaction(id: string, reason: string) {
    const t = await this.prisma.db.transaction.findUnique({ where: { id }, include: { payable: { select: { settlementId: true } } } });
    if (!t) throw new NotFoundException('Movimiento no encontrado');
    if (t.voidedAt) throw new BadRequestException('Este movimiento ya está anulado');
    if (t.payable?.settlementId) throw new BadRequestException('Este pago pertenece a una liquidación pagada y no se puede anular');

    await this.prisma.db.transaction.update({ where: { id }, data: { voidedAt: new Date(), voidReason: reason } });
    for (const [key, model] of [['receivableId', this.prisma.db.receivable], ['payableId', this.prisma.db.payable]] as const) {
      const accountId = t[key];
      if (!accountId) continue;
      const account = await (model as typeof this.prisma.db.receivable).findUnique({ where: { id: accountId } });
      if (!account) continue;
      const paidAmount = round2(Math.max(0, Number(account.paidAmount) - Number(t.amount)));
      await (model as typeof this.prisma.db.receivable).update({ where: { id: accountId }, data: { paidAmount, status: accountStatus(Number(account.amount), paidAmount) } });
    }
    await this.audit.record('transactions', id, 'Movimiento anulado', { voidedAt: null }, { voidedAt: new Date(), voidReason: reason });
  }

  /** Recalcula los totales de una liquidación a partir de sus comisiones y ajustes. */
  async recomputeSettlement(id: string) {
    const s = await this.prisma.db.settlement.findUnique({ where: { id }, include: { commissions: true, adjustments: true } });
    if (!s) throw new NotFoundException('Liquidación no encontrada');
    const totals = settlementTotals(s.commissions.map((c) => Number(c.agentAmount)), s.adjustments.map((a) => ({ kind: a.kind, amount: Number(a.amount) })));
    return this.prisma.db.settlement.update({ where: { id }, data: totals });
  }
}
