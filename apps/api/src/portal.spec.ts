import { describe, expect, it } from 'vitest';
import { describeCriteria, parseQuery, searchProperties, wordMatches } from './public/search.js';

const P = (code: string, o: Partial<Parameters<typeof searchProperties>[0][number]>) => ({
  code, title: '', type: 'HOUSE', operation: 'SALE', zone: null, city: 'Santa Cruz', price: 100000, currency: 'USD', bedrooms: 3, features: [], description: null, ...o,
});
const items = [
  P('A', { title: 'Casa en Equipetrol con jardín', zone: 'Equipetrol', price: 180000, bedrooms: 3, features: ['Jardín', 'Churrasquera'] }),
  P('B', { title: 'Departamento de 2 dormitorios', type: 'APARTMENT', zone: 'Norte', price: 95000, bedrooms: 2 }),
  P('C', { title: 'Monoambiente en anticrético', type: 'APARTMENT', operation: 'ANTICRETICO', zone: 'Sur', price: 28000, bedrooms: 1 }),
  P('D', { title: 'Terreno en Urubó', type: 'LAND', zone: 'Urubó', price: 75000, bedrooms: null }),
  P('E', { title: 'Departamento con vista en Sopocachi', type: 'APARTMENT', zone: 'Sopocachi', city: 'La Paz', price: 98000, bedrooms: 3 }),
];

describe('búsqueda del portal', () => {
  it('entiende tipo, operación, habitaciones y precio', () => {
    const c = parseQuery('Casa en venta en Equipetrol 3 dormitorios hasta 150000');
    expect(c).toMatchObject({ type: 'HOUSE', operation: 'SALE', minBedrooms: 3, maxPrice: 150000, words: ['equipetrol'] });
    expect(parseQuery('depto 120k').maxPrice).toBe(120000);
    expect(describeCriteria(c)).toContain('casa en venta');
  });
  it('tolera acentos, mayúsculas, prefijos y una letra mal', () => {
    expect(wordMatches('urubo', 'urubo')).toBe(true);
    expect(wordMatches('equi', 'equipetrol')).toBe(true);
    expect(wordMatches('equipetrl', 'equipetrol')).toBe(true);
    expect(wordMatches('casa', 'cosa')).toBe(false);
    expect(searchProperties(items, 'URUBÓ').results.map((r) => r.code)).toEqual(['D']);
    expect(searchProperties(items, 'sopocahi').results.map((r) => r.code)).toEqual(['E']);
  });
  it('filtra mientras se escribe', () => {
    expect(searchProperties(items, 'depa').results.map((r) => r.code)).toEqual(['B', 'E']);
    expect(searchProperties(items, 'departamento').results.map((r) => r.code)).toEqual(['B', 'C', 'E']);
    expect(searchProperties(items, '').results).toHaveLength(5);
  });
  it('sin coincidencias propone alternativas y explica la diferencia', () => {
    const r = searchProperties(items, 'casa en Sopocachi');
    expect(r.results).toHaveLength(0);
    expect(r.alternatives[0].code).toBe('E');
    expect(r.alternatives[0].why).toContain('Es departamento');
    const cheap = searchProperties(items, 'casa hasta 150000');
    expect(cheap.results).toHaveLength(0);
    expect(cheap.alternatives.map((a) => a.code)).toContain('A');
    expect(cheap.alternatives.find((a) => a.code === 'A')!.why).toContain('Precio un poco mayor');
  });
  it('si nada se parece, muestra las más nuevas', () => {
    const r = searchProperties(items, 'xyzqwe');
    expect(r.results).toHaveLength(0);
    expect(r.alternatives[0].why).toEqual(['Recién publicada']);
  });
  it('los selectores mandan sobre el texto y sugiere zonas', () => {
    expect(searchProperties(items, 'casa', { type: 'LAND' }).results.map((r) => r.code)).toEqual(['D']);
    expect(searchProperties(items, 'en Equ').suggestions).toEqual(['Equipetrol']);
  });
});

import { agreementClauses, commissionText, computeCommission, fromPct, toPct } from './captation/tools.js';

describe('herramientas de captación', () => {
  it('calcula la comisión de una venta en USD y Bs', () => {
    const r = computeCommission({ operation: 'SALE', price: 80000, currency: 'USD', value: 3, rate: 6.96 });
    expect(r).toMatchObject({ commission: 2400, usd: 2400, bob: 16704, pct: 3, ownerNet: 77600, error: null });
  });
  it('en alquiler la comisión se pide en meses', () => {
    const r = computeCommission({ operation: 'RENT', price: 3500, currency: 'BOB', value: 1, rate: 6.96 });
    expect(r.pct).toBe(100);
    expect(r.commission).toBe(3500);
    expect(r.usd).toBe(502.87);
    expect(r.ownerNet).toBe(38500);
    expect(toPct('RENT', 0.5)).toBe(50);
    expect(fromPct('RENT', 150)).toBe(1.5);
    expect(commissionText('RENT', 100)).toBe('1 mes de alquiler');
  });
  it('anticrético en porcentaje del monto', () => {
    const r = computeCommission({ operation: 'ANTICRETICO', price: 28000, currency: 'USD', value: 3, rate: 6.96 });
    expect(r.commission).toBe(840);
    expect(r.ownerNetLabel).toContain('anticrético');
  });
  it('valida los datos', () => {
    expect(computeCommission({ operation: 'SALE', price: 0, currency: 'USD', value: 3, rate: 6.96 }).error).toContain('precio');
    expect(computeCommission({ operation: 'RENT', price: 100, currency: 'USD', value: 13, rate: 6.96 }).error).toContain('12 meses');
    expect(computeCommission({ operation: 'SALE', price: 100, currency: 'USD', value: 3, rate: 0 }).error).toContain('tipo de cambio');
  });
  it('arma las cláusulas del acuerdo según la operación y la exclusividad', () => {
    const c = agreementClauses({ company: 'Inmo Demo', agentName: 'Juan', ownerName: 'María', ownerDocId: '1234567 SC', property: 'Casa', operation: 'RENT', price: 3500, currency: 'BOB', pct: 100, isExclusive: true, days: 90, extra: 'Llaves en portería.' });
    expect(c.map((x) => x.title)).toEqual(['Objeto', 'Precio', 'Comisión', 'Exclusividad', 'Qué hace la inmobiliaria', 'Qué hace el propietario', 'Acuerdos adicionales']);
    expect(c[2].text).toContain('1 mes de alquiler');
    expect(c[2].text).toContain('Bs 3.500');
    expect(c[3].text).toContain('en exclusiva');
    expect(c[3].text).toContain('90 días');
    expect(c[0].text).toContain('1234567 SC');
  });
});
