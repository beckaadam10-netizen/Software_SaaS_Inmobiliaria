/** Compatibilidad entre lo que busca un cliente y una propiedad. Función pura, sin base de datos. */
export interface Prefs {
  prefOperation: string | null;
  prefType: string | null;
  prefZone: string | null;
  prefBudgetMax: unknown;
  prefCurrency: string | null;
  prefBedrooms: number | null;
}
export interface Listing {
  operation: string;
  type: string;
  zone: string | null;
  price: unknown;
  currency: string;
  bedrooms: number | null;
}
export interface MatchResult {
  score: number;
  reasons: string[];
  misses: string[];
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Devuelve null cuando no hay nada que comparar o cuando la operación buscada es otra
 * (quien busca alquilar no es compatible con una venta). El puntaje es el porcentaje
 * de criterios del cliente que la propiedad cumple.
 */
export function matchScore(prefs: Prefs, listing: Listing): MatchResult | null {
  if (prefs.prefOperation && prefs.prefOperation !== listing.operation) return null;
  const reasons: string[] = [];
  const misses: string[] = [];
  const test = (applies: boolean, ok: boolean, label: string) => {
    if (applies) (ok ? reasons : misses).push(label);
  };

  test(!!prefs.prefOperation, true, 'Operación');
  test(!!prefs.prefType, prefs.prefType === listing.type, 'Tipo de propiedad');
  if (prefs.prefZone) {
    const want = norm(prefs.prefZone);
    const have = norm(listing.zone ?? '');
    test(true, !!have && (have.includes(want) || want.includes(have)), 'Zona');
  }
  const budget = Number(prefs.prefBudgetMax);
  // El presupuesto solo se compara en la misma moneda; no se asume tipo de cambio.
  if (prefs.prefBudgetMax != null && budget > 0 && (prefs.prefCurrency ?? 'USD') === listing.currency) {
    test(true, Number(listing.price) <= budget * 1.05, 'Presupuesto');
  }
  test(prefs.prefBedrooms != null && prefs.prefBedrooms > 0, (listing.bedrooms ?? 0) >= (prefs.prefBedrooms ?? 0), 'Habitaciones');

  const total = reasons.length + misses.length;
  if (total === 0) return null;
  return { score: Math.round((reasons.length / total) * 100), reasons, misses };
}

export const MATCH_THRESHOLD = 60;
