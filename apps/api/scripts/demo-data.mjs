// Carga datos de demostración en la empresa "demo" usando la propia API.
// Uso: node scripts/demo-data.mjs   (requiere pnpm db:seed y la API en marcha)
// Las imágenes de scripts/demo-fotos son ilustraciones de ejemplo, no fotos reales.
import { readFile } from 'node:fs/promises';

const API = process.env.API_URL ?? 'http://localhost:3001/api';
const HOST = 'demo.localhost:3000';
const PASS = 'Cambiar123!';

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const isForm = body instanceof FormData;
    const res = await fetch(API + path, {
      method,
      headers: { 'x-forwarded-host': HOST, ...(cookie ? { cookie } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${path}: ${data?.message ?? res.status}`);
    return data;
  };
}
const days = (n, hour = 10) => { const d = new Date(Date.now() + n * 864e5); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

const admin = client();
await admin('POST', '/auth/login', { email: 'admin@demo.com', password: PASS });
if ((await admin('GET', '/properties')).length) { console.log('La empresa demo ya tiene datos; no se cargó nada.'); process.exit(0); }

const juan = await admin('POST', '/users', { email: 'juan@demo.com', fullName: 'Juan Pérez', role: 'AGENT', phone: '70011223', password: PASS });
const lucia = await admin('POST', '/users', { email: 'lucia@demo.com', fullName: 'Lucía Rojas', role: 'AGENT', phone: '70044556', password: PASS });
await admin('POST', '/users', { email: 'contador@demo.com', fullName: 'Marcos Vaca', role: 'ACCOUNTANT', password: PASS });

const contact = (fullName, phone, extra = {}) => admin('POST', '/contacts', { fullName, phone, ...extra });
const owners = await Promise.all([
  contact('María Suárez', '71100001', { type: 'OWNER' }), contact('Roberto Justiniano', '71100002', { type: 'OWNER' }),
  contact('Patricia Antelo', '71100003', { type: 'OWNER' }), contact('Inversiones Oriente SRL', '33400100', { type: 'COMPANY' }),
]);
const clients = await Promise.all([
  contact('Carlos Mendoza', '72200001', { email: 'carlos@correo.com', prefOperation: 'SALE', prefType: 'HOUSE', prefZone: 'Equipetrol', prefBudgetMax: 200000, prefCurrency: 'USD', prefBedrooms: 3 }),
  contact('Ana Gutiérrez', '72200002', { prefOperation: 'RENT', prefType: 'APARTMENT', prefZone: 'Norte', prefBudgetMax: 700, prefCurrency: 'USD', prefBedrooms: 2 }),
  contact('Diego Salvatierra', '72200003', { type: 'INVESTOR', prefOperation: 'SALE', prefType: 'LAND', prefBudgetMax: 90000, prefCurrency: 'USD' }),
  contact('Sofía Ribera', '72200004', { email: 'sofia@correo.com', prefOperation: 'ANTICRETICO', prefType: 'APARTMENT' }),
]);

const props = [
  { foto: 'casa1', title: 'Casa en Equipetrol con jardín', type: 'HOUSE', operation: 'SALE', price: 180000, zone: 'Equipetrol', bedrooms: 3, bathrooms: 3, parking: 2, areaM2: 360, builtM2: 240, yearBuilt: 2018, ownerId: owners[0].id, agentId: juan.id, features: ['Jardín', 'Churrasquera', 'Dependencias'], description: 'Casa de dos plantas en zona residencial, a tres cuadras de la avenida San Martín.\nAmplio jardín con churrasquera y garaje techado para dos vehículos.' },
  { foto: 'depto1', title: 'Departamento de 2 dormitorios en zona Norte', type: 'APARTMENT', operation: 'RENT', price: 650, zone: 'Norte', bedrooms: 2, bathrooms: 2, parking: 1, builtM2: 85, floor: 7, yearBuilt: 2021, ownerId: owners[1].id, agentId: lucia.id, features: ['Piscina', 'Gimnasio', 'Seguridad 24 h'], description: 'Departamento amoblado en condominio con áreas sociales. Expensas incluidas.' },
  { foto: 'terreno', title: 'Terreno de 500 m² en Urubó', type: 'LAND', operation: 'SALE', price: 75000, zone: 'Urubó', areaM2: 500, ownerId: owners[2].id, agentId: juan.id, features: ['Condominio cerrado', 'Servicios básicos'], description: 'Lote plano dentro de condominio cerrado, listo para construir.' },
  { foto: 'oficina', title: 'Oficina corporativa en el centro empresarial', type: 'OFFICE', operation: 'RENT', price: 1200, zone: 'Equipetrol Norte', bathrooms: 2, parking: 2, builtM2: 120, floor: 4, ownerId: owners[3].id, agentId: lucia.id, features: ['Aire central', 'Recepción', 'Sala de reuniones'], description: 'Planta libre con dos privados y sala de reuniones.' },
  { foto: 'casa2', title: 'Casa familiar en Las Palmas', type: 'HOUSE', operation: 'SALE', price: 235000, zone: 'Las Palmas', bedrooms: 4, bathrooms: 4, parking: 3, areaM2: 450, builtM2: 310, yearBuilt: 2015, ownerId: owners[0].id, agentId: juan.id, features: ['Piscina', 'Suite principal', 'Escritorio'], description: 'Casa de cuatro suites cerca del club.' },
  { foto: 'depto2', title: 'Monoambiente en anticrético, zona Sur', type: 'APARTMENT', operation: 'ANTICRETICO', price: 28000, zone: 'Sur', bedrooms: 1, bathrooms: 1, builtM2: 42, floor: 3, ownerId: owners[1].id, agentId: lucia.id, features: ['Balcón', 'Ascensor'], description: 'Monoambiente con balcón, ideal para estudiantes.' },
];
const created = [];
for (const { foto, ...data } of props) {
  const p = await admin('POST', '/properties', { ...data, currency: 'USD', city: 'Santa Cruz' });
  const form = new FormData();
  form.append('file', new Blob([await readFile(new URL(`./demo-fotos/${foto}.jpg`, import.meta.url))], { type: 'image/jpeg' }), `${foto}.jpg`);
  await admin('POST', `/properties/${p.id}/images`, form);
  const full = await admin('GET', `/properties/${p.id}`);
  created.push({ ...p, caseId: full.cases[0].id });
}
const stage = (p, s, notes) => admin('PATCH', `/cases/${p.caseId}/stages/${s}`, { status: 'DONE', notes });
const lead = (p, c, source, message) => admin('POST', '/leads', { contactId: c.id, propertyId: p.id, source, message });
const [casa, depto, terreno, oficina, palmas, mono] = created;

// Casa Equipetrol: va por el seguimiento post-visita
await stage(casa, 'CAPTATION', 'Exclusividad por 90 días. Comisión 3 %.'); await stage(casa, 'MARKETING', 'Publicada en portal y redes.');
await admin('PATCH', `/cases/${casa.caseId}`, { isExclusive: true, commissionPct: 3 });
const l1 = await lead(casa, clients[0], 'WEB', 'Quisiera conocer la casa este fin de semana.');
await admin('PATCH', `/leads/${l1.id}`, { status: 'INTERESTED' });
const v1 = await admin('POST', '/visits', { propertyId: casa.id, contactId: clients[0].id, leadId: l1.id, scheduledAt: days(1, 16) });
await admin('PATCH', `/visits/${v1.id}`, { status: 'DONE', result: 'Le gustó el jardín. Pide rebaja por el estado de la pintura.' });
await stage(casa, 'LEADS');
// Departamento Norte: publicado, con interesados y visitas pendientes
await stage(depto, 'CAPTATION', 'Contrato de administración firmado.'); await stage(depto, 'MARKETING');
const l2 = await lead(depto, clients[1], 'WHATSAPP', 'Consulta por expensas y mascotas.');
await admin('PATCH', `/leads/${l2.id}`, { status: 'CONTACTED' });
await admin('POST', '/visits', { propertyId: depto.id, contactId: clients[1].id, leadId: l2.id, scheduledAt: days(2, 11) });
await lead(depto, clients[3], 'SOCIAL', 'Vio el anuncio en Instagram.');
// Terreno: publicado, negociación
await stage(terreno, 'CAPTATION'); await stage(terreno, 'MARKETING');
const l3 = await lead(terreno, clients[2], 'REFERRAL', 'Referido por un cliente anterior.');
const v3 = await admin('POST', '/visits', { propertyId: terreno.id, contactId: clients[2].id, leadId: l3.id, scheduledAt: days(1, 9) });
await admin('PATCH', `/visits/${v3.id}`, { status: 'DONE', result: 'Hará una oferta formal.' });
await stage(terreno, 'LEADS'); await stage(terreno, 'FOLLOW_UP', 'Oferta de USD 70.000 recibida.');
await admin('PATCH', `/leads/${l3.id}`, { status: 'NEGOTIATION' });
// Oficina: en marketing. Las Palmas: recién captada. Monoambiente: publicado con solicitud del portal
await stage(oficina, 'CAPTATION', 'Falta sesión de fotos.');
await stage(mono, 'CAPTATION'); await stage(mono, 'MARKETING');
await fetch(`${API}/public/properties/${mono.code}/interest`, {
  method: 'POST', headers: { 'x-forwarded-host': HOST, 'content-type': 'application/json' },
  body: JSON.stringify({ fullName: 'Valeria Chávez', phone: '73300009', message: '¿Sigue disponible? Me interesa verlo.', visitAt: days(3, 17) }),
});
void palmas;

// ---------- Fase 2 ----------
const put = (path, body) => admin('PUT', path, body);
const view = (p, src, n = 1) => Promise.all(Array.from({ length: n }, () => fetch(`${API}/public/properties/${p.code}${src ? `?src=${src}` : ''}`, { headers: { 'x-forwarded-host': HOST } })));
// Terreno: negociación con ofertas y contraoferta
await admin('POST', `/cases/${terreno.caseId}/offers`, { contactId: clients[2].id, kind: 'OFFER', amount: 68000, conditions: 'Pago al contado en 15 días.' }).then((o) => admin('PATCH', `/offers/${o.id}`, { status: 'REJECTED' }));
await admin('POST', `/cases/${terreno.caseId}/offers`, { contactId: clients[2].id, kind: 'COUNTER', amount: 73000, conditions: 'El propietario cubre los gastos de transferencia.' });
// Casa Equipetrol: primera oferta pendiente
await admin('POST', `/cases/${casa.caseId}/offers`, { contactId: clients[0].id, kind: 'OFFER', amount: 172000, conditions: 'Sujeta a aprobación de crédito hipotecario.' });
// Una operación completa ya cerrada, con postventa
const vendida = await admin('POST', '/properties', { title: 'Departamento de 3 dormitorios en Equipetrol', type: 'APARTMENT', operation: 'SALE', price: 135000, currency: 'USD', zone: 'Equipetrol', city: 'Santa Cruz', bedrooms: 3, bathrooms: 2, parking: 1, builtM2: 118, ownerId: owners[2].id, agentId: lucia.id, description: 'Departamento con vista al parque.' });
{
  const form = new FormData();
  form.append('file', new Blob([await readFile(new URL('./demo-fotos/depto1.jpg', import.meta.url))], { type: 'image/jpeg' }), 'depto.jpg');
  await admin('POST', `/properties/${vendida.id}/images`, form);
  const caseId = (await admin('GET', `/properties/${vendida.id}`)).cases[0].id;
  const comprador = await contact('Fernando Aguilera', '72200010', { email: 'fernando@correo.com', prefOperation: 'SALE', prefType: 'APARTMENT', prefZone: 'Equipetrol', prefBudgetMax: 140000, prefCurrency: 'USD', prefBedrooms: 3 });
  for (const s of ['CAPTATION', 'MARKETING']) await admin('PATCH', `/cases/${caseId}/stages/${s}`, { status: 'DONE' });
  const l = await admin('POST', '/leads', { contactId: comprador.id, propertyId: vendida.id, source: 'CALL' });
  const v = await admin('POST', '/visits', { propertyId: vendida.id, contactId: comprador.id, leadId: l.id, scheduledAt: days(1, 10) });
  await admin('PATCH', `/visits/${v.id}`, { status: 'DONE', result: 'Quiere cerrar rápido.' });
  for (const s of ['LEADS', 'FOLLOW_UP']) await admin('PATCH', `/cases/${caseId}/stages/${s}`, { status: 'DONE' });
  const o = await admin('POST', `/cases/${caseId}/offers`, { contactId: comprador.id, kind: 'OFFER', amount: 131000 });
  await admin('PATCH', `/offers/${o.id}`, { status: 'ACCEPTED' });
  await admin('POST', `/cases/${caseId}/reservations`, { contactId: comprador.id, amount: 3000, paidAt: days(0) });
  const pdf = new Blob(['%PDF-1.4\n% Documento de ejemplo de la demostración\n%%EOF'], { type: 'application/pdf' });
  for (const [name, category] of [['Contrato de compraventa', 'CONTRACT'], ['Folio real', 'TITLE']]) {
    const f = new FormData(); f.append('file', pdf, 'ejemplo.pdf'); f.append('entityType', 'case'); f.append('entityId', caseId); f.append('category', category); f.append('name', name);
    await admin('POST', '/documents', f);
  }
  await admin('POST', `/cases/${caseId}/close`, { result: 'WON' });
  await admin('PATCH', `/cases/${caseId}/stages/LEGAL`, { status: 'DONE', notes: 'Minuta firmada en notaría.' });
  await put(`/cases/${caseId}/post-sale`, { deliveredAt: days(0) });
  // Reseña por enlace: la agente envía el enlace y el cliente la escribe desde el portal.
  const { link } = await admin('POST', `/cases/${caseId}/review-link`);
  await fetch(`${API}/public/reviews/${link.split('/').pop()}`, { method: 'POST', headers: { 'x-forwarded-host': HOST, 'content-type': 'application/json' }, body: JSON.stringify({ rating: 5, text: 'Lucía nos acompañó en cada paso y cerramos en menos de un mes. Muy clara con los trámites y siempre atenta por WhatsApp.', publish: true }) });
  await admin('POST', `/cases/${caseId}/referrals`, { fullName: 'Gabriela Aguilera', phone: '72200011', notes: 'Hermana del cliente; busca alquilar en zona Norte.' });
}
// Marketing: publicaciones, campañas y vistas por fuente
await admin('POST', `/properties/${casa.id}/publications`, { channel: 'FACEBOOK', url: 'https://facebook.com/inmobiliariademo/posts/1001' });
await admin('POST', `/properties/${casa.id}/publications`, { channel: 'INSTAGRAM', url: 'https://instagram.com/p/demo1001' });
await admin('POST', `/properties/${depto.id}/publications`, { channel: 'EXTERNAL_PORTAL', notes: 'Publicado en portal de clasificados.' });
await admin('POST', '/campaigns', { name: 'Departamentos zona Norte', channel: 'FACEBOOK', budget: 1500, currency: 'BOB', startsAt: days(-5), endsAt: days(25), status: 'ACTIVE', notes: 'Anuncios segmentados a familias jóvenes.' });
await admin('POST', '/campaigns', { name: 'Letreros con QR en Equipetrol', channel: 'PRINT', budget: 600, currency: 'BOB', status: 'PLANNED' });
await admin('GET', '/whatsapp/templates');
await view(casa, 'qr', 6); await view(casa, 'facebook', 9); await view(casa, 'instagram', 4); await view(casa, '', 5);
await view(depto, 'whatsapp', 7); await view(depto, '', 3); await view(terreno, 'qr', 2); await view(mono, 'tiktok', 3);
for (const [p, v] of [[casa, 'demo-visitante-01'], [casa, 'demo-visitante-02'], [depto, 'demo-visitante-01']]) {
  await fetch(`${API}/public/properties/${p.code}/favorite`, { method: 'POST', headers: { 'x-forwarded-host': HOST, 'content-type': 'application/json' }, body: JSON.stringify({ visitorId: v, on: true }) });
}
created.push(vendida);

// ---------- Fase 3: finanzas ----------
{
  const F = '/finance';
  const vcase = (await admin('GET', `/properties/${vendida.id}`)).cases[0].id;
  const rec = (await admin('GET', `${F}/receivables`)).find((r) => r.case?.id === vcase);
  await admin('POST', `${F}/receivables/${rec.id}/payments`, { amount: 2000, date: days(0), method: 'TRANSFER' });
  await admin('POST', `${F}/transactions`, { kind: 'EXPENSE', category: 'ADVERTISING', amount: 120, currency: 'USD', date: days(-6), description: 'Fotografía profesional del departamento', method: 'TRANSFER', caseId: vcase });
  await admin('POST', `${F}/transactions`, { kind: 'EXPENSE', category: 'ADVERTISING', amount: 1500, currency: 'BOB', date: days(-5), description: 'Campaña en Facebook: departamentos zona Norte', method: 'CARD' });
  await admin('POST', `${F}/transactions`, { kind: 'EXPENSE', category: 'OFFICE', amount: 3500, currency: 'BOB', date: days(-7), description: 'Alquiler de la oficina', method: 'TRANSFER' });
  await admin('POST', `${F}/transactions`, { kind: 'EXPENSE', category: 'SERVICES', amount: 620, currency: 'BOB', date: days(-3), description: 'Luz, agua e internet', method: 'QR' });
  await admin('POST', `${F}/transactions`, { kind: 'INCOME', category: 'FEE', amount: 700, currency: 'BOB', date: days(-2), description: 'Honorarios por avalúo comercial', method: 'CASH' });
  await admin('POST', `${F}/payables`, { supplier: 'Imprenta Central', concept: 'Letreros con código QR', category: 'ADVERTISING', amount: 600, currency: 'BOB', dueDate: days(5) });
  await admin('POST', `${F}/payables`, { supplier: 'Proveedor de internet', concept: 'Servicio de internet de septiembre', category: 'SERVICES', amount: 350, currency: 'BOB', dueDate: days(-4) });
  await admin('POST', `${F}/receivables`, { contactId: owners[3].id, concept: 'Honorarios de administración de alquiler', category: 'FEE', amount: 180, currency: 'USD', dueDate: days(-8) });
  const com = (await admin('GET', `${F}/commissions`)).find((c) => c.case.id === vcase);
  await admin('PATCH', `${F}/commissions/${com.id}`, { status: 'APPROVED' });
  const liq = await admin('POST', `${F}/settlements`, { agentId: lucia.id, periodStart: days(-30), periodEnd: days(0), currency: 'USD' });
  await admin('POST', `${F}/settlements/${liq.id}/adjustments`, { kind: 'BONUS', amount: 100, note: 'Bono por cierre en menos de 30 días' });
  await admin('POST', `${F}/settlements/${liq.id}/adjustments`, { kind: 'ADVANCE', amount: 300, note: 'Anticipo entregado el día 1' });
  await admin('POST', `${F}/settlements/${liq.id}/approve`, {});
}

// ---------- Fase 4: tareas, propietario y automatizaciones ----------
{
  await admin('POST', '/tasks', { title: 'Pedir al propietario el folio real actualizado', type: 'DOCUMENT', priority: 'HIGH', dueAt: days(1, 15), assignedToId: juan.id, propertyId: casa.id });
  await admin('POST', '/tasks', { title: 'Enviar opciones de alquiler por WhatsApp', type: 'WHATSAPP', priority: 'MEDIUM', dueAt: days(2, 11), assignedToId: lucia.id, contactId: clients[1].id });
  await admin('POST', '/tasks', { title: 'Revisar el contrato de reserva', type: 'REVIEW', priority: 'URGENT', dueAt: days(-1, 17), notes: 'El comprador pidió ampliar el plazo de pago.' });
  const casaOwner = (await admin('GET', `/properties/${casa.id}`)).owner;
  await admin('POST', '/owner/accounts', { contactId: casaOwner.id, email: 'propietario@demo.com', password: PASS });
  await admin('POST', '/automations/run', {});
}

// ---------- Fase 5: marca, integraciones, facturas, contabilidad y bancos ----------
{
  await admin('PATCH', '/company', { legalName: 'Inmobiliaria Demo S.R.L.', taxId: '1023456028', whatsapp: '59170011223', schedule: 'Lunes a viernes de 9:00 a 18:30', facebook: 'https://facebook.com/inmobiliariademo', instagram: 'https://instagram.com/inmobiliariademo', tiktok: 'https://tiktok.com/@inmobiliariademo', phone: '3 3400000', email: 'contacto@inmobiliariademo.com', address: 'Av. San Martín 450, Equipetrol, Santa Cruz', about: 'Te ayudamos a comprar, alquilar o invertir en Santa Cruz con asesoría personal de principio a fin.' });
  await admin('POST', '/company/domains', { domain: 'www.inmobiliariademo.com' });
  await admin('POST', '/integrations/keys', { name: 'Sitio web de la inmobiliaria' });
  const inv = await admin('POST', '/invoices', { date: days(-2), customerName: 'Roberto Áñez', customerTaxId: '4821937', currency: 'USD', items: [{ description: 'Comisión por intermediación en venta', quantity: 1, unitPrice: 3930 }] });
  await admin('POST', `/invoices/${inv.id}/issue`, {});
  await admin('POST', '/invoices', { date: days(0), customerName: 'Constructora Oriente S.A.', customerTaxId: '1028374021', currency: 'BOB', items: [{ description: 'Avalúo comercial', quantity: 1, unitPrice: 700 }, { description: 'Informe de mercado de la zona', quantity: 2, unitPrice: 450 }] });
  const accounts = await admin('GET', '/accounting/accounts');
  const acc = (code) => accounts.find((a) => a.code === code).id;
  await admin('POST', '/accounting/journal', { date: days(-30), description: 'Aporte de capital de los socios', currency: 'USD', lines: [{ accountId: acc('1102'), debit: 5000 }, { accountId: acc('3101'), credit: 5000 }] });
  await admin('POST', '/accounting/journal', { date: days(-30), description: 'Aporte de capital de los socios', currency: 'BOB', lines: [{ accountId: acc('1102'), debit: 20000 }, { accountId: acc('3101'), credit: 20000 }] });
  const bank = await admin('POST', '/bank/accounts', { name: 'Cuenta corriente en bolivianos', bank: 'Banco Nacional', number: '1000-458721', currency: 'BOB' });
  const f = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  await admin('POST', `/bank/accounts/${bank.id}/import`, { csv: ['Fecha;Glosa;Nro Documento;Débito;Crédito', `${f(-7)};Pago alquiler oficina;TR-88121;3.500,00;`, `${f(-5)};Compra con tarjeta FACEBK ADS;TJ-10442;1.500,00;`, `${f(-3)};Débito automático servicios;DA-7719;620,00;`, `${f(-2)};Mantenimiento de cuenta;CM-0091;35,00;`, `${f(-1)};Depósito en ventanilla;DP-5521;;2.400,00`].join('\n') });
}

// ---------- Fase 6: sucursales, mapas, permisos, tipo de cambio, IVA y legal ----------
{
  const coords = { 'Equipetrol': [-17.7672, -63.1958], 'Equipetrol Norte': [-17.7598, -63.1975], 'Norte': [-17.7482, -63.1781], 'Urubó': [-17.7694, -63.2468], 'Centro': [-17.7836, -63.1822], 'Las Palmas': [-17.8031, -63.2012], 'Sur': [-17.8152, -63.1702] };
  const all = await admin('GET', '/properties');
  let n = 0;
  for (const p of all) {
    const c = coords[p.zone];
    if (c) await admin('PATCH', `/properties/${p.id}`, { latitude: c[0] + (n % 3) * 0.0011, longitude: c[1] - (n++ % 2) * 0.0013 });
  }
  const scz = await admin('POST', '/branches', { name: 'Santa Cruz', city: 'Santa Cruz de la Sierra', address: 'Av. San Martín 450', phone: '3 3400000' });
  const lpz = await admin('POST', '/branches', { name: 'La Paz', city: 'La Paz', address: 'Av. 20 de Octubre 2150, Sopocachi', phone: '2 2410000' });
  await admin('PATCH', `/users/${juan.id}`, { branchId: scz.id });
  await admin('PATCH', `/users/${lucia.id}`, { branchId: scz.id, permissions: { manage_campaigns: true } });
  const pedro = await admin('POST', '/users', { email: 'pedro@demo.com', fullName: 'Pedro Mamani', role: 'AGENT', phone: '70077889', password: PASS, branchId: lpz.id });
  await admin('PATCH', `/users/${pedro.id}`, { permissions: { branch_manager: true } });
  // Fotos de perfil (ilustraciones genéricas de la demo; cada agente sube la suya desde Mi perfil).
  const me = await admin('GET', '/auth/me');
  for (const [uid, file] of [[me.id, 'agente-admin'], [juan.id, 'agente-juan'], [lucia.id, 'agente-lucia'], [pedro.id, 'agente-pedro']]) {
    const f = new FormData(); f.append('file', new Blob([await readFile(new URL(`./demo-fotos/${file}.png`, import.meta.url))], { type: 'image/png' }), `${file}.png`);
    await admin('POST', `/users/${uid}/avatar`, f);
  }
  await admin('POST', '/users', { email: 'rosa@demo.com', fullName: 'Rosa Quispe', role: 'AGENT', phone: '70099001', password: PASS, branchId: lpz.id });
  // Comisión por nivel: en ventas, el agente recibe más cuando supera USD 150.000 vendidos en el mes.
  const sale = (await admin('GET', '/finance/rules')).find((r) => r.operation === 'SALE' && !r.agentId);
  if (sale) await admin('PATCH', `/finance/rules/${sale.id}`, { name: 'Venta: 3 % del precio, por nivel', tiers: [{ from: 0, agentSharePct: 50 }, { from: 150000, agentSharePct: 60 }, { from: 300000, agentSharePct: 70 }], tierPeriod: 'MONTH' });
  // Movimientos de la gestión pasada, listos para el cierre.
  const ly = new Date().getFullYear() - 1;
  await admin('POST', '/finance/transactions', { kind: 'INCOME', category: 'SALE_COMMISSION', amount: 12500, currency: 'USD', date: `${ly}-11-20T15:00:00.000Z`, description: 'Comisión venta casa en Equipetrol (gestión anterior)' });
  await admin('POST', '/finance/transactions', { kind: 'EXPENSE', category: 'OFFICE', amount: 4200, currency: 'USD', date: `${ly}-12-05T15:00:00.000Z`, description: 'Alquiler de oficina (gestión anterior)' });
  const lp = await admin('POST', '/properties', { title: 'Departamento con vista en Sopocachi', type: 'APARTMENT', operation: 'SALE', price: 98000, currency: 'USD', zone: 'Sopocachi', city: 'La Paz', bedrooms: 3, bathrooms: 2, parking: 1, builtM2: 110, yearBuilt: 2018, agentId: pedro.id, ownerId: owners[0].id, latitude: -16.5101, longitude: -68.1263, features: ['Ascensor', 'Balcón', 'Vista panorámica'], description: 'Departamento luminoso en el corazón de Sopocachi.' });
  await admin('PATCH', `/cases/${(await admin('GET', `/properties/${lp.id}`)).cases[0].id}/stages/CAPTATION`, { status: 'DONE', notes: 'Captación firmada.' });
  await admin('PATCH', `/cases/${(await admin('GET', `/properties/${lp.id}`)).cases[0].id}/stages/MARKETING`, { status: 'DONE', notes: 'Fotos listas.' });
  const calacoto = await admin('POST', '/properties', { title: 'Casa en Calacoto con jardín', type: 'HOUSE', operation: 'RENT', price: 9800, currency: 'BOB', zone: 'Calacoto', city: 'La Paz', bedrooms: 4, bathrooms: 3, parking: 2, builtM2: 260, areaM2: 420, agentId: pedro.id, latitude: -16.5402, longitude: -68.0861, features: ['Jardín', 'Churrasquera'] });
  // Alquiler ya cerrado: listo para pedir la reseña al inquilino desde Postventa.
  const inquilino = await contact('Andrea Villarroel', '72200020', { email: 'andrea@correo.com' });
  await admin('POST', `/cases/${(await admin('GET', `/properties/${calacoto.id}`)).cases[0].id}/close`, { result: 'WON', clientId: inquilino.id, closedPrice: 9500 });

  await admin('POST', '/finance/exchange-rates', { date: days(-30), rate: 6.96 });
  await admin('POST', '/tax/purchases', { date: days(-5), supplierTaxId: '1020304050', supplierName: 'Imprenta Central S.R.L.', invoiceNumber: '4521', authCode: '29040011007', total: 600 });
  await admin('POST', '/tax/purchases', { date: days(-3), supplierTaxId: '1028374012', supplierName: 'Cotas Ltda.', invoiceNumber: '889104', total: 620 });

  // Proceso legal de la casa en negociación: trámites avanzados y una firma pendiente.
  const casaCase = (await admin('GET', `/properties/${casa.id}`)).cases[0].id;
  const legal = await admin('GET', `/cases/${casaCase}/legal`);
  for (const item of legal.items.slice(0, 3)) await admin('PATCH', `/legal/items/${item.id}`, { done: true });
  const f = new FormData(); f.append('file', new Blob([Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')], { type: 'application/pdf' }), 'minuta.pdf'); f.append('entityType', 'case'); f.append('entityId', casaCase); f.append('category', 'CONTRACT'); f.append('name', 'Minuta de compraventa');
  const minuta = await admin('POST', '/documents', f);
  await admin('POST', `/cases/${casaCase}/signatures`, { documentId: minuta.id, signerName: 'Carlos Mendoza', signerRole: 'CLIENT' });
  const g = new FormData(); g.append('file', new Blob([Buffer.from('%PDF-1.4\n%%EOF')], { type: 'application/pdf' }), 'autorizacion.pdf'); g.append('entityType', 'property'); g.append('entityId', casa.id); g.append('category', 'AUTHORIZATION'); g.append('name', 'Autorización de venta firmada');
  await admin('POST', '/documents', g);
}
console.log(`Listo: ${created.length + 2} propiedades, ${owners.length + clients.length + 1} contactos, 4 agentes en 2 sucursales y un contador en la empresa demo.`);
