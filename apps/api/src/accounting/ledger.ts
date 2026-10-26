/**
 * Contabilidad de doble partida, en funciones puras.
 * Base de caja: cada ingreso o gasto registrado en Finanzas genera su asiento. Cada moneda lleva sus propios libros.
 */
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export interface AccountDef { code: string; name: string; type: AccountType }
export interface Line { accountCode: string; debit: number; credit: number }
export interface PostedLine extends Line { currency: string; date: Date; entryNumber: number; description: string; sourceType?: string }

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Plan de cuentas inicial. La empresa puede agregar cuentas; las de sistema no se eliminan. */
export const DEFAULT_ACCOUNTS: AccountDef[] = [
  { code: '1101', name: 'Caja', type: 'ASSET' },
  { code: '1102', name: 'Bancos', type: 'ASSET' },
  { code: '1201', name: 'Cuentas por cobrar', type: 'ASSET' },
  { code: '2101', name: 'Cuentas por pagar', type: 'LIABILITY' },
  { code: '2102', name: 'Reservas recibidas de clientes', type: 'LIABILITY' },
  { code: '3101', name: 'Capital', type: 'EQUITY' },
  { code: '3201', name: 'Resultados acumulados', type: 'EQUITY' },
  { code: '4101', name: 'Ingresos por comisiones de venta', type: 'INCOME' },
  { code: '4102', name: 'Ingresos por comisiones de alquiler', type: 'INCOME' },
  { code: '4103', name: 'Honorarios y servicios', type: 'INCOME' },
  { code: '4199', name: 'Otros ingresos', type: 'INCOME' },
  { code: '5101', name: 'Comisiones pagadas a agentes', type: 'EXPENSE' },
  { code: '5102', name: 'Publicidad y marketing', type: 'EXPENSE' },
  { code: '5103', name: 'Personal', type: 'EXPENSE' },
  { code: '5104', name: 'Servicios básicos', type: 'EXPENSE' },
  { code: '5105', name: 'Oficina', type: 'EXPENSE' },
  { code: '5106', name: 'Transporte', type: 'EXPENSE' },
  { code: '5107', name: 'Gastos administrativos', type: 'EXPENSE' },
  { code: '5199', name: 'Otros gastos', type: 'EXPENSE' },
];

const INCOME_ACCOUNT: Record<string, string> = { SALE_COMMISSION: '4101', RENT_COMMISSION: '4102', FEE: '4103', SERVICE: '4103', RESERVATION: '2102', OTHER: '4199' };
const EXPENSE_ACCOUNT: Record<string, string> = { COMMISSION_PAID: '5101', ADVERTISING: '5102', MARKETING: '5102', STAFF: '5103', SERVICES: '5104', OFFICE: '5105', TRANSPORT: '5106', ADMIN: '5107', OTHER: '5199' };

/** El efectivo va a Caja; transferencias, tarjetas, QR y cheques van a Bancos. */
export const cashAccount = (method: string) => (method === 'CASH' ? '1101' : '1102');

/** Asiento de un movimiento de Finanzas. Ingreso: debe caja/bancos, haber ingreso. Gasto: debe gasto, haber caja/bancos. */
export function entryFor(tx: { kind: 'INCOME' | 'EXPENSE'; category: string; amount: number; method: string }): Line[] {
  const amount = round2(tx.amount);
  const cash = cashAccount(tx.method);
  return tx.kind === 'INCOME'
    ? [{ accountCode: cash, debit: amount, credit: 0 }, { accountCode: INCOME_ACCOUNT[tx.category] ?? '4199', debit: 0, credit: amount }]
    : [{ accountCode: EXPENSE_ACCOUNT[tx.category] ?? '5199', debit: amount, credit: 0 }, { accountCode: cash, debit: 0, credit: amount }];
}

/** Asiento inverso, para anular sin borrar. */
export const reverse = (lines: Line[]): Line[] => lines.map((l) => ({ accountCode: l.accountCode, debit: l.credit, credit: l.debit }));

/** Devuelve el motivo por el que un asiento no es válido, o null si lo es. */
export function entryError(lines: Line[]): string | null {
  if (lines.length < 2) return 'Un asiento necesita al menos dos líneas';
  if (lines.some((l) => l.debit < 0 || l.credit < 0)) return 'Los importes no pueden ser negativos';
  if (lines.some((l) => (l.debit > 0) === (l.credit > 0))) return 'Cada línea lleva un importe en el debe o en el haber, no en ambos';
  const debit = round2(lines.reduce((a, l) => a + l.debit, 0));
  const credit = round2(lines.reduce((a, l) => a + l.credit, 0));
  return debit === credit ? null : `El asiento no cuadra: debe ${debit} y haber ${credit}`;
}

const DEBIT_NATURE: AccountType[] = ['ASSET', 'EXPENSE'];
/** Saldo de una cuenta según su naturaleza: activos y gastos suman por el debe; el resto por el haber. */
export const balanceOf = (type: AccountType, debit: number, credit: number) => round2(DEBIT_NATURE.includes(type) ? debit - credit : credit - debit);

