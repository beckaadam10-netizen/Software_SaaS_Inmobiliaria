import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import { current, ownScope, restrictedAgent } from '../common/current.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SearchHit { id: string; title: string; detail?: string; link: string }
export interface SearchGroup { key: string; label: string; items: SearchHit[] }
const TAKE = 6;

/** Búsqueda global del panel. Respeta los mismos permisos que cada pantalla: el agente encuentra solo lo suyo. */
@Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(@Query('q') raw?: string): Promise<{ q: string; groups: SearchGroup[] }> {
    const q = (raw ?? '').trim().slice(0, 80);
    if (q.length < 2) return { q, groups: [] };
    const db = this.prisma.db;
    const has = { contains: q };
    const me = current();
    const own = ownScope();
    const ownContact = ownScope('assignedAgentId');

    const [properties, contacts, leads, agents, cases, negotiations] = await Promise.all([
      db.property.findMany({ where: { ...own, OR: [{ code: has }, { title: has }, { zone: has }, { address: has }, { city: has }] }, take: TAKE, orderBy: { updatedAt: 'desc' }, select: { id: true, code: true, title: true, zone: true, status: true } }),
      db.contact.findMany({ where: { ...ownContact, OR: [{ fullName: has }, { phone: has }, { email: has }] }, take: TAKE * 2, orderBy: { updatedAt: 'desc' }, select: { id: true, fullName: true, phone: true, email: true, type: true } }),
      db.lead.findMany({ where: { ...own, contact: { fullName: has } }, take: TAKE, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, contact: { select: { fullName: true } }, property: { select: { code: true } } } }),
      me.role === 'ADMIN' ? db.user.findMany({ where: { role: { in: ['ADMIN', 'AGENT', 'ACCOUNTANT'] }, OR: [{ fullName: has }, { email: has }] }, take: TAKE, select: { id: true, fullName: true, email: true, role: true } }) : [],
      db.commercialCase.findMany({ where: { ...own, OR: [{ code: has }, { property: { code: has } }, { property: { title: has } }, { client: { fullName: has } }] }, take: TAKE, orderBy: { updatedAt: 'desc' }, select: { id: true, code: true, status: true, property: { select: { code: true, title: true } } } }),
      db.commercialCase.findMany({ where: { ...own, offers: { some: { contact: { fullName: has } } } }, take: TAKE, orderBy: { updatedAt: 'desc' }, select: { id: true, code: true, status: true, property: { select: { title: true } }, offers: { where: { contact: { fullName: has } }, orderBy: { createdAt: 'desc' }, take: 1, select: { amount: true, currency: true, contact: { select: { fullName: true } } } } } }),
    ]);

    // Documentos: solo los de registros a los que el usuario tiene acceso.
    let docWhere: Record<string, unknown> = { name: has };
    if (restrictedAgent()) {
      const [myCases, myProps, myContacts] = await Promise.all([
        db.commercialCase.findMany({ where: own, select: { id: true } }), db.property.findMany({ where: own, select: { id: true } }), db.contact.findMany({ where: ownContact, select: { id: true } }),
      ]);
      docWhere = { name: has, OR: [{ entityType: 'case', entityId: { in: myCases.map((x) => x.id) } }, { entityType: 'property', entityId: { in: myProps.map((x) => x.id) } }, { entityType: 'contact', entityId: { in: myContacts.map((x) => x.id) } }] };
    }
    const docs = await db.document.findMany({ where: docWhere, take: TAKE, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, entityType: true, entityId: true } });
    const docLink = (d: { entityType: string; entityId: string }) => (d.entityType === 'case' ? `/app/gestion/${d.entityId}` : d.entityType === 'property' ? `/app/propiedades/${d.entityId}` : `/app/contactos?q=${encodeURIComponent(q)}`);
    const money = (n: unknown, cur: string) => `${cur === 'BOB' ? 'Bs' : 'USD'} ${Number(n).toLocaleString('es-BO')}`;
    const contactHit = (c: (typeof contacts)[number]) => ({ id: c.id, title: c.fullName, detail: [c.phone, c.email].filter(Boolean).join(' · '), link: `/app/contactos?q=${encodeURIComponent(c.fullName)}` });

    const groups: SearchGroup[] = [
      { key: 'properties', label: 'Propiedades', items: properties.map((p) => ({ id: p.id, title: `${p.code} · ${p.title}`, detail: p.zone ?? undefined, link: `/app/propiedades/${p.id}` })) },
      { key: 'clients', label: 'Clientes', items: contacts.filter((c) => c.type !== 'OWNER').slice(0, TAKE).map(contactHit) },
      { key: 'owners', label: 'Propietarios', items: contacts.filter((c) => c.type === 'OWNER').slice(0, TAKE).map(contactHit) },
      { key: 'leads', label: 'Leads', items: leads.map((l) => ({ id: l.id, title: l.contact.fullName, detail: l.property ? `Interesado en ${l.property.code}` : 'Consulta general', link: '/app/leads' })) },
      { key: 'agents', label: 'Equipo', items: agents.map((a) => ({ id: a.id, title: a.fullName, detail: a.email, link: '/app/equipo' })) },
      { key: 'cases', label: 'Operaciones', items: cases.map((c) => ({ id: c.id, title: `${c.code} · ${c.property.title}`, detail: c.property.code, link: `/app/gestion/${c.id}` })) },
      { key: 'negotiations', label: 'Negociaciones', items: negotiations.map((c) => ({ id: c.id, title: `${c.code} · ${c.property.title}`, detail: `${c.offers[0] ? `Oferta de ${c.offers[0].contact.fullName} por ${money(c.offers[0].amount, c.offers[0].currency)}` : ''}${c.status === 'OPEN' ? ' · en curso' : c.status === 'WON' ? ' · cerrada' : ' · perdida'}`, link: `/app/gestion/${c.id}` })) },
      { key: 'documents', label: 'Documentos', items: docs.map((d) => ({ id: d.id, title: d.name, detail: d.entityType === 'case' ? 'Expediente' : d.entityType === 'property' ? 'Propiedad' : 'Contacto', link: docLink(d) })) },
    ];
    return { q, groups: groups.filter((g) => g.items.length) };
  }
}
