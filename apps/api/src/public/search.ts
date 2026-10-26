/**
 * Búsqueda del portal público: entiende frases como "casa en venta en Equipetrol 3 dormitorios hasta 150000",
 * tolera acentos y errores de una letra, y si nada coincide propone alternativas parecidas explicando la diferencia.
 * Función pura: la usan la API y la demo.
 */

export type SearchItem = {
  code: string; title: string; type: string; operation: string; zone: string | null; city: string | null;
  price: number; currency: string; bedrooms: number | null; features?: unknown; description?: string | null;
};
export type Criteria = { type?: string; operation?: string; minBedrooms?: number; maxPrice?: number; words: string[] };
export type Alternative<T> = T & { why: string[] };
export type SearchResult<T> = { criteria: Criteria; results: T[]; alternatives: Array<Alternative<T>>; suggestions: string[] };

export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const TYPE_WORDS: Record<string, string> = {
  casa: 'HOUSE', casas: 'HOUSE', vivienda: 'HOUSE', viviendas: 'HOUSE',
  departamento: 'APARTMENT', departamentos: 'APARTMENT', depto: 'APARTMENT', deptos: 'APARTMENT', dpto: 'APARTMENT', monoambiente: 'APARTMENT', monoambientes: 'APARTMENT', duplex: 'APARTMENT',
  terreno: 'LAND', terrenos: 'LAND', lote: 'LAND', lotes: 'LAND',
  oficina: 'OFFICE', oficinas: 'OFFICE',
  local: 'COMMERCIAL', locales: 'COMMERCIAL', comercial: 'COMMERCIAL',
  galpon: 'WAREHOUSE', galpones: 'WAREHOUSE', deposito: 'WAREHOUSE', depositos: 'WAREHOUSE',
};
const OP_WORDS: Record<string, string> = {
  venta: 'SALE', ventas: 'SALE', vender: 'SALE', compra: 'SALE', comprar: 'SALE',
  alquiler: 'RENT', alquileres: 'RENT', alquilar: 'RENT', renta: 'RENT', arriendo: 'RENT',
  anticretico: 'ANTICRETICO', anticreticos: 'ANTICRETICO',
};
const BED_WORDS = /^(hab|habs|habitacion|habitaciones|dorm|dorms|dormitorio|dormitorios|cuarto|cuartos|recamaras?)$/;
const STOP = new Set(['de', 'del', 'en', 'la', 'el', 'los', 'las', 'con', 'y', 'o', 'para', 'un', 'una', 'unos', 'unas', 'por', 'a', 'al', 'zona', 'cerca', 'busco', 'quiero', 'hasta', 'menos', 'maximo', 'max', 'usd', 'bs', 'dolares', 'bolivianos', '$us', 'sus', 'mas', 'que']);
const TYPE_LABEL: Record<string, string> = { HOUSE: 'casa', APARTMENT: 'departamento', LAND: 'terreno', OFFICE: 'oficina', COMMERCIAL: 'local comercial', WAREHOUSE: 'galpón o depósito', OTHER: 'otro tipo' };
const OP_LABEL: Record<string, string> = { SALE: 'en venta', RENT: 'en alquiler', ANTICRETICO: 'en anticrético' };

