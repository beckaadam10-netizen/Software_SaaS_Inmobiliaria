import { accountStatus, cashFlow, computeCommission, daysOverdue, periodKey, pickRule, round2, settlementTotals, type Rule } from './money.js';

const rule = (o: Partial<Rule>): Rule => ({ name: 'General', operation: null, agentId: null, basis: 'PERCENT', companyValue: 3, agentSharePct: 50, isActive: true, ...o });

describe('finanzas: cálculos', () => {
  it('redondea a centavos sin errores de coma flotante', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(3750)).toBe(3750);
  });

  it('reproduce el ejemplo del documento: venta de 125.000 al 3 % y 50 % al agente', () => {
    const c = computeCommission({ closedPrice: 125000, agreedPct: null, rule: rule({}) });
    expect(c).toMatchObject({ companyAmount: 3750, agentAmount: 1875, agentSharePct: 50 });
  });

  it('el porcentaje acordado en la captación manda sobre el de la regla', () => {
    const c = computeCommission({ closedPrice: 100000, agreedPct: 4, rule: rule({ agentSharePct: 40 }) });
    expect(c).toMatchObject({ companyAmount: 4000, agentAmount: 1600 });
  });

  it('admite comisión de monto fijo', () => {
    expect(computeCommission({ closedPrice: 999999, agreedPct: null, rule: rule({ basis: 'FIXED', companyValue: 500, agentSharePct: 30 }) })).toMatchObject({ companyAmount: 500, agentAmount: 150 });
  });

  it('sin regla ni porcentaje acordado no inventa una comisión', () => {
    expect(computeCommission({ closedPrice: 100000, agreedPct: null, rule: null })).toBeNull();
  });

  it('con porcentaje acordado pero sin regla, el agente no recibe parte hasta que se defina', () => {
    expect(computeCommission({ closedPrice: 100000, agreedPct: 3, rule: null })).toMatchObject({ companyAmount: 3000, agentAmount: 0 });
  });

  it('elige la regla más específica y omite las inactivas', () => {
    const rules = [
      rule({ name: 'general' }), rule({ name: 'venta', operation: 'SALE' }), rule({ name: 'juan', agentId: 'juan' }),
      rule({ name: 'juan-venta', agentId: 'juan', operation: 'SALE' }), rule({ name: 'apagada', agentId: 'ana', operation: 'SALE', isActive: false }),
    ];
    expect(pickRule(rules, { agentId: 'juan', operation: 'SALE' })?.name).toBe('juan-venta');
    expect(pickRule(rules, { agentId: 'juan', operation: 'RENT' })?.name).toBe('juan');
    expect(pickRule(rules, { agentId: 'ana', operation: 'SALE' })?.name).toBe('venta');
    expect(pickRule(rules, { agentId: null, operation: 'RENT' })?.name).toBe('general');
    expect(pickRule([rule({ operation: 'SALE' })], { agentId: null, operation: 'RENT' })).toBeNull();
  });

  it('estado de una cuenta según lo pagado', () => {
    expect(accountStatus(1000, 0)).toBe('PENDING');
    expect(accountStatus(1000, 400)).toBe('PARTIAL');
    expect(accountStatus(1000, 1000)).toBe('PAID');
    expect(accountStatus(0.3, 0.1 + 0.2)).toBe('PAID');
  });

  it('días de atraso', () => {
    const now = new Date(2026, 9, 20, 15);
    expect(daysOverdue(new Date(2026, 9, 10), 'PENDING', now)).toBe(10);
    expect(daysOverdue(new Date(2026, 9, 25), 'PENDING', now)).toBe(0);
    expect(daysOverdue(new Date(2026, 9, 20, 1), 'PARTIAL', now)).toBe(0);
    expect(daysOverdue(new Date(2026, 9, 1), 'PAID', now)).toBe(0);
  });

  it('liquidación: comisiones + bonos − deducciones − anticipos', () => {
    const t = settlementTotals([1875, 325.5], [{ kind: 'BONUS', amount: 200 }, { kind: 'DEDUCTION', amount: 50.25 }, { kind: 'ADVANCE', amount: 500 }]);
    expect(t).toEqual({ commissionsTotal: 2200.5, bonuses: 200, deductions: 50.25, advances: 500, total: 1850.25 });
  });

  it('agrupa por periodo en hora de Bolivia', () => {
    // 1 de noviembre 02:00 UTC todavía es 31 de octubre en La Paz.
    const d = new Date('2026-11-01T02:00:00Z');
    expect(periodKey(d, 'day')).toBe('2026-10-31');
    expect(periodKey(d, 'month')).toBe('2026-10');
    expect(periodKey(d, 'quarter')).toBe('2026-T4');
    expect(periodKey(d, 'year')).toBe('2026');
    expect(periodKey(new Date('2026-10-08T16:00:00Z'), 'week')).toBe('Sem. 2026-10-05');
  });

  it('flujo de caja: ingresos − gastos = neto, con saldo acumulado', () => {
    const rows = cashFlow([
      { kind: 'INCOME', amount: 3750, date: new Date('2026-09-10T15:00:00Z') },
      { kind: 'EXPENSE', amount: 1875, date: new Date('2026-09-20T15:00:00Z') },
      { kind: 'EXPENSE', amount: 900.4, date: new Date('2026-10-02T15:00:00Z') },
      { kind: 'INCOME', amount: 650, date: new Date('2026-10-05T15:00:00Z') },
    ], 'month');
    expect(rows).toEqual([
      { period: '2026-09', income: 3750, expense: 1875, net: 1875, balance: 1875 },
      { period: '2026-10', income: 650, expense: 900.4, net: -250.4, balance: 1624.6 },
    ]);
  });
});
