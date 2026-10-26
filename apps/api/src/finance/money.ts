/** Cálculos financieros puros (sin base de datos), para poder probarlos uno por uno. */

/** Redondea a centavos evitando errores de coma flotante (1.005 -> 1.01). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface Rule {
  name: string;
  operation: string | null;
  agentId: string | null;
  basis: 'PERCENT' | 'FIXED';
  companyValue: unknown;
  agentSharePct: unknown;
  isActive: boolean;
}

/** Elige la regla más específica: agente + operación, luego agente, luego operación, luego general. */
export function pickRule<T extends Rule>(rules: T[], ctx: { agentId: string | null; operation: string }): T | null {
  const applies = rules.filter(
    (r) => r.isActive && (r.agentId === null || r.agentId === ctx.agentId) && (r.operation === null || r.operation === ctx.operation),
  );
  const weight = (r: Rule) => (r.agentId ? 2 : 0) + (r.operation ? 1 : 0);
  applies.sort((a, b) => weight(b) - weight(a));
  return applies[0] ?? null;
}

/** Nivel de comisión: desde cuánto vendido en el periodo el agente recibe ese porcentaje. */
export interface Tier { from: number; agentSharePct: number }

/** Limpia los niveles: ordenados, el primero desde 0, sin repetidos. Devuelve el motivo si no son válidos. */
export function tiersError(tiers: Tier[]): string | null {
  if (!tiers.length) return null;
  if (tiers.length > 6) return 'Máximo 6 niveles';
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  if (sorted[0].from !== 0) return 'El primer nivel debe empezar en 0';
  if (new Set(sorted.map((t) => t.from)).size !== sorted.length) return 'Dos niveles no pueden empezar en el mismo monto';
  if (sorted.some((t) => t.agentSharePct < 0 || t.agentSharePct > 100 || t.from < 0)) return 'Los porcentajes van de 0 a 100 y los montos no pueden ser negativos';
  return null;
}

/** Nivel que corresponde a lo vendido en el periodo (incluida la operación que se está cerrando). */
export function tierFor(tiers: Tier[], soldInPeriod: number): { level: number; agentSharePct: number } | null {
  if (!tiers.length) return null;
  const sorted = [...tiers].sort((a, b) => a.from - b.from);
  let level = 0;
  sorted.forEach((t, i) => { if (soldInPeriod >= t.from) level = i; });
  return { level: level + 1, agentSharePct: sorted[level].agentSharePct };
}

/** Inicio del periodo de niveles (mes o año en curso, hora de Bolivia). */
export function tierPeriodStart(period: string, now = new Date()): Date {
  const local = new Date(now.getTime() - 4 * 3600e3);
  return period === 'YEAR' ? new Date(Date.UTC(local.getUTCFullYear(), 0, 1, 4)) : new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 4));
}

export interface CommissionResult {
  companyAmount: number;
  agentAmount: number;
  agentSharePct: number;
  ruleName: string;
}

/**
 * Comisión de una operación cerrada.
 * - Si en la captación se acordó un porcentaje con el propietario, ese manda sobre el de la regla.
 * - La regla define qué parte de la comisión corresponde al agente.
 * Devuelve null si no hay regla ni porcentaje acordado.
 */
export function computeCommission(input: { closedPrice: number; agreedPct: number | null; rule: Rule | null; tier?: { level: number; agentSharePct: number } | null }): CommissionResult | null {
  const { closedPrice, agreedPct, rule, tier } = input;
  if (!rule && agreedPct == null) return null;
  // Con niveles, el porcentaje del agente sale del nivel alcanzado en el periodo.
  const share = tier ? tier.agentSharePct : rule ? Number(rule.agentSharePct) : 0;
  let company: number;
  let ruleName: string;
  if (agreedPct != null) {
    company = round2((closedPrice * agreedPct) / 100);
    ruleName = `${agreedPct} % acordado en la captación${rule ? ` · ${rule.name}` : ''}`;
  } else if (rule!.basis === 'FIXED') {
    company = round2(Number(rule!.companyValue));
    ruleName = rule!.name;
  } else {
    company = round2((closedPrice * Number(rule!.companyValue)) / 100);
    ruleName = rule!.name;
  }
  if (tier) ruleName = `${ruleName} · nivel ${tier.level}`;
  return { companyAmount: company, agentAmount: round2((company * share) / 100), agentSharePct: share, ruleName };
}