export interface TrialRow { code: string; name: string; type: AccountType; debit: number; credit: number; balance: number }

/** Balance de comprobación de sumas y saldos, para una moneda. */
export function trialBalance(accounts: AccountDef[], lines: Array<Pick<PostedLine, 'accountCode' | 'debit' | 'credit' | 'currency'>>, currency: string) {
  const rows: TrialRow[] = accounts
    .map((a) => {
      const mine = lines.filter((l) => l.currency === currency && l.accountCode === a.code);
      const debit = round2(mine.reduce((s, l) => s + l.debit, 0));
      const credit = round2(mine.reduce((s, l) => s + l.credit, 0));
      return { ...a, debit, credit, balance: balanceOf(a.type, debit, credit) };
    })
    .filter((r) => r.debit !== 0 || r.credit !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));
  const debit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const credit = round2(rows.reduce((s, r) => s + r.credit, 0));
  return { rows, debit, credit, balanced: debit === credit };
}

/** Estado de resultados: ingresos − gastos. */
export function incomeStatement(rows: TrialRow[]) {
  const income = rows.filter((r) => r.type === 'INCOME');
  const expenses = rows.filter((r) => r.type === 'EXPENSE');
  const totalIncome = round2(income.reduce((s, r) => s + r.balance, 0));
  const totalExpenses = round2(expenses.reduce((s, r) => s + r.balance, 0));
  return { income, expenses, totalIncome, totalExpenses, result: round2(totalIncome - totalExpenses) };
}

/** Balance general: activo = pasivo + patrimonio + resultado del periodo. */
export function balanceSheet(rows: TrialRow[]) {
  const of = (t: AccountType) => rows.filter((r) => r.type === t);
  const sum = (list: TrialRow[]) => round2(list.reduce((s, r) => s + r.balance, 0));
  const result = incomeStatement(rows).result;
  const assets = sum(of('ASSET'));
  const liabilities = sum(of('LIABILITY'));
  const equity = sum(of('EQUITY'));
  return { assets: of('ASSET'), liabilities: of('LIABILITY'), equity: of('EQUITY'), totalAssets: assets, totalLiabilities: liabilities, totalEquity: equity, result, balanced: assets === round2(liabilities + equity + result) };
}

/** Libro mayor de una cuenta: sus movimientos en orden, con saldo acumulado. */
export function ledger(account: AccountDef, lines: PostedLine[], currency: string) {
  let balance = 0;
  return lines
    .filter((l) => l.currency === currency && l.accountCode === account.code)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.entryNumber - b.entryNumber)
    .map((l) => {
      balance = round2(balance + balanceOf(account.type, l.debit, l.credit));
      return { date: l.date, entryNumber: l.entryNumber, description: l.description, debit: l.debit, credit: l.credit, balance };
    });
}

/** Cuenta que recibe el resultado de cada gestión cerrada. */
export const RETAINED_EARNINGS = '3201';

/**
 * Asiento de cierre de gestión: deja en cero las cuentas de ingresos y gastos del año
 * y pasa la diferencia (utilidad o pérdida) a Resultados acumulados.
 */
export function closingLines(rows: TrialRow[]): { lines: Line[]; result: number } {
  const lines: Line[] = [];
  const zero = (code: string, balance: number, side: 'debit' | 'credit') => {
    if (!balance) return;
    const amount = round2(Math.abs(balance));
    // Un saldo normal se cancela por el lado contrario; uno invertido, por el mismo lado.
    const onDebit = (side === 'debit') === balance > 0;
    lines.push({ accountCode: code, debit: onDebit ? amount : 0, credit: onDebit ? 0 : amount });
  };
  for (const r of rows.filter((x) => x.type === 'INCOME')) zero(r.code, r.balance, 'debit');
  for (const r of rows.filter((x) => x.type === 'EXPENSE')) zero(r.code, r.balance, 'credit');
  const result = incomeStatement(rows).result;
  if (result > 0) lines.push({ accountCode: RETAINED_EARNINGS, debit: 0, credit: result });
  else if (result < 0) lines.push({ accountCode: RETAINED_EARNINGS, debit: round2(-result), credit: 0 });
  return { lines, result };
}

/** Fin de una gestión: 31 de diciembre a las 23:59 en hora de Bolivia. */
export const yearEnd = (year: number) => new Date(Date.UTC(year + 1, 0, 1, 3, 59));
/** ¿La fecha pertenece a ese año, en hora de Bolivia? */
export const inYear = (date: Date, year: number) => date.getTime() >= Date.UTC(year, 0, 1, 4) && date.getTime() < Date.UTC(year + 1, 0, 1, 4);
export const localYear = (date: Date) => new Date(date.getTime() - 4 * 3600e3).getUTCFullYear();
