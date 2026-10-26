import { describe, expect, it } from 'vitest';
import { balanceSheet, DEFAULT_ACCOUNTS, entryError, entryFor, incomeStatement, ledger, reverse, trialBalance, type PostedLine } from './accounting/ledger.js';
import { parseAmount, parseDate, parseStatement, suggestMatches } from './bank/statement.js';
import { colorError, contrast, normalizeDomain } from './company/brand.js';
import { amountInWords, invoiceTotals } from './invoicing/invoice.js';

const post = (n: number, currency: string, lines: ReturnType<typeof entryFor>): PostedLine[] =>
  lines.map((l) => ({ ...l, currency, date: new Date(Date.UTC(2026, 9, n)), entryNumber: n, description: `Asiento ${n}` }));

describe('contabilidad', () => {
  it('un ingreso por transferencia debita Bancos y acredita el ingreso', () => {
    expect(entryFor({ kind: 'INCOME', category: 'SALE_COMMISSION', amount: 5250, method: 'TRANSFER' })).toEqual([
      { accountCode: '1102', debit: 5250, credit: 0 }, { accountCode: '4101', debit: 0, credit: 5250 },
    ]);
  });
  it('un gasto en efectivo debita el gasto y acredita Caja', () => {
    expect(entryFor({ kind: 'EXPENSE', category: 'TRANSPORT', amount: 150, method: 'CASH' })).toEqual([
      { accountCode: '5106', debit: 150, credit: 0 }, { accountCode: '1101', debit: 0, credit: 150 },
    ]);
  });
  it('una reserva recibida es un pasivo, no un ingreso', () => {
    expect(entryFor({ kind: 'INCOME', category: 'RESERVATION', amount: 1000, method: 'QR' })[1].accountCode).toBe('2102');
  });
  it('valida que el asiento cuadre', () => {
    expect(entryError([{ accountCode: '1101', debit: 100, credit: 0 }, { accountCode: '3101', debit: 0, credit: 100 }])).toBeNull();
    expect(entryError([{ accountCode: '1101', debit: 100, credit: 0 }, { accountCode: '3101', debit: 0, credit: 90 }])).toMatch(/no cuadra/);
    expect(entryError([{ accountCode: '1101', debit: 100, credit: 0 }])).toMatch(/dos líneas/);
    expect(entryError([{ accountCode: '1101', debit: 100, credit: 100 }, { accountCode: '3101', debit: 0, credit: 0 }])).toMatch(/debe o en el haber/);
  });
  const lines = [
    ...post(1, 'USD', [{ accountCode: '1102', debit: 10000, credit: 0 }, { accountCode: '3101', debit: 0, credit: 10000 }]),
    ...post(2, 'USD', entryFor({ kind: 'INCOME', category: 'SALE_COMMISSION', amount: 5250, method: 'TRANSFER' })),
    ...post(3, 'USD', entryFor({ kind: 'EXPENSE', category: 'COMMISSION_PAID', amount: 2625, method: 'TRANSFER' })),
    ...post(4, 'USD', entryFor({ kind: 'EXPENSE', category: 'ADVERTISING', amount: 400.1, method: 'CASH' })),
    ...post(5, 'BOB', entryFor({ kind: 'EXPENSE', category: 'OFFICE', amount: 3500, method: 'TRANSFER' })),
  ];
  it('el balance de comprobación cuadra y separa monedas', () => {
    const usd = trialBalance(DEFAULT_ACCOUNTS, lines, 'USD');
    expect(usd.balanced).toBe(true);
    expect(usd.debit).toBe(18275.1);
    expect(usd.rows.find((r) => r.code === '1102')!.balance).toBe(12625);
    expect(usd.rows.find((r) => r.code === '1101')!.balance).toBe(-400.1);
    expect(usd.rows.some((r) => r.code === '5105')).toBe(false);
    expect(trialBalance(DEFAULT_ACCOUNTS, lines, 'BOB').rows.map((r) => r.code)).toEqual(['1102', '5105']);
  });
  it('estado de resultados y balance general', () => {
    const { rows } = trialBalance(DEFAULT_ACCOUNTS, lines, 'USD');
    const is = incomeStatement(rows);
    expect([is.totalIncome, is.totalExpenses, is.result]).toEqual([5250, 3025.1, 2224.9]);
    const bs = balanceSheet(rows);
    expect([bs.totalAssets, bs.totalLiabilities, bs.totalEquity, bs.result, bs.balanced]).toEqual([12224.9, 0, 10000, 2224.9, true]);
  });
  it('anular con el asiento inverso deja los saldos como antes', () => {
    const before = trialBalance(DEFAULT_ACCOUNTS, lines, 'USD').rows.find((r) => r.code === '5102')!.balance;
    const undone = [...lines, ...post(6, 'USD', reverse(entryFor({ kind: 'EXPENSE', category: 'ADVERTISING', amount: 400.1, method: 'CASH' })))];
    const tb = trialBalance(DEFAULT_ACCOUNTS, undone, 'USD');
    expect(before).toBe(400.1);
    expect(tb.rows.find((r) => r.code === '5102')!.balance).toBe(0);
    expect(tb.balanced).toBe(true);
  });
  it('libro mayor con saldo acumulado', () => {
    const bank = ledger(DEFAULT_ACCOUNTS[1], lines, 'USD');
    expect(bank.map((l) => l.balance)).toEqual([10000, 15250, 12625]);
  });
});

