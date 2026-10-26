import { describe, expect, it } from 'vitest';
import { cleanOverrides, resolvePermissions } from './common/permissions.js';
import { compareProperties, pricePerM2, type ComparableProperty } from './compare/compare.js';
import { rateOn, toBOB, totalInBOB } from './finance/fx.js';
import { approxLocation, distanceM } from './geo/geo.js';
import { ivaSummary, monthRange, purchasesBook, salesBook } from './tax/books.js';

const prop = (o: Partial<ComparableProperty>): ComparableProperty => ({
  code: 'X', title: 'X', type: 'HOUSE', operation: 'SALE', price: 100000, currency: 'USD', zone: null, city: null, areaM2: null, builtM2: null,
  bedrooms: null, bathrooms: null, parking: null, yearBuilt: null, features: [], ...o,
});

describe('permisos', () => {
  it('parten del rol y aplican los cambios', () => {
    expect(resolvePermissions('AGENT', null)).toEqual(['create_properties']);
    expect(resolvePermissions('AGENT', { view_all: true, create_properties: false })).toEqual(['view_all']);
    expect(resolvePermissions('ACCOUNTANT', {})).toEqual(['manage_finance']);
    expect(resolvePermissions('ACCOUNTANT', { view_all: true })).toEqual(['manage_finance']);
    expect(resolvePermissions('ADMIN', { view_all: true })).toEqual([]);
  });
  it('guardan solo lo que difiere del rol', () => {
    expect(cleanOverrides('AGENT', { view_all: true, create_properties: true, manage_finance: false, raro: true, export_reports: 'si' })).toEqual({ view_all: true });
  });
});

describe('comparador', () => {
  const a = prop({ code: 'A', price: 180000, builtM2: 200, areaM2: 400, bedrooms: 3, bathrooms: 2, parking: 2, yearBuilt: 2015, features: ['Jardín', 'Piscina'] });
  const b = prop({ code: 'B', price: 150000, builtM2: 120, bedrooms: 3, bathrooms: 3, yearBuilt: 2026, features: ['jardin', 'Ascensor'] });
  const { rows, features } = compareProperties([a, b], new Date('2026-10-12'));
  const row = (k: string) => rows.find((r) => r.key === k)!;
  it('precio por m² con la superficie construida y, si falta, la de terreno', () => {
    expect(pricePerM2(a)).toBe(900);
    expect(pricePerM2({ price: 50000, builtM2: null, areaM2: 500 })).toBe(100);
    expect(pricePerM2({ price: 50000, builtM2: null, areaM2: null })).toBeNull();
  });
  it('marca el mejor valor de cada fila', () => {
    expect(row('price').best).toEqual([1]);
    expect(row('ppm2').values).toEqual(['USD 900', 'USD 1.250']);
    expect(row('ppm2').best).toEqual([0]);
    expect(row('builtM2').best).toEqual([0]);
    expect(row('bedrooms').best).toEqual([]);
    expect(row('bathrooms').best).toEqual([1]);
    expect(row('parking').best).toEqual([]);
    expect(row('age').values).toEqual(['11 años', 'A estrenar']);
    expect(row('age').best).toEqual([1]);
  });
  it('no compara precios en monedas u operaciones distintas', () => {
    const r = compareProperties([a, prop({ price: 900000, currency: 'BOB' })]).rows;
    expect(r.find((x) => x.key === 'price')!.best).toEqual([]);
    const rent = compareProperties([a, prop({ price: 650, operation: 'RENT', builtM2: 85 })]).rows;
    expect(rent.find((x) => x.key === 'price')!.best).toEqual([]);
    expect(rent.find((x) => x.key === 'ppm2')!.best).toEqual([]);
    expect(rent.find((x) => x.key === 'builtM2')!.best).toEqual([0]);
  });
  it('une características sin importar mayúsculas ni tildes', () => {
    expect(features).toEqual([{ name: 'Jardín', has: [true, true] }, { name: 'Piscina', has: [true, false] }, { name: 'Ascensor', has: [false, true] }]);
  });
});

