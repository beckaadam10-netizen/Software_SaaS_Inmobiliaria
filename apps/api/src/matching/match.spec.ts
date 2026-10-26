import { matchScore } from './match.js';

const casa = { operation: 'SALE', type: 'HOUSE', zone: 'Equipetrol Norte', price: 180000, currency: 'USD', bedrooms: 3 };
const none = { prefOperation: null, prefType: null, prefZone: null, prefBudgetMax: null, prefCurrency: null, prefBedrooms: null };

describe('matching cliente-propiedad', () => {
  it('coincidencia completa da 100', () => {
    const r = matchScore({ prefOperation: 'SALE', prefType: 'HOUSE', prefZone: 'equipetrol', prefBudgetMax: 200000, prefCurrency: 'USD', prefBedrooms: 3 }, casa);
    expect(r?.score).toBe(100);
    expect(r?.misses).toEqual([]);
  });
  it('otra operación no es compatible', () => {
    expect(matchScore({ ...none, prefOperation: 'RENT', prefType: 'HOUSE' }, casa)).toBeNull();
  });
  it('sin preferencias no hay nada que comparar', () => {
    expect(matchScore(none, casa)).toBeNull();
  });
  it('cuenta los criterios que no se cumplen', () => {
    const r = matchScore({ ...none, prefOperation: 'SALE', prefType: 'APARTMENT', prefBudgetMax: 100000, prefCurrency: 'USD', prefBedrooms: 2 }, casa);
    expect(r?.score).toBe(50);
    expect(r?.misses).toEqual(['Tipo de propiedad', 'Presupuesto']);
  });
  it('tolera 5 % sobre el presupuesto', () => {
    expect(matchScore({ ...none, prefBudgetMax: 175000, prefCurrency: 'USD' }, casa)?.score).toBe(100);
    expect(matchScore({ ...none, prefBudgetMax: 170000, prefCurrency: 'USD' }, casa)?.score).toBe(0);
  });
  it('no compara presupuestos en otra moneda', () => {
    expect(matchScore({ ...none, prefType: 'HOUSE', prefBudgetMax: 1000, prefCurrency: 'BOB' }, casa)?.reasons).toEqual(['Tipo de propiedad']);
  });
  it('ignora tildes y mayúsculas en la zona', () => {
    expect(matchScore({ ...none, prefZone: 'URUBÓ' }, { ...casa, zone: 'Urubo' })?.score).toBe(100);
  });
});