describe('facturas', () => {
  it('el IVA va incluido en el total', () => {
    const t = invoiceTotals([{ description: 'Comisión por venta', quantity: 1, unitPrice: 5250 }, { description: 'Avalúo', quantity: 2, unitPrice: 350.5 }]);
    expect([t.total, t.taxAmount, t.net]).toEqual([5951, 773.63, 5177.37]);
    expect(t.lines[1].amount).toBe(701);
  });
  it('importe en letras', () => {
    expect(amountInWords(1200.5, 'BOB')).toBe('Mil doscientos 50/100 bolivianos');
    expect(amountInWords(21000, 'USD')).toBe('Veintiún mil 00/100 dólares');
    expect(amountInWords(1000100, 'BOB')).toBe('Un millón cien 00/100 bolivianos');
    expect(amountInWords(531, 'BOB')).toBe('Quinientos treinta y uno 00/100 bolivianos');
    expect(amountInWords(0.99, 'BOB')).toBe('Cero 99/100 bolivianos');
  });
});

describe('extracto bancario', () => {
  it('lee importes en varios formatos', () => {
    expect(['1.234,56', '1,234.56', '1234.56', '(120,00)', '-120', '1.500', '2,5', 'Bs 3.500,00', 'abc'].map(parseAmount)).toEqual([1234.56, 1234.56, 1234.56, -120, -120, 1500, 2.5, 3500, null]);
  });
  it('lee fechas día/mes/año y año-mes-día, y rechaza las imposibles', () => {
    expect(parseDate('05/10/2026')!.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(parseDate('2026-10-05 14:30')!.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(parseDate('5-10-26')!.toISOString().slice(0, 10)).toBe('2026-10-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('hola')).toBeNull();
  });
  it('lee un extracto con columnas de débito y crédito', () => {
    const r = parseStatement('Fecha;Glosa;Nro Documento;Débito;Crédito\n01/10/2026;"Depósito; cliente";A-1;;5.250,00\n02/10/2026;Pago alquiler;A-2;3.500,00;\n03/10/2026;Sin monto;A-3;;\nmala;X;A-4;1;');
    expect(r.lines.map((l) => [l.amount, l.description, l.reference])).toEqual([[5250, 'Depósito; cliente', 'A-1'], [-3500, 'Pago alquiler', 'A-2']]);
    expect(r.errors).toEqual(['Fila 4: monto no reconocido', 'Fila 5: fecha no reconocida']);
  });
  it('lee un extracto con una sola columna de monto y separador coma', () => {
    const r = parseStatement('date,description,amount\n2026-10-01,Deposit,"1,200.50"\n2026-10-01,Fee,-12.00');
    expect(r.lines.map((l) => l.amount)).toEqual([1200.5, -12]);
  });
  it('dos líneas idénticas no se confunden, y reimportar da las mismas huellas', () => {
    const csv = 'Fecha;Detalle;Monto\n01/10/2026;Comisión;-5\n01/10/2026;Comisión;-5';
    const a = parseStatement(csv).lines, b = parseStatement(csv).lines;
    expect(a[0].fingerprint).not.toBe(a[1].fingerprint);
    expect(a.map((l) => l.fingerprint)).toEqual(b.map((l) => l.fingerprint));
  });
  it('explica qué columna falta', () => {
    expect(parseStatement('Detalle;Monto\nX;1').errors[0]).toMatch(/fecha/);
    expect(parseStatement('Fecha;Detalle\n01/10/2026;X').errors[0]).toMatch(/monto/);
  });
  it('sugiere el movimiento con mismo sentido, importe y fecha cercana', () => {
    const d = (n: number) => new Date(Date.UTC(2026, 9, n, 12));
    const cands = [
      { id: 'a', kind: 'INCOME' as const, amount: 5250, date: d(10), description: '' },
      { id: 'b', kind: 'INCOME' as const, amount: 5250, date: d(3), description: '' },
      { id: 'c', kind: 'EXPENSE' as const, amount: 5250, date: d(2), description: '' },
      { id: 'd', kind: 'INCOME' as const, amount: 5250.5, date: d(2), description: '' },
      { id: 'e', kind: 'INCOME' as const, amount: 5250, date: d(1), description: '' },
    ];
    expect(suggestMatches({ amount: 5250, date: d(2) }, cands).map((c) => c.id)).toEqual(['b', 'e']);
    expect(suggestMatches({ amount: -5250, date: d(2) }, cands).map((c) => c.id)).toEqual(['c']);
  });
});

describe('marca y dominios', () => {
  it('acepta colores oscuros y rechaza los que no dejan leer el texto claro', () => {
    expect(colorError('#0B3C49')).toBeNull();
    expect(colorError('#0F766E')).toBeNull();
    expect(colorError(null)).toBeNull();
    expect(colorError('#A3E635')).toMatch(/muy claro/);
    expect(colorError('rojo')).toMatch(/#RRGGBB/);
    expect(contrast('#000000', '#ffffff')).toBe(21);
  });
  it('normaliza dominios y rechaza los de la plataforma', () => {
    expect(normalizeDomain(' https://WWW.InmobiliariaABC.com/ ', 'softinmo.com')).toBe('www.inmobiliariaabc.com');
    expect(normalizeDomain('abc.softinmo.com', 'softinmo.com')).toBeNull();
    expect(normalizeDomain('softinmo.com', 'softinmo.com')).toBeNull();
    expect(normalizeDomain('localhost', 'softinmo.com')).toBeNull();
    expect(normalizeDomain('demo.localhost', 'softinmo.com')).toBeNull();
    expect(normalizeDomain('mal dominio.com', 'softinmo.com')).toBeNull();
    expect(normalizeDomain('192.168.1.1', 'softinmo.com')).toBeNull();
  });
});
