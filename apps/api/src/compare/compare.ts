/** Comparador de propiedades. Función pura: la usan el panel, el portal público y la demo. */
export interface ComparableProperty {
  code: string; title: string; type: string; operation: string; price: number; currency: string; zone: string | null; city: string | null;
  areaM2: number | null; builtM2: number | null; bedrooms: number | null; bathrooms: number | null; parking: number | null; yearBuilt: number | null; features: string[];
}
export interface CompareRow { key: string; label: string; values: Array<string | null>; best: number[] }

const round = (n: number) => Math.round(n * 100) / 100;
const fmtMoney = (n: number, cur: string) => `${cur === 'BOB' ? 'Bs' : 'USD'} ${n.toLocaleString('es-BO', { maximumFractionDigits: 2 })}`;

/** Precio por m²: se usa la superficie construida y, si no hay, la de terreno. */
export function pricePerM2(p: Pick<ComparableProperty, 'price' | 'builtM2' | 'areaM2'>): number | null {
  const area = p.builtM2 || p.areaM2;
  return area ? round(p.price / area) : null;
}

/**
 * Filas de la comparación. `best` marca las columnas con el mejor valor de cada fila numérica
 * (menor precio y precio/m², mayor superficie, más ambientes, menor antigüedad). Solo se marca si los
 * valores son comparables: misma moneda y operación en los precios, y al menos dos propiedades con dato.
 */
export function compareProperties(list: ComparableProperty[], now = new Date()): { rows: CompareRow[]; features: Array<{ name: string; has: boolean[] }> } {
  // Un alquiler mensual no se compara con un precio de venta, ni dólares con bolivianos.
  const sameCurrency = new Set(list.map((p) => `${p.currency}|${p.operation}`)).size === 1;
  const num = (key: string, label: string, get: (p: ComparableProperty) => number | null, show: (n: number, p: ComparableProperty) => string, better: 'low' | 'high', comparable = true): CompareRow => {
    const values = list.map(get);
    const present = values.filter((v): v is number => v != null);
    const target = better === 'low' ? Math.min(...present) : Math.max(...present);
    const best = comparable && present.length >= 2 && new Set(present).size > 1 ? values.flatMap((v, i) => (v === target ? [i] : [])) : [];
    return { key, label, values: values.map((v, i) => (v == null ? null : show(v, list[i]))), best };
  };
  const age = (p: ComparableProperty) => (p.yearBuilt ? Math.max(0, now.getFullYear() - p.yearBuilt) : null);
  const rows: CompareRow[] = [
    num('price', 'Precio', (p) => p.price, (n, p) => fmtMoney(n, p.currency), 'low', sameCurrency),
    num('ppm2', 'Precio por m²', pricePerM2, (n, p) => fmtMoney(n, p.currency), 'low', sameCurrency),
    num('builtM2', 'Superficie construida', (p) => p.builtM2, (n) => `${n} m²`, 'high'),
    num('areaM2', 'Superficie de terreno', (p) => p.areaM2, (n) => `${n} m²`, 'high'),
    num('bedrooms', 'Habitaciones', (p) => p.bedrooms, String, 'high'),
    num('bathrooms', 'Baños', (p) => p.bathrooms, String, 'high'),
    num('parking', 'Parqueos', (p) => p.parking, String, 'high'),
    num('age', 'Antigüedad', age, (n) => (n === 0 ? 'A estrenar' : `${n} ${n === 1 ? 'año' : 'años'}`), 'low'),
    { key: 'zone', label: 'Zona', values: list.map((p) => [p.zone, p.city].filter(Boolean).join(', ') || null), best: [] },
  ];
  // Todas las características que tiene al menos una, sin repetir mayúsculas o tildes distintas.
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const names = new Map<string, string>();
  for (const p of list) for (const f of p.features) if (!names.has(norm(f))) names.set(norm(f), f.trim());
  const features = [...names].map(([key, name]) => ({ name, has: list.map((p) => p.features.some((f) => norm(f) === key)) })).sort((a, b) => b.has.filter(Boolean).length - a.has.filter(Boolean).length);
  return { rows, features };
}