describe('ubicación aproximada', () => {
  it('desplaza entre 120 y 260 m, siempre igual para la misma propiedad', () => {
    for (const seed of ['p1', 'p2', 'otra-propiedad', 'DEM-0001']) {
      const ap = approxLocation(-17.7833, -63.1821, seed)!;
      const d = distanceM({ lat: -17.7833, lng: -63.1821 }, ap);
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThan(270);
      expect(approxLocation(-17.7833, -63.1821, seed)).toEqual(ap);
    }
    expect(approxLocation(null, -63, 'x')).toBeNull();
  });
});

describe('tipo de cambio', () => {
  const rates = [{ date: new Date('2026-09-01'), rate: 6.96 }, { date: new Date('2026-10-05'), rate: 7.1 }];
  it('usa el último vigente a la fecha', () => {
    expect(rateOn(rates, new Date('2026-10-04'))!.rate).toBe(6.96);
    expect(rateOn(rates, new Date('2026-10-05'))!.rate).toBe(7.1);
    expect(rateOn(rates, new Date('2026-08-01'))).toBeNull();
  });
  it('convierte y suma en bolivianos', () => {
    expect(toBOB(100, 'USD', 6.96)).toBe(696);
    expect(toBOB(100, 'BOB', 6.96)).toBe(100);
    expect(totalInBOB({ USD: 1000.5, BOB: 300 }, 6.96)).toBe(7263.48);
  });
});

describe('libros IVA', () => {
  const rates = [{ date: new Date('2026-10-01'), rate: 6.96 }];
  const inv = (o: object) => ({ number: 1, date: new Date('2026-10-03'), customerName: 'C', customerTaxId: '1', currency: 'BOB', total: 1000, status: 'ISSUED', fiscalCode: null, ...o });
  it('libro de ventas en bolivianos, con anuladas en cero y estado A', () => {
    const s = salesBook([inv({ number: 2, currency: 'USD', total: 100 }), inv({}), inv({ number: 3, status: 'VOIDED' }), inv({ number: null })], rates);
    expect(s.rows.map((r) => [r.number, r.status, r.total, r.tax, r.base])).toEqual([[1, 'V', 1000, 130, 870], [2, 'V', 696, 90.48, 605.52], [3, 'A', 0, 0, 0]]);
    expect([s.total, s.tax, s.missingRate]).toEqual([1696, 220.48, false]);
  });
  it('avisa si falta el tipo de cambio de una factura en dólares', () => {
    const s = salesBook([inv({ currency: 'USD', date: new Date('2026-09-15') })], rates);
    expect([s.rows[0].total, s.missingRate]).toEqual([0, true]);
  });
  it('libro de compras y saldo', () => {
    const p = purchasesBook([{ date: new Date('2026-10-02'), supplierTaxId: '1', supplierName: 'S', invoiceNumber: '1', authCode: null, total: 500 }]);
    expect([p.total, p.tax]).toEqual([500, 65]);
    expect(ivaSummary({ tax: 220.48 }, p)).toEqual({ debit: 220.48, credit: 65, balance: 155.48, toPay: 155.48, inFavor: 0 });
    expect(ivaSummary({ tax: 10 }, { tax: 65 }).inFavor).toBe(55);
  });
  it('rango de un mes en hora de Bolivia', () => {
    expect(monthRange('2026-10')).toEqual({ from: new Date('2026-10-01T04:00:00Z'), to: new Date('2026-11-01T04:00:00Z') });
    expect(monthRange('2026-12')!.to.toISOString()).toBe('2027-01-01T04:00:00.000Z');
    expect(monthRange('2026-13')).toBeNull();
  });
});

import { closingLines, DEFAULT_ACCOUNTS as ACCS, inYear, trialBalance as tb, yearEnd, type PostedLine as PL } from './accounting/ledger.js';
import { computeCommission, tierFor, tierPeriodStart, tiersError } from './finance/money.js';