/** Distancia de edición acotada (corta en cuanto supera el máximo). */
function within(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

/** Una palabra buscada coincide con una del texto si es su comienzo o difiere en una letra (palabras de 5 o más). */
export function wordMatches(token: string, word: string) {
  if (token.length >= 2 && word.startsWith(token)) return true;
  if (token.length < 5) return false;
  return within(token, word, 1) || within(token, word.slice(0, token.length), 1);
}

/** Convierte el texto libre en criterios. Los filtros elegidos en los selectores mandan sobre el texto. */
export function parseQuery(q: string, filters: { type?: string; operation?: string } = {}): Criteria {
  const tokens = normalize(q).replace(/[^\p{L}\p{N}$]+/gu, ' ').split(' ').filter(Boolean);
  const c: Criteria = { words: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (TYPE_WORDS[t]) { c.type = TYPE_WORDS[t]; continue; }
    if (OP_WORDS[t]) { c.operation = OP_WORDS[t]; continue; }
    if (/^\d+$/.test(t)) {
      const n = Number(t), next = tokens[i + 1] ?? '';
      if (BED_WORDS.test(next) && n > 0 && n < 20) { c.minBedrooms = n; i++; continue; }
      if (n >= 1000) { c.maxPrice = n; continue; }
      continue;
    }
    const k = t.match(/^(\d+)k$/);
    if (k) { c.maxPrice = Number(k[1]) * 1000; continue; }
    if (BED_WORDS.test(t) || STOP.has(t) || t.length < 2) continue;
    c.words.push(t);
  }
  if (filters.type) c.type = filters.type;
  if (filters.operation) c.operation = filters.operation;
  return c;
}

const haystack = (p: SearchItem) => {
  const feats = Array.isArray(p.features) ? (p.features as unknown[]).filter((f) => typeof f === 'string').join(' ') : '';
  return normalize([p.title, p.zone, p.city, feats, p.description ?? ''].join(' ')).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
};

/** Cada criterio pesa 1; el lugar o las palabras pesan 2, porque la zona suele ser lo que más importa. */
type Check = { ok: boolean; why: string; weight?: number };
function checks(p: SearchItem, c: Criteria, words: string[]): Check[] {
  const out: Check[] = [];
  if (c.type) out.push({ ok: p.type === c.type, why: `Es ${TYPE_LABEL[p.type] ?? 'otro tipo'}` });
  if (c.operation) out.push({ ok: p.operation === c.operation, why: `Está ${OP_LABEL[p.operation] ?? ''}`.trim() });
  if (c.minBedrooms) out.push({ ok: (p.bedrooms ?? 0) >= c.minBedrooms, why: p.bedrooms ? `Tiene ${p.bedrooms} ${p.bedrooms === 1 ? 'habitación' : 'habitaciones'}` : 'Sin habitaciones' });
  if (c.maxPrice) out.push({ ok: p.price <= c.maxPrice, why: 'Precio un poco mayor' });
  if (c.words.length) {
    const hits = c.words.filter((t) => words.some((w) => wordMatches(t, w)));
    out.push({ weight: 2, ok: hits.length === c.words.length, why: hits.length ? `Coincide con «${hits.join(' ')}»` : (p.zone ? `En otra zona: ${p.zone}` : 'En otra zona') });
    // Las palabras que sí coinciden suman, aunque no estén todas.
    for (let i = 1; i < hits.length; i++) out.push({ ok: true, why: '' });
  }
  return out;
}

/**
 * Busca en las propiedades publicadas (ya ordenadas de la más nueva a la más vieja).
 * results: cumplen todo. alternatives: hasta `max` parecidas, con lo que cambia; si nada se parece, las más nuevas.
 */
export function searchProperties<T extends SearchItem>(items: T[], q: string, filters: { type?: string; operation?: string } = {}, max = 6): SearchResult<T> {
  const criteria = parseQuery(q, filters);
  const empty = !criteria.type && !criteria.operation && !criteria.minBedrooms && !criteria.maxPrice && !criteria.words.length;
  if (empty) return { criteria, results: items, alternatives: [], suggestions: [] };

  const results: T[] = [];
  const near: Array<{ item: T; score: number; why: string[]; priceGap: number }> = [];
  for (const item of items) {
    const list = checks(item, criteria, haystack(item));
    if (list.every((x) => x.ok)) { results.push(item); continue; }
    const score = list.filter((x) => x.ok).reduce((n, x) => n + (x.weight ?? 1), 0);
    // Precio: se aceptan alternativas hasta 30 % por encima del máximo pedido.
    const priceGap = criteria.maxPrice ? Math.max(0, item.price - criteria.maxPrice) / criteria.maxPrice : 0;
    if (score > 0 && priceGap <= 0.3) near.push({ item, score, priceGap, why: list.filter((x) => !x.ok).map((x) => x.why).concat(list.filter((x) => x.ok && x.why.startsWith('Coincide')).map((x) => x.why)) });
  }
  near.sort((a, b) => b.score - a.score || a.priceGap - b.priceGap);
  let alternatives = near.slice(0, max).map((n) => ({ ...n.item, why: n.why.filter(Boolean).slice(0, 2) }));
  if (!results.length && !alternatives.length) alternatives = items.slice(0, max).map((item) => ({ ...item, why: ['Recién publicada'] }));

  // Sugerencias de zona y ciudad para la última palabra que se está escribiendo.
  const last = normalize(q.trim().split(/\s+/).pop() ?? '');
  const places = [...new Set(items.flatMap((p) => [p.zone, p.city]).filter((x): x is string => !!x))];
  const suggestions = last.length >= 2 ? places.filter((pl) => normalize(pl).split(/\s+/).some((w) => w.startsWith(last)) && !normalize(q).includes(normalize(pl))).slice(0, 5) : [];
  return { criteria, results, alternatives: results.length >= max ? [] : alternatives.slice(0, Math.max(0, max - Math.min(results.length, max))), suggestions };
}

/** Frase corta que describe lo que se entendió, para mostrar arriba de los resultados. */
export function describeCriteria(c: Criteria) {
  const parts = [c.type ? TYPE_LABEL[c.type] : 'propiedades', c.operation ? OP_LABEL[c.operation] : '', c.words.length ? `con «${c.words.join(' ')}»` : '', c.minBedrooms ? `de ${c.minBedrooms}+ habitaciones` : '', c.maxPrice ? `hasta ${c.maxPrice.toLocaleString('es-BO')}` : ''];
  return parts.filter(Boolean).join(' ');
}
