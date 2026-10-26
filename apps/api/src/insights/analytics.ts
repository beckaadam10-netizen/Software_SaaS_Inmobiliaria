import { DAY, daysBetween, ON_OFFER, sumByCurrency, type Snapshot } from './snapshot.js';

export interface Range {
  from?: Date;
  to?: Date;
}
const within = (d: Date, r: Range) => (!r.from || d >= r.from) && (!r.to || d.getTime() < r.to.getTime() + DAY);
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export interface FunnelStep {
  key: 'views' | 'leads' | 'visits' | 'offers' | 'negotiations' | 'sales';
  label: string;
  value: number;
  /** Porcentaje respecto del paso anterior; null cuando el paso anterior es cero. */
  rate: number | null;
}

/** Embudo: visualizaciones → interesados → visitas → ofertas → negociaciones → ventas. */
export function funnel(s: Snapshot, range: Range = {}): FunnelStep[] {
  const dayIn = (day: string) => within(new Date(`${day}T12:00:00Z`), range);
  // Sin fechas se usa el contador histórico de cada propiedad; con fechas, el registro diario.
  const views = range.from || range.to ? s.stats.filter((x) => dayIn(x.day)).reduce((a, x) => a + x.views, 0) : s.properties.reduce((a, p) => a + p.viewCount, 0);
  const offers = s.offers.filter((o) => o.kind === 'OFFER' && within(o.createdAt, range));
  const values: Array<[FunnelStep['key'], string, number]> = [
    ['views', 'Visualizaciones', views],
    ['leads', 'Interesados', s.leads.filter((l) => within(l.createdAt, range)).length],
    ['visits', 'Visitas', s.visits.filter((v) => !['CANCELLED', 'NO_SHOW'].includes(v.status) && within(v.scheduledAt, range)).length],
    ['offers', 'Ofertas', offers.length],
    ['negotiations', 'Negociaciones', new Set(offers.map((o) => o.caseId)).size],
    ['sales', 'Ventas', s.cases.filter((c) => c.status === 'WON' && c.closedAt && within(c.closedAt, range)).length],
  ];
  return values.map(([key, label, value], i) => ({ key, label, value, rate: i === 0 ? null : pct(value, values[i - 1][2]) }));
}

/** Días promedio entre abrir y cerrar una operación ganada. null si aún no hay cierres. */
export function avgDaysToClose(s: Snapshot, agentId?: string): number | null {
  const won = s.cases.filter((c) => c.status === 'WON' && c.closedAt && (!agentId || c.agentId === agentId));
  if (!won.length) return null;
  return Math.round(won.reduce((a, c) => a + Math.max(0, daysBetween(c.createdAt, c.closedAt!)), 0) / won.length);
}

export function agentStats(s: Snapshot, range: Range = {}) {
  return s.users
    .filter((u) => u.role === 'AGENT' || u.role === 'ADMIN')
    .map((u) => {
      const leads = s.leads.filter((l) => l.agentId === u.id && within(l.createdAt, range));
      const won = s.cases.filter((c) => c.agentId === u.id && c.status === 'WON' && c.closedAt && within(c.closedAt, range));
      const caseIds = new Set(s.cases.filter((c) => c.agentId === u.id).map((c) => c.id));
      return {
        agent: { id: u.id, fullName: u.fullName },
        properties: s.properties.filter((p) => p.agentId === u.id && ON_OFFER.includes(p.status)).length,
        leads: leads.length,
        visits: s.visits.filter((v) => v.agentId === u.id && v.status === 'DONE' && within(v.scheduledAt, range)).length,
        negotiations: new Set(s.offers.filter((o) => caseIds.has(o.caseId) && within(o.createdAt, range)).map((o) => o.caseId)).size,
        sales: won.length,
        valueSold: sumByCurrency(won, (c) => c.closedPrice ?? c.price),
        commissions: sumByCurrency(s.commissions.filter((c) => c.agentId === u.id && c.status !== 'CANCELLED' && won.some((w) => w.id === c.caseId)), (c) => c.agentAmount),
        conversion: pct(won.length, leads.length),
        avgDaysToClose: avgDaysToClose(s, u.id),
      };
    })
    .filter((a) => a.properties + a.leads + a.visits + a.sales > 0);
}

export type DemandLevel = 'HIGH' | 'MEDIUM' | 'LOW';
/**
 * Demanda de cada propiedad en oferta, medida con hechos de los últimos 30 días
 * (interesados y vistas) y comparada con los 30 días anteriores.
 */
export function demand(s: Snapshot) {
  const since = s.now.getTime() - 30 * DAY;
  const before = since - 30 * DAY;
  const dayMs = (day: string) => new Date(`${day}T12:00:00Z`).getTime();
  return s.properties
    .filter((p) => ON_OFFER.includes(p.status))
    .map((p) => {
      const leads = s.leads.filter((l) => l.propertyId === p.id);
      const leads30 = leads.filter((l) => l.createdAt.getTime() >= since).length;
      const leadsPrev = leads.filter((l) => l.createdAt.getTime() >= before && l.createdAt.getTime() < since).length;
      const views30 = s.stats.filter((x) => x.propertyId === p.id && dayMs(x.day) >= since).reduce((a, x) => a + x.views, 0);
      const visits30 = s.visits.filter((v) => v.propertyId === p.id && v.scheduledAt.getTime() >= since && v.status !== 'CANCELLED').length;
      const level: DemandLevel = leads30 >= 3 || (leads30 >= 2 && visits30 >= 1) ? 'HIGH' : leads30 >= 1 || views30 >= 15 ? 'MEDIUM' : 'LOW';
      return {
        id: p.id, code: p.code, title: p.title, zone: p.zone, isPublished: p.isPublished, daysOnMarket: Math.max(0, daysBetween(p.createdAt, s.now)),
        leads30, leadsPrev, views30, visits30, level, trend: leads30 > leadsPrev ? 'UP' : leads30 < leadsPrev ? 'DOWN' : 'FLAT',
      };
    })
    .sort((a, b) => b.leads30 - a.leads30 || b.views30 - a.views30);
}

/** Zonas más buscadas: clientes que las piden frente a propiedades disponibles ahí. */
export function zones(s: Snapshot) {
  const map = new Map<string, { zone: string; wanted: number; available: number; leads: number }>();
  const row = (zone: string) => {
    const key = zone.trim().toLowerCase();
    if (!map.has(key)) map.set(key, { zone: zone.trim(), wanted: 0, available: 0, leads: 0 });
    return map.get(key)!;
  };
  for (const c of s.contacts) if (c.prefZone?.trim()) row(c.prefZone).wanted++;
  for (const p of s.properties) {
    if (!p.zone?.trim() || !ON_OFFER.includes(p.status)) continue;
    const r = row(p.zone);
    r.available++;
    r.leads += s.leads.filter((l) => l.propertyId === p.id).length;
  }
  return [...map.values()].sort((a, b) => b.wanted + b.leads - (a.wanted + a.leads)).slice(0, 12);
}
