import { contentPrompt, templateContent, type PropertyFacts } from '../ai/content.js';
import { agentStats, avgDaysToClose, demand, funnel, zones } from './analytics.js';
import { computeAlerts } from './alerts.js';
import { answer, detectIntent } from './assistant.js';
import { DAY, type Snapshot } from './snapshot.js';

const now = new Date('2026-10-20T15:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const day = (days: number) => ago(days).toISOString().slice(0, 10);
const P = (id: string, o: Partial<Snapshot['properties'][0]> = {}) => ({ id, code: id.toUpperCase(), title: `Casa ${id}`, type: 'HOUSE', operation: 'SALE', status: 'AVAILABLE', isPublished: true, price: 100000, currency: 'USD', zone: 'Equipetrol', bedrooms: 3, viewCount: 0, agentId: 'juan', ownerId: null, createdAt: ago(40), ...o });
const C = (id: string, fullName: string, o: Partial<Snapshot['contacts'][0]> = {}) => ({ id, fullName, phone: '70000000', type: 'PROSPECT', assignedAgentId: 'juan', createdAt: ago(10), prefOperation: null, prefType: null, prefZone: null, prefBudgetMax: null, prefCurrency: null, prefBedrooms: null, ...o });
const L = (id: string, contactId: string, propertyId: string | null, status: string, created: number, updated = created) => ({ id, contactId, propertyId, agentId: 'juan', status, source: 'WEB', score: 50, createdAt: ago(created), updatedAt: ago(updated) });

function snap(): Snapshot {
  return {
    now,
    users: [{ id: 'juan', fullName: 'Juan Pérez', role: 'AGENT' }, { id: 'ana', fullName: 'Ana Admin', role: 'ADMIN' }],
    properties: [P('p1', { viewCount: 200 }), P('p2', { viewCount: 50, createdAt: ago(90), zone: 'Urubó' }), P('p3', { status: 'SOLD', isPublished: false, viewCount: 30 })],
    contacts: [C('c1', 'Carlos Mendoza', { prefOperation: 'SALE', prefType: 'HOUSE', prefZone: 'equipetrol', prefBudgetMax: 120000, prefCurrency: 'USD', prefBedrooms: 3 }), C('c2', 'Ana Gutiérrez', { prefOperation: 'RENT' }), C('c3', 'Diego Roca', { prefZone: 'Urubó' })],
    leads: [L('l1', 'c1', 'p1', 'NEW', 3), L('l2', 'c2', 'p1', 'CONTACTED', 20, 9), L('l3', 'c3', 'p1', 'VISIT', 5, 1), L('l4', 'c3', 'p3', 'CLOSED', 30, 12), L('l5', 'c1', 'p1', 'INTERESTED', 4, 1)],
    visits: [
      { id: 'v1', propertyId: 'p1', contactId: 'c3', agentId: 'juan', status: 'DONE', scheduledAt: ago(2) },
      { id: 'v2', propertyId: 'p1', contactId: 'c1', agentId: 'juan', status: 'REQUESTED', scheduledAt: ago(-2) },
      { id: 'v3', propertyId: 'p1', contactId: 'c2', agentId: 'juan', status: 'CANCELLED', scheduledAt: ago(1) },
      { id: 'v4', propertyId: 'p1', contactId: 'c1', agentId: 'juan', status: 'CONFIRMED', scheduledAt: ago(-0.5) },
    ],
    cases: [
      { id: 'k1', code: 'EXP-1', propertyId: 'p1', agentId: 'juan', clientId: null, status: 'OPEN', currentStage: 'NEGOTIATION', price: 100000, closedPrice: null, currency: 'USD', createdAt: ago(40), updatedAt: ago(1), closedAt: null, captationEnds: ago(-3) },
      { id: 'k2', code: 'EXP-2', propertyId: 'p2', agentId: 'juan', clientId: null, status: 'OPEN', currentStage: 'MARKETING', price: 80000, closedPrice: null, currency: 'USD', createdAt: ago(90), updatedAt: ago(20), closedAt: null, captationEnds: null },
      { id: 'k3', code: 'EXP-3', propertyId: 'p3', agentId: 'juan', clientId: 'c3', status: 'WON', currentStage: 'POST_SALE', price: 150000, closedPrice: 140000, currency: 'USD', createdAt: ago(42), updatedAt: ago(12), closedAt: ago(12), captationEnds: null },
    ],
    offers: [
      { id: 'o1', caseId: 'k1', contactId: 'c3', kind: 'OFFER', amount: 92000, currency: 'USD', status: 'PENDING', createdAt: ago(6) },
      { id: 'o2', caseId: 'k3', contactId: 'c3', kind: 'OFFER', amount: 140000, currency: 'USD', status: 'ACCEPTED', createdAt: ago(14) },
      { id: 'o3', caseId: 'k3', contactId: 'c3', kind: 'COUNTER', amount: 145000, currency: 'USD', status: 'REJECTED', createdAt: ago(15) },
    ],
    stats: [{ propertyId: 'p1', day: day(2), views: 40 }, { propertyId: 'p1', day: day(45), views: 10 }, { propertyId: 'p2', day: day(3), views: 4 }],
    commissions: [{ caseId: 'k3', agentId: 'juan', agentAmount: 2100, currency: 'USD', status: 'GENERATED' }],
    receivables: [{ id: 'r1', concept: 'Comisión EXP-3', amount: 4200, paidAmount: 1000, currency: 'USD', dueDate: ago(5), status: 'PARTIAL' }],
  };
}

describe('analítica', () => {
  it('embudo histórico con tasa de conversión entre pasos', () => {
    const f = funnel(snap());
    expect(f.map((x) => x.value)).toEqual([280, 5, 3, 2, 2, 1]);
    expect(f[1].rate).toBe(1.8);
    expect(f[2].rate).toBe(60);
    expect(f[5].rate).toBe(50);
    expect(f[0].rate).toBeNull();
  });
  it('con fechas usa el registro diario y filtra cada paso', () => {
    const f = funnel(snap(), { from: ago(7) });
    expect(f.map((x) => x.value)).toEqual([44, 3, 3, 1, 1, 0]);
  });
  it('no divide entre cero', () => {
    const empty = { ...snap(), properties: [], leads: [], visits: [], offers: [], cases: [], stats: [] };
    expect(funnel(empty).every((x) => x.value === 0 && x.rate === null)).toBe(true);
  });
  it('rendimiento por agente', () => {
    const [juan] = agentStats(snap());
    expect(juan).toMatchObject({ properties: 2, leads: 5, visits: 1, negotiations: 2, sales: 1, valueSold: { USD: 140000 }, commissions: { USD: 2100 }, conversion: 20, avgDaysToClose: 30 });
    expect(agentStats(snap()).length).toBe(1);
    expect(avgDaysToClose({ ...snap(), cases: [] })).toBeNull();
  });
  it('demanda por propiedad y por zona', () => {
    const d = demand(snap());
    expect(d[0]).toMatchObject({ code: 'P1', leads30: 4, views30: 40, level: 'HIGH' });
    expect(d[1]).toMatchObject({ code: 'P2', leads30: 0, level: 'LOW', daysOnMarket: 90 });
    expect(zones(snap())[0]).toMatchObject({ zone: 'equipetrol', wanted: 1, available: 1, leads: 4 });
  });
});

describe('alertas inteligentes', () => {
  const keys = () => computeAlerts(snap()).map((a) => a.key);
  it('detecta lo que necesita atención', () => {
    expect(keys()).toEqual(expect.arrayContaining(['leads_uncontacted', 'leads_no_followup', 'visits_unconfirmed', 'visits_soon', 'negotiations_stalled', 'cases_stalled', 'captation_expiring', 'properties_low_activity', 'properties_high_demand', 'receivables_overdue', 'commissions_pending']));
  });
  it('ordena por urgencia y cuenta los casos', () => {
    const alerts = computeAlerts(snap());
    expect(alerts[0].severity).toBe('high');
    expect(alerts.at(-1)!.severity).toBe('low');
    expect(alerts.find((a) => a.key === 'properties_low_activity')).toMatchObject({ count: 1 });
    expect(alerts.find((a) => a.key === 'receivables_overdue')!.items[0].detail).toContain('USD 3.200');
  });
  it('sin problemas no genera alertas', () => {
    const calm: Snapshot = { ...snap(), leads: [], visits: [], offers: [], cases: [], receivables: [], commissions: [], properties: [P('p1', { createdAt: ago(5) })] };
    expect(computeAlerts(calm)).toEqual([]);
  });
});

describe('asistente', () => {
  const me = { id: 'juan', fullName: 'Juan Pérez' };
  it('reconoce las preguntas del documento', () => {
    expect(detectIntent('¿Qué propiedades debería mostrarle a Carlos?')).toBe('match_for_contact');
    expect(detectIntent('¿Qué clientes podrían estar interesados en esta propiedad?')).toBe('match_for_property');
    expect(detectIntent('¿Cuáles tienen mayor demanda?')).toBe('high_demand');
    expect(detectIntent('¿Qué propiedades llevan más de 60 días sin vender?')).toBe('unsold');
    expect(detectIntent('¿Qué leads necesitan seguimiento?')).toBe('leads_followup');
    expect(detectIntent('¿Cuál fue mi rendimiento este mes?')).toBe('performance');
    expect(detectIntent('Resume mis negociaciones.')).toBe('negotiations');
    expect(detectIntent('¿Qué debo hacer hoy?')).toBe('today');
    expect(detectIntent('¿Cuál es la capital de Francia?')).toBe('help');
  });
  it('responde con propiedades compatibles para el cliente nombrado', () => {
    const a = answer('¿Qué propiedades debería mostrarle a Carlos?', snap(), me);
    expect(a.title).toBe('Propiedades para Carlos Mendoza');
    expect(a.items[0].label).toBe('P1 · Casa p1');
    expect(a.items[0].detail).toContain('100 %');
  });
  it('no inventa cuando no encuentra al cliente', () => {
    const a = answer('¿Qué propiedades le muestro a Roberto?', snap(), me);
    expect(a.items).toEqual([]);
    expect(a.text).toContain('No encontré');
  });
  it('clientes para una propiedad por su código', () => {
    const a = answer('¿Qué clientes podrían estar interesados en la propiedad P1?', snap(), me);
    expect(a.items.map((i) => i.label)).toEqual(['Carlos Mendoza']);
  });
  it('propiedades con más de N días usa el número de la pregunta', () => {
    expect(answer('¿Qué propiedades llevan más de 60 días sin vender?', snap(), me).items.map((i) => i.label)).toEqual(['P2 · Casa p2']);
    expect(answer('¿Cuáles llevan más de 30 días sin vender?', snap(), me).items.length).toBe(2);
    expect(answer('¿Cuáles llevan más de 200 días sin vender?', snap(), me).text).toContain('Ninguna');
  });
  it('leads que necesitan seguimiento, con sugerencia', () => {
    const a = answer('¿Qué leads necesitan seguimiento?', snap(), me);
    expect(a.items.length).toBe(2);
    expect(a.items.some((i) => i.detail!.includes('contáctalo hoy'))).toBe(true);
  });
  it('rendimiento y negociaciones con cifras reales', () => {
    expect(answer('¿Cuál fue mi rendimiento este mes?', snap(), me).text).toBe('Este mes recibiste 3 leads, realizaste 1 visita y cerraste 1 operación por USD 140.000.');
    const n = answer('Resume mis negociaciones.', snap(), me);
    expect(n.text).toBe('Tienes 1 negociación abierta; 1 espera respuesta.');
    expect(n.items[0].detail).toContain('USD 92.000');
  });
  it('una pregunta fuera de tema lista lo que sí puede responder', () => {
    const a = answer('¿Va a subir el dólar?', snap(), me);
    expect(a.intent).toBe('help');
    expect(a.items.length).toBeGreaterThan(5);
  });
});

describe('contenido', () => {
  const f: PropertyFacts = { code: 'DEM-1', title: 'Casa', type: 'HOUSE', operation: 'SALE', price: 180000, currency: 'USD', zone: 'Equipetrol', city: 'Santa Cruz', areaM2: 360, builtM2: 240, bedrooms: 3, bathrooms: 1, parking: null, features: ['Jardín', 'Churrasquera'], description: null, company: 'Inmobiliaria Demo', agent: 'Juan', link: 'https://demo/p/DEM-1' };
  it('la plantilla usa solo los datos que existen', () => {
    const text = templateContent('description', f);
    expect(text).toBe('Casa en venta en Equipetrol, Santa Cruz, por USD 180.000. Cuenta con 3 habitaciones, 1 baño, 240 m² construidos, 360 m² de terreno. Destaca por: jardín, churrasquera. Agenda tu visita con Inmobiliaria Demo.');
    expect(text).not.toContain('parqueo');
    expect(templateContent('title', { ...f, zone: null, city: null, bedrooms: null, builtM2: null })).toBe('Casa en venta');
  });
  it('cada tipo de contenido incluye el enlace cuando corresponde', () => {
    for (const kind of ['ad', 'social', 'whatsapp', 'email', 'cta'] as const) expect(templateContent(kind, f)).toContain(f.link);
    expect(templateContent('email', f).startsWith('Asunto: ')).toBe(true);
  });
  it('el encargo a la IA prohíbe inventar y no incluye datos privados', () => {
    const p = contentPrompt('social', f, 'cercano');
    expect(p.system).toContain('no inventes');
    expect(p.prompt).toContain('"zone":"Equipetrol"');
    expect(p.prompt).not.toContain('address');
  });
});
