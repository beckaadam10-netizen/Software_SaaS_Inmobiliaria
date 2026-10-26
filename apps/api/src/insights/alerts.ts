import { DAY, daysBetween, money, ON_OFFER, OPEN_LEAD, type Snapshot } from './snapshot.js';

export type Severity = 'high' | 'medium' | 'low';
export interface Alert {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  link: string;
  count: number;
  items: Array<{ label: string; detail?: string; link?: string }>;
}

const some = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** Alertas inteligentes: detecta lo que necesita atención hoy. Solo hechos, sin suposiciones. */
export function computeAlerts(s: Snapshot): Alert[] {
  const now = s.now.getTime();
  const contact = (id: string) => s.contacts.find((c) => c.id === id)?.fullName ?? 'Contacto';
  const property = (id: string | null) => s.properties.find((p) => p.id === id);
  const alerts: Alert[] = [];
  const add = (key: string, severity: Severity, title: string, detail: string, link: string, items: Alert['items']) => {
    if (items.length) alerts.push({ key, severity, title, detail, link, count: items.length, items: items.slice(0, 8) });
  };

  const newLeads = s.leads.filter((l) => l.status === 'NEW' && now - l.createdAt.getTime() > DAY);
  add('leads_uncontacted', 'high', `${some(newLeads.length, 'lead lleva', 'leads llevan')} más de un día sin contactar`, 'Un lead atendido el primer día tiene más probabilidad de avanzar.', '/app/leads',
    newLeads.map((l) => ({ label: contact(l.contactId), detail: `${daysBetween(l.createdAt, s.now)} día(s) esperando${property(l.propertyId) ? ` · ${property(l.propertyId)!.code}` : ''}` })));

  const quietLeads = s.leads.filter((l) => OPEN_LEAD(l.status) && l.status !== 'NEW' && now - l.updatedAt.getTime() > 7 * DAY);
  add('leads_no_followup', 'medium', `${some(quietLeads.length, 'lead sin seguimiento', 'leads sin seguimiento')} en más de 7 días`, 'Retoma el contacto o márcalos como perdidos.', '/app/leads',
    quietLeads.map((l) => ({ label: contact(l.contactId), detail: `Sin cambios hace ${daysBetween(l.updatedAt, s.now)} días` })));

  const requests = s.visits.filter((v) => v.status === 'REQUESTED');
  add('visits_unconfirmed', 'high', `${some(requests.length, 'solicitud de visita por confirmar', 'solicitudes de visita por confirmar')}`, 'Confirma la fecha con el cliente.', '/app/visitas',
    requests.map((v) => ({ label: contact(v.contactId), detail: property(v.propertyId)?.code })));

  const soon = s.visits.filter((v) => ['CONFIRMED', 'RESCHEDULED'].includes(v.status) && v.scheduledAt.getTime() > now && v.scheduledAt.getTime() - now <= DAY);
  add('visits_soon', 'medium', `${some(soon.length, 'visita', 'visitas')} en las próximas 24 horas`, 'Envía un recordatorio al cliente.', '/app/visitas',
    soon.map((v) => ({ label: contact(v.contactId), detail: property(v.propertyId)?.code })));

  const pendingOffers = s.offers.filter((o) => o.status === 'PENDING' && now - o.createdAt.getTime() > 5 * DAY);
  add('negotiations_stalled', 'high', `${some(pendingOffers.length, 'oferta lleva', 'ofertas llevan')} más de 5 días sin respuesta`, 'Una negociación detenida suele enfriarse.', '/app/negociaciones',
    pendingOffers.map((o) => ({ label: `${contact(o.contactId)} · ${money(o.amount, o.currency)}`, detail: s.cases.find((c) => c.id === o.caseId)?.code, link: `/app/gestion/${o.caseId}` })));

  const stalled = s.cases.filter((c) => c.status === 'OPEN' && now - c.updatedAt.getTime() > 14 * DAY);
  add('cases_stalled', 'medium', `${some(stalled.length, 'expediente sin movimiento', 'expedientes sin movimiento')} en más de 14 días`, 'Revisa qué falta para avanzar al siguiente paso.', '/app/gestion',
    stalled.map((c) => ({ label: `${c.code} · ${property(c.propertyId)?.title ?? ''}`, detail: `Detenido hace ${daysBetween(c.updatedAt, s.now)} días`, link: `/app/gestion/${c.id}` })));

  const expiring = s.cases.filter((c) => c.status === 'OPEN' && c.captationEnds && c.captationEnds.getTime() - now <= 7 * DAY);
  add('captation_expiring', 'medium', `${some(expiring.length, 'captación vence', 'captaciones vencen')} en 7 días o ya vencieron`, 'Renueva el acuerdo con el propietario.', '/app/gestion',
    expiring.map((c) => ({ label: `${c.code} · ${property(c.propertyId)?.title ?? ''}`, link: `/app/gestion/${c.id}` })));

  const quiet = s.properties.filter((p) => p.isPublished && ON_OFFER.includes(p.status) && now - p.createdAt.getTime() > 30 * DAY && !s.leads.some((l) => l.propertyId === p.id && now - l.createdAt.getTime() <= 30 * DAY));
  add('properties_low_activity', 'low', `${some(quiet.length, 'propiedad publicada', 'propiedades publicadas')} sin interesados en 30 días`, 'Revisa precio, fotos o descripción.', '/app/propiedades',
    quiet.map((p) => ({ label: `${p.code} · ${p.title}`, detail: `${daysBetween(p.createdAt, s.now)} días en el mercado`, link: `/app/propiedades/${p.id}` })));

  const hot = s.properties.filter((p) => ON_OFFER.includes(p.status) && s.leads.filter((l) => l.propertyId === p.id && now - l.createdAt.getTime() <= 7 * DAY).length >= 3);
  add('properties_high_demand', 'low', `${some(hot.length, 'propiedad con alta demanda', 'propiedades con alta demanda')} esta semana`, 'Tres o más interesados en 7 días: prioriza sus visitas.', '/app/propiedades',
    hot.map((p) => ({ label: `${p.code} · ${p.title}`, link: `/app/propiedades/${p.id}` })));

  const overdue = s.receivables.filter((r) => ['PENDING', 'PARTIAL'].includes(r.status) && r.dueDate.getTime() < now - DAY);
  add('receivables_overdue', 'high', `${some(overdue.length, 'cuenta por cobrar vencida', 'cuentas por cobrar vencidas')}`, 'Gestiona el cobro con el cliente.', '/app/finanzas/por-cobrar',
    overdue.map((r) => ({ label: r.concept, detail: `${money(r.amount - r.paidAmount, r.currency)} · ${daysBetween(r.dueDate, s.now)} día(s) de atraso` })));

  const toApprove = s.commissions.filter((c) => c.status === 'GENERATED' || c.status === 'PENDING');
  add('commissions_pending', 'low', `${some(toApprove.length, 'comisión por aprobar', 'comisiones por aprobar')}`, 'Apruébalas para poder liquidarlas.', '/app/finanzas/comisiones',
    toApprove.map((c) => ({ label: s.cases.find((k) => k.id === c.caseId)?.code ?? 'Operación', detail: money(c.agentAmount, c.currency) })));

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