export type AccountStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';
/** Estado de una cuenta por cobrar o por pagar según lo pagado. */
export function accountStatus(amount: number, paid: number): AccountStatus {
  if (paid <= 0) return 'PENDING';
  return round2(paid) >= round2(amount) ? 'PAID' : 'PARTIAL';
}

/** Días de atraso de una cuenta pendiente (0 si no venció o ya se pagó). */
export function daysOverdue(dueDate: Date, status: AccountStatus, now = new Date()): number {
  if (status === 'PAID' || status === 'CANCELLED') return 0;
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(dueDate).getTime()) / 86400000);
  return Math.max(0, days);
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export interface SettlementTotals {
  commissionsTotal: number;
  bonuses: number;
  deductions: number;
  advances: number;
  total: number;
}
/** Total a pagar = comisiones + bonificaciones − deducciones − anticipos. */
export function settlementTotals(commissions: number[], adjustments: Array<{ kind: 'BONUS' | 'DEDUCTION' | 'ADVANCE'; amount: number }>): SettlementTotals {
  const sum = (kind: string) => round2(adjustments.filter((a) => a.kind === kind).reduce((s, a) => s + a.amount, 0));
  const commissionsTotal = round2(commissions.reduce((s, n) => s + n, 0));
  const bonuses = sum('BONUS');
  const deductions = sum('DEDUCTION');
  const advances = sum('ADVANCE');
  return { commissionsTotal, bonuses, deductions, advances, total: round2(commissionsTotal + bonuses - deductions - advances) };
}

export type Grouping = 'day' | 'week' | 'month' | 'quarter' | 'year';
const TZ = 'America/La_Paz';
/** Clave del periodo al que pertenece una fecha, en hora de Bolivia. */
export function periodKey(date: Date, group: Grouping): string {
  const [y, m, d] = date.toLocaleDateString('en-CA', { timeZone: TZ }).split('-').map(Number);
  if (group === 'year') return `${y}`;
  if (group === 'quarter') return `${y}-T${Math.ceil(m / 3)}`;
  if (group === 'month') return `${y}-${String(m).padStart(2, '0')}`;
  if (group === 'day') return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Semana: se identifica por su lunes.
  const local = new Date(Date.UTC(y, m - 1, d));
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return `Sem. ${local.toISOString().slice(0, 10)}`;
}

export interface FlowRow {
  period: string;
  income: number;
  expense: number;
  net: number;
  balance: number;
}
/** Flujo de caja: ingresos − gastos = flujo neto por periodo, con saldo acumulado. */
export function cashFlow(items: Array<{ kind: 'INCOME' | 'EXPENSE'; amount: number; date: Date }>, group: Grouping): FlowRow[] {
  const map = new Map<string, { income: number; expense: number }>();
  for (const t of items) {
    const key = periodKey(t.date, group);
    const row = map.get(key) ?? { income: 0, expense: 0 };
    if (t.kind === 'INCOME') row.income += t.amount;
    else row.expense += t.amount;
    map.set(key, row);
  }
  let balance = 0;
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, r]) => {
      const net = round2(r.income - r.expense);
      balance = round2(balance + net);
      return { period, income: round2(r.income), expense: round2(r.expense), net, balance };
    });
}

export const INCOME_CATEGORIES = ['SALE_COMMISSION', 'RENT_COMMISSION', 'FEE', 'SERVICE', 'RESERVATION', 'OTHER'] as const;
export const EXPENSE_CATEGORIES = ['COMMISSION_PAID', 'ADVERTISING', 'MARKETING', 'STAFF', 'SERVICES', 'OFFICE', 'TRANSPORT', 'ADMIN', 'OTHER'] as const;