describe('comisiones por nivel', () => {
  const tiers = [{ from: 100000, agentSharePct: 60 }, { from: 0, agentSharePct: 50 }, { from: 250000, agentSharePct: 70 }];
  it('elige el nivel según lo vendido en el periodo', () => {
    expect(tierFor(tiers, 95000)).toEqual({ level: 1, agentSharePct: 50 });
    expect(tierFor(tiers, 100000)).toEqual({ level: 2, agentSharePct: 60 });
    expect(tierFor(tiers, 400000)).toEqual({ level: 3, agentSharePct: 70 });
    expect(tierFor([], 1)).toBeNull();
  });
  it('valida los niveles', () => {
    expect(tiersError(tiers)).toBeNull();
    expect(tiersError([{ from: 10, agentSharePct: 50 }])).toMatch(/empezar en 0/);
    expect(tiersError([{ from: 0, agentSharePct: 50 }, { from: 0, agentSharePct: 60 }])).toMatch(/mismo monto/);
    expect(tiersError([{ from: 0, agentSharePct: 120 }])).toMatch(/0 a 100/);
  });
  it('el nivel reemplaza el porcentaje de la regla y se anota en el nombre', () => {
    const rule = { name: 'Venta', operation: 'SALE', agentId: null, basis: 'PERCENT' as const, companyValue: 3, agentSharePct: 50, isActive: true };
    expect(computeCommission({ closedPrice: 100000, agreedPct: null, rule, tier: { level: 2, agentSharePct: 60 } })).toEqual({ companyAmount: 3000, agentAmount: 1800, agentSharePct: 60, ruleName: 'Venta · nivel 2' });
  });
  it('periodo: inicio del mes o del año en hora de Bolivia', () => {
    const now = new Date('2026-10-01T02:00:00Z'); // 30 de septiembre, 22:00 en Bolivia
    expect(tierPeriodStart('MONTH', now).toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(tierPeriodStart('YEAR', now).toISOString()).toBe('2026-01-01T04:00:00.000Z');
  });
});

describe('cierre de gestión', () => {
  const post = (n: number, lines: Array<[string, number, number]>): PL[] => lines.map(([accountCode, debit, credit]) => ({ accountCode, debit, credit, currency: 'USD', date: new Date(Date.UTC(2025, 5, n)), entryNumber: n, description: '' }));
  const year = [
    ...post(1, [['1102', 10000, 0], ['3101', 0, 10000]]),
    ...post(2, [['1102', 5000, 0], ['4101', 0, 5000]]),
    ...post(3, [['5102', 1200, 0], ['1102', 0, 1200]]),
    ...post(4, [['4199', 200, 0], ['1102', 0, 200]]), // ingreso con saldo invertido
  ];
  it('deja en cero ingresos y gastos y pasa el resultado a Resultados acumulados', () => {
    const { lines, result } = closingLines(tb(ACCS, year, 'USD').rows);
    expect(result).toBe(3600);
    expect(lines).toEqual([
      { accountCode: '4101', debit: 5000, credit: 0 },
      { accountCode: '4199', debit: 0, credit: 200 },
      { accountCode: '5102', debit: 0, credit: 1200 },
      { accountCode: '3201', debit: 0, credit: 3600 },
    ]);
    const after = tb(ACCS, [...year, ...lines.map((l) => ({ ...l, currency: 'USD', date: yearEnd(2025), entryNumber: 9, description: '' }))], 'USD');
    expect(after.balanced).toBe(true);
    expect(after.rows.filter((r) => r.type === 'INCOME' || r.type === 'EXPENSE').every((r) => r.balance === 0)).toBe(true);
    expect(after.rows.find((r) => r.code === '3201')!.balance).toBe(3600);
  });
  it('una pérdida va al debe de Resultados acumulados', () => {
    const { lines, result } = closingLines(tb(ACCS, post(1, [['5102', 900, 0], ['1101', 0, 900]]), 'USD').rows);
    expect(result).toBe(-900);
    expect(lines.at(-1)).toEqual({ accountCode: '3201', debit: 900, credit: 0 });
  });
  it('el año contable va del 1 de enero al 31 de diciembre en hora de Bolivia', () => {
    expect(inYear(new Date('2026-01-01T03:59:00Z'), 2025)).toBe(true);
    expect(inYear(new Date('2026-01-01T04:00:00Z'), 2025)).toBe(false);
    expect(inYear(yearEnd(2025), 2025)).toBe(true);
  });
});
