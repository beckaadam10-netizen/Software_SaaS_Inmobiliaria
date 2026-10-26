/**
 * Fotografía de los datos de una empresa en forma simple (sin base de datos).
 * Analítica, alertas y asistente calculan sobre ella, así cada cálculo se puede probar solo
 * y ninguna cifra sale de otro lugar que no sean los datos reales.
 */
export interface Snapshot {
  now: Date;
  users: Array<{ id: string; fullName: string; role: string }>;
  properties: Array<{
    id: string; code: string; title: string; type: string; operation: string; status: string; isPublished: boolean; price: number; currency: string;
    zone: string | null; bedrooms: number | null; viewCount: number; agentId: string | null; ownerId: string | null; createdAt: Date;
  }>;
  contacts: Array<{
    id: string; fullName: string; phone: string | null; type: string; assignedAgentId: string | null; createdAt: Date;
    prefOperation: string | null; prefType: string | null; prefZone: string | null; prefBudgetMax: number | null; prefCurrency: string | null; prefBedrooms: number | null;
  }>;
  leads: Array<{ id: string; contactId: string; propertyId: string | null; agentId: string | null; status: string; source: string; score: number; createdAt: Date; updatedAt: Date }>;
  visits: Array<{ id: string; propertyId: string; contactId: string; agentId: string | null; status: string; scheduledAt: Date }>;
  cases: Array<{
    id: string; code: string; propertyId: string; agentId: string | null; clientId: string | null; status: string; currentStage: string; price: number; closedPrice: number | null;
    currency: string; createdAt: Date; updatedAt: Date; closedAt: Date | null; captationEnds: Date | null;
  }>;
  offers: Array<{ id: string; caseId: string; contactId: string; kind: string; amount: number; currency: string; status: string; createdAt: Date }>;
  /** Vistas del portal por día (últimos 60 días). */
  stats: Array<{ propertyId: string; day: string; views: number }>;
  /** Solo para administrador y contador; vacío para el resto. */
  commissions: Array<{ caseId: string; agentId: string | null; agentAmount: number; currency: string; status: string }>;
  receivables: Array<{ id: string; concept: string; amount: number; paidAmount: number; currency: string; dueDate: Date; status: string }>;
}

export const DAY = 24 * 60 * 60 * 1000;
export const ON_OFFER = ['AVAILABLE', 'RESERVED', 'NEGOTIATING'];
export const OPEN_LEAD = (status: string) => status !== 'CLOSED' && status !== 'LOST';
export const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DAY);
export const money = (n: number, currency: string) => `${currency === 'BOB' ? 'Bs' : 'USD'} ${Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString('es-BO') : n.toLocaleString('es-BO')}`;
export const sumByCurrency = <T extends { currency: string }>(rows: T[], value: (r: T) => number) =>
  rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.currency]: Math.round(((acc[r.currency] ?? 0) + value(r)) * 100) / 100 }), {});
/** Texto en minúsculas y sin tildes, para comparar. */
export const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
