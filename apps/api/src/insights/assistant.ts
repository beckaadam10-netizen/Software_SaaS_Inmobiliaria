import { matchScore, MATCH_THRESHOLD } from '../matching/match.js';
import { agentStats, demand } from './analytics.js';
import { computeAlerts } from './alerts.js';
import { DAY, daysBetween, money, norm, ON_OFFER, OPEN_LEAD, type Snapshot } from './snapshot.js';

export type Intent = 'match_for_contact' | 'match_for_property' | 'high_demand' | 'unsold' | 'leads_followup' | 'performance' | 'negotiations' | 'today' | 'help';
export interface Answer {
  intent: Intent;
  title: string;
  /** Respuesta en texto, armada solo con datos reales de la empresa. */
  text: string;
  items: Array<{ label: string; detail?: string; link?: string }>;
}

export const SUGGESTIONS = [
  '¿Qué debo hacer hoy?',
  '¿Qué leads necesitan seguimiento?',
  '¿Cuáles propiedades tienen mayor demanda?',
  '¿Qué propiedades llevan más de 60 días sin vender?',
  '¿Cuál fue mi rendimiento este mes?',
  'Resume mis negociaciones.',
];

/** Reconoce qué se está preguntando. Ante la duda devuelve "help": el asistente no adivina. */
export function detectIntent(question: string): Intent {
  const q = norm(question);
  const has = (...words: string[]) => words.some((w) => q.includes(w));
  if (has('que debo hacer', 'que tengo que hacer', 'pendiente', 'tareas de hoy', 'hoy')) return 'today';
  if (has('negociacion', 'oferta')) return 'negotiations';
  if (has('rendimiento', 'desempeno', 'como me fue', 'mis ventas', 'resultados')) return 'performance';
  if (has('seguimiento', 'sin contactar', 'sin atender') && has('lead', 'interesado', 'prospecto', 'cliente')) return 'leads_followup';
  if (has('sin vender', 'sin alquilar', 'estancad', 'mas de') && has('dia')) return 'unsold';
  if (has('demanda', 'mas vist', 'mas buscad', 'mas interesad')) return 'high_demand';
  if (has('cliente', 'quien', 'a quien', 'interesad') && has('esta propiedad', 'esa propiedad', 'para la propiedad', 'en la propiedad', 'podrian estar interesados', 'coinciden con')) return 'match_for_property';
  if (has('propiedad', 'inmueble', 'casa', 'departamento', 'opciones') && has('mostrar', 'ofrecer', 'recomend', 'para ', 'a ')) return 'match_for_contact';
  return 'help';
}

/** Busca en la pregunta el nombre de un contacto o el código o título de una propiedad. */
function findContact(s: Snapshot, question: string) {
  const q = ` ${norm(question).replace(/[^a-z0-9 ]/g, ' ')} `;
  const scored = s.contacts
    .map((c) => ({ c, hits: norm(c.fullName).split(/\s+/).filter((w) => w.length > 2 && q.includes(` ${w} `)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.c ?? null;
}
function findProperty(s: Snapshot, question: string) {
  const q = norm(question);
  const byCode = s.properties.find((p) => q.includes(norm(p.code)));
  if (byCode) return byCode;
  const scored = s.properties
    .map((p) => ({ p, hits: norm(p.title).split(/\s+/).filter((w) => w.length > 3 && q.includes(w)).length }))
    .filter((x) => x.hits >= 2)
    .sort((a, b) => b.hits - a.hits);
  return scored[0]?.p ?? null;
}
const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function answer(question: string, s: Snapshot, user: { id: string; fullName: string }): Answer {
  const intent = detectIntent(question);
  const contactName = (id: string) => s.contacts.find((c) => c.id === id)?.fullName ?? 'Contacto';
  const prop = (id: string | null) => s.properties.find((p) => p.id === id);

  switch (intent) {
    case 'match_for_contact': {
      const contact = findContact(s, question);
      if (!contact) return { intent, title: 'Propiedades para un cliente', text: 'No encontré a ese cliente entre tus contactos. Escribe su nombre tal como está registrado.', items: [] };
      const matches = s.properties
        .filter((p) => ON_OFFER.includes(p.status))
        .map((p) => ({ p, m: matchScore(contact, p) }))
        .filter((x) => x.m && x.m.score >= MATCH_THRESHOLD)
        .sort((a, b) => b.m!.score - a.m!.score)
        .slice(0, 8);
      return {
        intent, title: `Propiedades para ${contact.fullName}`,
        text: matches.length ? `Encontré ${plural(matches.length, 'propiedad compatible', 'propiedades compatibles')} con lo que busca ${contact.fullName}.` : `No hay propiedades en oferta que coincidan con lo que busca ${contact.fullName}. Revisa sus preferencias en Contactos.`,
        items: matches.map(({ p, m }) => ({ label: `${p.code} · ${p.title}`, detail: `${m!.score} % · ${money(p.price, p.currency)} · coincide en ${m!.reasons.join(', ').toLowerCase()}`, link: `/app/propiedades/${p.id}` })),
      };
    }
    case 'match_for_property': {
      const property = findProperty(s, question);
      if (!property) return { intent, title: 'Clientes para una propiedad', text: 'Dime de qué propiedad se trata: escribe su código (por ejemplo DEM-0001) o su título.', items: [] };
      const matches = s.contacts
        .filter((c) => c.type !== 'OWNER' && c.id !== property.ownerId)
        .map((c) => ({ c, m: matchScore(c, property) }))
        .filter((x) => x.m && x.m.score >= MATCH_THRESHOLD)
        .sort((a, b) => b.m!.score - a.m!.score)
        .slice(0, 8);
      return {
        intent, title: `Clientes para ${property.code}`,
        text: matches.length ? `${plural(matches.length, 'cliente coincide', 'clientes coinciden')} con ${property.title}.` : `Ningún cliente registrado busca algo como ${property.title} por ahora.`,
        items: matches.map(({ c, m }) => ({ label: c.fullName, detail: `${m!.score} % · ${c.phone ?? 'sin teléfono'} · coincide en ${m!.reasons.join(', ').toLowerCase()}`, link: '/app/contactos' })),
      };
    }
    case 'high_demand': {
      const rows = demand(s).filter((d) => d.level !== 'LOW').slice(0, 6);
      return {
        intent, title: 'Propiedades con mayor demanda',
        text: rows.length ? `Estas son las propiedades con más interesados y vistas en los últimos 30 días.` : 'En los últimos 30 días ninguna propiedad tuvo interesados ni vistas suficientes para destacar.',
        items: rows.map((d) => ({ label: `${d.code} · ${d.title}`, detail: `${plural(d.leads30, 'interesado', 'interesados')}, ${plural(d.views30, 'vista', 'vistas')} y ${plural(d.visits30, 'visita', 'visitas')} en 30 días`, link: `/app/propiedades/${d.id}` })),
      };
    }
    case 'unsold': {
      const days = Number(norm(question).match(/(\d{1,3})\s*dia/)?.[1] ?? 60);
      const rows = s.properties.filter((p) => ON_OFFER.includes(p.status) && daysBetween(p.createdAt, s.now) > days).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return {
        intent, title: `Propiedades con más de ${days} días en el mercado`,
        text: rows.length ? `${plural(rows.length, 'propiedad lleva', 'propiedades llevan')} más de ${days} días sin cerrarse.` : `Ninguna propiedad en oferta lleva más de ${days} días en el mercado.`,
        items: rows.slice(0, 10).map((p) => ({ label: `${p.code} · ${p.title}`, detail: `${daysBetween(p.createdAt, s.now)} días · ${money(p.price, p.currency)} · ${plural(s.leads.filter((l) => l.propertyId === p.id).length, 'interesado', 'interesados')}`, link: `/app/propiedades/${p.id}` })),
      };
    }
    case 'leads_followup': {
      const rows = s.leads
        .filter((l) => OPEN_LEAD(l.status) && (l.status === 'NEW' || s.now.getTime() - l.updatedAt.getTime() > 3 * DAY))
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
      const step = (status: string) => (status === 'NEW' ? 'contáctalo hoy' : status === 'VISIT' ? 'llámalo para conocer su impresión de la visita' : status === 'NEGOTIATION' ? 'retoma la negociación' : 'vuelve a escribirle');
      return {
        intent, title: 'Leads que necesitan seguimiento',
        text: rows.length ? `${plural(rows.length, 'lead necesita', 'leads necesitan')} seguimiento: son nuevos o llevan más de 3 días sin cambios.` : 'No tienes leads pendientes de seguimiento. Todos fueron atendidos en los últimos 3 días.',
        items: rows.slice(0, 10).map((l) => ({ label: contactName(l.contactId), detail: `${l.status === 'NEW' ? 'Nuevo' : `Sin cambios hace ${daysBetween(l.updatedAt, s.now)} días`}${prop(l.propertyId) ? ` · ${prop(l.propertyId)!.code}` : ''} · sugerencia: ${step(l.status)}`, link: '/app/leads' })),
      };
    }
    case 'performance': {
      const from = new Date(s.now.getFullYear(), s.now.getMonth(), 1);
      const mine = agentStats(s, { from }).find((a) => a.agent.id === user.id);
      const sold = Object.entries(mine?.valueSold ?? {}).map(([cur, n]) => money(n, cur)).join(' y ');
      return {
        intent, title: 'Tu rendimiento este mes',
        text: mine
          ? `Este mes recibiste ${plural(mine.leads, 'lead', 'leads')}, realizaste ${plural(mine.visits, 'visita', 'visitas')} y cerraste ${plural(mine.sales, 'operación', 'operaciones')}${sold ? ` por ${sold}` : ''}.`
          : 'Este mes todavía no tienes leads, visitas ni cierres registrados a tu nombre.',
        items: mine
          ? [
              { label: 'Propiedades en oferta a tu cargo', detail: String(mine.properties) },
              { label: 'Negociaciones', detail: String(mine.negotiations) },
              { label: 'Conversión de leads a cierres', detail: mine.conversion == null ? 'Sin leads este mes' : `${mine.conversion} %` },
              { label: 'Tiempo promedio de cierre', detail: mine.avgDaysToClose == null ? 'Aún sin cierres' : `${mine.avgDaysToClose} días` },
            ]
          : [],
      };
    }
    case 'negotiations': {
      const rows = s.cases
        .filter((c) => c.status === 'OPEN' && s.offers.some((o) => o.caseId === c.id))
        .map((c) => ({ c, offers: s.offers.filter((o) => o.caseId === c.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) }));
      const label = { PENDING: 'pendiente', ACCEPTED: 'aceptada', REJECTED: 'rechazada', WITHDRAWN: 'retirada' } as Record<string, string>;
      return {
        intent, title: 'Tus negociaciones',
        text: rows.length ? `Tienes ${plural(rows.length, 'negociación abierta', 'negociaciones abiertas')}; ${plural(rows.filter((r) => r.offers[0].status === 'PENDING').length, 'espera', 'esperan')} respuesta.` : 'No tienes negociaciones abiertas en este momento.',
        items: rows.map(({ c, offers }) => ({
          label: `${c.code} · ${prop(c.propertyId)?.title ?? ''}`,
          detail: `Pedido ${money(c.price, c.currency)} · última ${offers[0].kind === 'OFFER' ? 'oferta' : 'contraoferta'} ${money(offers[0].amount, offers[0].currency)} (${label[offers[0].status]}) de ${contactName(offers[0].contactId)} · ${plural(offers.length, 'movimiento', 'movimientos')}`,
          link: `/app/gestion/${c.id}`,
        })),
      };
    }
    case 'today': {
      const alerts = computeAlerts(s);
      return {
        intent, title: 'Lo que tienes que hacer hoy',
        text: alerts.length ? `Hay ${plural(alerts.length, 'asunto que necesita', 'asuntos que necesitan')} tu atención, ordenados por urgencia.` : 'Estás al día: no hay leads sin atender, visitas por confirmar ni operaciones detenidas.',
        items: alerts.slice(0, 8).map((a) => ({ label: a.title, detail: a.detail, link: a.link })),
      };
    }
    default:
      return {
        intent: 'help', title: 'No tengo una respuesta para eso todavía',
        text: 'Respondo con los datos de tu inmobiliaria. Por ahora puedo ayudarte con estas preguntas:',
        items: [...SUGGESTIONS, '¿Qué propiedades debería mostrarle a (nombre del cliente)?', '¿Qué clientes podrían estar interesados en (código de la propiedad)?'].map((label) => ({ label })),
      };
  }
}
