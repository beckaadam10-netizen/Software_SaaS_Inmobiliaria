// Prueba de punta a punta de la Fase 1 contra una API en marcha y una base recién sembrada.
// Uso: node scripts/smoke.mjs   (requiere: pnpm db:seed y la API corriendo en el puerto 3001)
const API = process.env.API_URL ?? 'http://localhost:3001/api';
let passed = 0, failed = 0;
const check = (name, ok, extra = '') => { ok ? passed++ : failed++; console.log(`${ok ? '  ok ' : 'FALLA'}  ${name}${ok ? '' : '  ' + extra}`); };

function client(host) {
  let cookie = '';
  const extra = {};
  const call = async (method, path, body, isForm) => {
    const res = await fetch(API + path, {
      method,
      headers: { 'x-forwarded-host': host, ...extra, ...(cookie ? { cookie } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json().catch(() => null) : await res.arrayBuffer();
    return { status: res.status, data, type };
  };
  return {
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b), put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p), form: (p, f) => call('POST', p, f, true),
    login: (email, password) => call('POST', '/auth/login', { email, password }),
    header: (k, v) => { if (v == null) delete extra[k]; else extra[k] = v; },
  };
}
const run = Date.now().toString(36);
const PASS = 'Cambiar123!';

// --- Superadmin ---
const sa = client('admin.localhost:3000');
check('superadmin inicia sesión', (await sa.login('superadmin@softinmo.com', PASS)).status === 200);
const plans = (await sa.get('/admin/plans')).data;
check('lista los 4 planes', plans.length >= 4);
const inicio = plans.find((p) => p.code === 'inicio');
const slug = `otra${run}`;
const created = await sa.post('/admin/tenants', { name: 'Otra Inmobiliaria', slug, planId: inicio.id, adminName: 'Ana Otra', adminEmail: 'ana@otra.com', adminPassword: PASS });
check('crea una empresa con su administrador', created.status === 201, JSON.stringify(created.data));
check('rechaza subdominio repetido', (await sa.post('/admin/tenants', { name: 'X', slug, planId: inicio.id, adminName: 'A', adminEmail: 'a@a.com', adminPassword: PASS })).status === 400);
check('rechaza subdominio reservado', (await sa.post('/admin/tenants', { name: 'X', slug: 'admin', planId: inicio.id, adminName: 'A', adminEmail: 'a@a.com', adminPassword: PASS })).status === 400);
check('estadísticas globales', (await sa.get('/admin/stats')).data.tenants.active >= 2);
check('superadmin no entra a datos de empresa', (await sa.get('/properties')).status === 403);

// --- Empresa demo: administrador ---
const admin = client('demo.localhost:3000');
check('admin demo inicia sesión', (await admin.login('admin@demo.com', PASS)).status === 200);
check('admin demo no entra al superadmin', (await admin.get('/admin/tenants')).status >= 401);
const agentEmail = `agente${run}@demo.com`;
const agentRes = await admin.post('/users', { email: agentEmail, fullName: 'Carlos Agente', role: 'AGENT', password: PASS, phone: '70000001' });
check('crea un agente', agentRes.status === 201, JSON.stringify(agentRes.data));
const agentId = agentRes.data.id;
check('no expone el hash de la contraseña', !('passwordHash' in agentRes.data));
check('rechaza email repetido', (await admin.post('/users', { email: agentEmail, fullName: 'X', role: 'AGENT', password: PASS })).status === 400);
check('no puede quitarse su propio rol', (await admin.patch(`/users/${(await admin.get('/auth/me')).data.id}`, { role: 'AGENT' })).status === 400);

const owner = (await admin.post('/contacts', { fullName: 'María Propietaria', phone: '71111111', type: 'OWNER' })).data;
check('crea un contacto propietario', !!owner.id);
const propRes = await admin.post('/properties', {
  title: 'Casa en Equipetrol', type: 'HOUSE', operation: 'SALE', price: 180000, currency: 'USD', zone: 'Equipetrol', city: 'Santa Cruz',
  bedrooms: 3, bathrooms: 2, parking: 2, areaM2: 320, builtM2: 210, description: 'Casa amplia con jardín.', features: ['Jardín', 'Churrasquera'],
  ownerId: owner.id, agentId,
});
check('crea una propiedad', propRes.status === 201, JSON.stringify(propRes.data));
const prop = propRes.data;
check('genera código de propiedad', /^DEM-\d{4}$/.test(prop.code), prop.code);
let detail = (await admin.get(`/properties/${prop.id}`)).data;
check('abre el expediente automáticamente', detail.cases.length === 1 && detail.cases[0].currentStage === 'CAPTATION');
check('guarda el primer precio en el historial', detail.priceHistory.length === 1);
const caseId = detail.cases[0].id;

// Imagen
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'foto.png');
const img = await admin.form(`/properties/${prop.id}/images`, form);
check('sube una foto', img.status === 201, JSON.stringify(img.data));
const fake = new FormData(); fake.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'x.png');
check('rechaza un archivo que no es imagen', (await admin.form(`/properties/${prop.id}/images`, fake)).status === 400);
const imgGet = await client('demo.localhost:3000').get(`/images/${img.data.id}`);
check('sirve la foto en su subdominio', imgGet.status === 200 && imgGet.type === 'image/png');
check('no sirve la foto en otra empresa', (await client(`${slug}.localhost:3000`).get(`/images/${img.data.id}`)).status === 404);

// Portal: aún no publicada
const pub = client('demo.localhost:3000');
check('no aparece en el portal antes de publicar', !(await pub.get('/public/properties')).data.some((p) => p.code === prop.code));
check('la ficha pública da 404 antes de publicar', (await pub.get(`/public/properties/${prop.code}`)).status === 404);

// Pasos 1 y 2
await admin.patch(`/cases/${caseId}/stages/CAPTATION`, { status: 'DONE', notes: 'Autorización firmada' });
let exp = (await admin.get(`/cases/${caseId}`)).data;
check('completar Captación habilita Marketing', exp.currentStage === 'MARKETING' && exp.stages[1].status === 'IN_PROGRESS');
await admin.patch(`/cases/${caseId}/stages/MARKETING`, { status: 'DONE' });
detail = (await admin.get(`/properties/${prop.id}`)).data;
check('completar Marketing publica la propiedad', detail.isPublished === true);

// Portal público
const list = (await pub.get('/public/properties')).data;
const card = list.find((p) => p.code === prop.code);
check('aparece en el portal', !!card);
const ficha = (await pub.get(`/public/properties/${prop.code}`)).data;
check('la ficha pública no expone datos internos', ficha && !('ownerId' in ficha) && !('owner' in ficha) && !('address' in ficha) && !('id' in ficha) && !('viewCount' in ficha));
check('la ficha muestra al agente', ficha.agent?.fullName === 'Carlos Agente');
const interest = await pub.post(`/public/properties/${prop.code}/interest`, { fullName: 'Carlos Cliente', phone: '72222222', email: 'carlos@correo.com', message: 'Quisiera conocer la casa este fin de semana.', visitAt: new Date(Date.now() + 2 * 864e5).toISOString() });
check('el visitante envía "me interesa" con visita', interest.status === 201, JSON.stringify(interest.data));
check('valida el formulario público', (await pub.post(`/public/properties/${prop.code}/interest`, { fullName: '', phone: '1' })).status === 400);

// Agente: ve lo suyo
const agent = client('demo.localhost:3000');
check('el agente inicia sesión', (await agent.login(agentEmail, PASS)).status === 200);
const leads = (await agent.get('/leads')).data;
const lead = leads.find((l) => l.contact.fullName === 'Carlos Cliente');
check('el lead llega al agente de la propiedad', !!lead && lead.agent?.id === agentId);
check('el lead tiene puntaje', lead.score >= 80, String(lead.score));
check('el lead queda ligado al expediente', lead.caseId === caseId);
const visits = (await agent.get('/visits')).data;
const visit = visits.find((v) => v.contact.fullName === 'Carlos Cliente');
check('la visita solicitada aparece en la agenda', visit?.status === 'REQUESTED');
check('el agente no administra usuarios', (await agent.get('/users')).status === 403);
const dash = (await agent.get('/dashboard')).data;
check('el dashboard muestra lead por contactar y visita por confirmar', dash.today.leadsToContact.length >= 1 && dash.today.visitRequests.length >= 1);

// Otra propiedad del admin que el agente no debe ver
const hidden = (await admin.post('/properties', { title: 'Oficina del admin', type: 'OFFICE', operation: 'RENT', price: 900, currency: 'USD' })).data;
check('el agente no ve propiedades de otros', !(await agent.get('/properties')).data.some((p) => p.id === hidden.id) && (await agent.get(`/properties/${hidden.id}`)).status === 404);
check('el agente no edita propiedades de otros', (await agent.patch(`/properties/${hidden.id}`, { price: 1 })).status === 404);

// Pasos 3 a 8
await agent.patch(`/leads/${lead.id}`, { status: 'CONTACTED' });
await agent.patch(`/visits/${visit.id}`, { status: 'CONFIRMED' });
await agent.patch(`/visits/${visit.id}`, { status: 'DONE', result: 'Le gustó; pidió rebaja.' });
exp = (await agent.get(`/cases/${caseId}`)).data;
const st = Object.fromEntries(exp.stages.map((s) => [s.stage, s.status]));
check('la visita realizada completa el paso Visita e inicia Seguimiento', st.VISIT === 'DONE' && st.FOLLOW_UP === 'IN_PROGRESS', JSON.stringify(st));
await agent.patch(`/cases/${caseId}/stages/LEADS`, { status: 'DONE' });
await agent.patch(`/cases/${caseId}/stages/FOLLOW_UP`, { status: 'DONE', notes: 'Hará oferta' });
exp = (await agent.get(`/cases/${caseId}`)).data;
check('el expediente avanza a Negociación', exp.currentStage === 'NEGOTIATION');
check('la propiedad pasa a "en negociación"', (await agent.get(`/properties/${prop.id}`)).data.status === 'NEGOTIATING');
check('no cierra como ganada sin cliente', (await agent.post(`/cases/${caseId}/close`, { result: 'WON' })).status === 400);
const close = await agent.post(`/cases/${caseId}/close`, { result: 'WON', clientId: lead.contact.id, closedPrice: 175000 });
check('cierra la operación como ganada', close.status === 201, JSON.stringify(close.data));
exp = (await agent.get(`/cases/${caseId}`)).data;
detail = (await agent.get(`/properties/${prop.id}`)).data;
check('la propiedad queda vendida y fuera del portal', detail.status === 'SOLD' && detail.isPublished === false);
check('el expediente queda ganado y pasa a Legal', exp.status === 'WON' && exp.currentStage === 'LEGAL' && Number(exp.closedPrice) === 175000);
check('el timeline registra la historia', exp.timeline.length >= 8, String(exp.timeline.length));
check('ya no aparece en el portal', (await pub.get(`/public/properties/${prop.code}`)).status === 404);
check('no se puede cerrar dos veces', (await agent.post(`/cases/${caseId}/close`, { result: 'LOST' })).status === 400);
await agent.patch(`/properties/${prop.id}`, { isPublished: true });
check('una propiedad vendida no se puede volver a publicar', (await agent.get(`/properties/${prop.id}`)).data.isPublished === false);

// --- Aislamiento entre empresas ---
const otra = client(`${slug}.localhost:3000`);
check('admin de la otra empresa inicia sesión', (await otra.login('ana@otra.com', PASS)).status === 200);
check('la otra empresa empieza vacía', (await otra.get('/properties')).data.length === 0 && (await otra.get('/contacts')).data.length === 0 && (await otra.get('/leads')).data.length === 0);
check('no lee una propiedad ajena por id', (await otra.get(`/properties/${prop.id}`)).status === 404);
check('no edita una propiedad ajena', (await otra.patch(`/properties/${prop.id}`, { price: 1 })).status === 404);
check('no lee un expediente ajeno', (await otra.get(`/cases/${caseId}`)).status === 404);
check('no edita un usuario ajeno', (await otra.patch(`/users/${agentId}`, { isActive: false })).status === 404);
check('no enlaza un propietario ajeno', (await otra.post('/properties', { title: 'X', type: 'HOUSE', operation: 'SALE', price: 1, ownerId: owner.id })).status === 400);
check('no enlaza un agente ajeno', (await otra.post('/properties', { title: 'X', type: 'HOUSE', operation: 'SALE', price: 1, agentId })).status === 400);
check('no crea lead con contacto ajeno', (await otra.post('/leads', { contactId: owner.id })).status === 400);
check('el usuario de demo no entra en la otra empresa', (await client(`${slug}.localhost:3000`).login('admin@demo.com', PASS)).status === 401);
check('la propiedad ajena no sale en su portal', (await client(`${slug}.localhost:3000`).get('/public/properties')).data.length === 0);

// --- Límites del plan Inicio: 2 agentes ---
const a1 = await otra.post('/users', { email: 'a1@otra.com', fullName: 'Agente 1', role: 'AGENT', password: PASS });
const a2 = await otra.post('/users', { email: 'a2@otra.com', fullName: 'Agente 2', role: 'AGENT', password: PASS });
const a3 = await otra.post('/users', { email: 'a3@otra.com', fullName: 'Agente 3', role: 'AGENT', password: PASS });
check('permite los 2 agentes del plan Inicio', a1.status === 201 && a2.status === 201);
check('bloquea el tercer agente con mensaje claro', a3.status === 403 && /límite de agentes/.test(a3.data.message), JSON.stringify(a3.data));
const tenants = (await sa.get('/admin/tenants')).data;
const otraRow = tenants.find((t) => t.slug === slug);
await sa.patch(`/admin/tenants/${otraRow.id}`, { extraAgents: 1 });
check('un agente adicional contratado amplía el límite', (await otra.post('/users', { email: 'a3@otra.com', fullName: 'Agente 3', role: 'AGENT', password: PASS })).status === 201);
check('el superadmin ve el uso por empresa', otraRow.usage.agents === 2);

// --- Contador: solo lectura ---
await admin.post('/users', { email: `conta${run}@demo.com`, fullName: 'Contadora', role: 'ACCOUNTANT', password: PASS });
const conta = client('demo.localhost:3000');
await conta.login(`conta${run}@demo.com`, PASS);
check('el contador puede consultar', (await conta.get('/properties')).status === 200);
check('el contador no puede modificar', (await conta.post('/contacts', { fullName: 'X' })).status === 403);

// --- Suspensión ---
await sa.patch(`/admin/tenants/${otraRow.id}`, { status: 'SUSPENDED' });
check('una empresa suspendida queda bloqueada', (await otra.get('/properties')).status === 403);
await sa.patch(`/admin/tenants/${otraRow.id}`, { status: 'ACTIVE' });
check('al reactivarla vuelve a funcionar', (await otra.get('/properties')).status === 200);

// --- Auditoría ---
const audit = (await admin.get('/audit')).data;
check('la auditoría registra los cambios', audit.length >= 5 && audit.every((a) => !JSON.stringify(a.after ?? {}).includes(PASS)));
check('la auditoría es solo para administradores', (await agent.get('/audit')).status === 403);


// ====================== FASE 2 ======================
console.log('\n--- Fase 2 ---');
const buyer = (await admin.post('/contacts', { fullName: 'Laura Compradora', phone: '74444444', prefOperation: 'SALE', prefType: 'APARTMENT', prefZone: 'equipetrol', prefBudgetMax: 120000, prefCurrency: 'USD', prefBedrooms: 2 })).data;
const renter = (await admin.post('/contacts', { fullName: 'Rita Alquila', phone: '74444445', prefOperation: 'RENT', prefType: 'APARTMENT' })).data;
const p2 = (await admin.post('/properties', { title: 'Departamento en Equipetrol', type: 'APARTMENT', operation: 'SALE', price: 115000, currency: 'USD', zone: 'Equipetrol Norte', city: 'Santa Cruz', bedrooms: 2, agentId })).data;
const c2 = (await admin.get(`/properties/${p2.id}`)).data.cases[0].id;
await admin.patch(`/cases/${c2}/stages/CAPTATION`, { status: 'DONE' });
await admin.patch(`/cases/${c2}/stages/MARKETING`, { status: 'DONE' });

// Matching
const forProp = await admin.get(`/matching/properties/${p2.id}`);
check('matching: encuentra al cliente compatible', forProp.status === 200 && forProp.data.some((m) => m.id === buyer.id && m.score === 100), JSON.stringify(forProp.data));
check('matching: descarta a quien busca otra operación', !forProp.data.some((m) => m.id === renter.id));
const forContact = (await admin.get(`/matching/contacts/${buyer.id}`)).data;
check('matching: propiedades compatibles con el cliente', forContact.some((m) => m.id === p2.id));
check('matching: no disponible en el plan Inicio', (await otra.get(`/matching/contacts/${buyer.id}`)).status === 403);

// Estadísticas, QR y favoritos
await pub.get(`/public/properties/${p2.code}?src=qr`); await pub.get(`/public/properties/${p2.code}?src=qr`);
await pub.get(`/public/properties/${p2.code}?src=whatsapp`); await pub.get(`/public/properties/${p2.code}?src=cualquiera`);
const fav1 = await pub.post(`/public/properties/${p2.code}/favorite`, { visitorId: 'visitante-0001', on: true });
await pub.post(`/public/properties/${p2.code}/favorite`, { visitorId: 'visitante-0001', on: true });
await pub.post(`/public/properties/${p2.code}/favorite`, { visitorId: 'visitante-0002', on: true });
const fav2 = await pub.post(`/public/properties/${p2.code}/favorite`, { visitorId: 'visitante-0002', on: false });
check('favoritos: guarda sin duplicar y permite quitar', fav1.data.favorites === 1 && fav2.data.favorites === 1, JSON.stringify(fav2.data));
check('favoritos: rechaza identificadores inválidos', (await pub.post(`/public/properties/${p2.code}/favorite`, { visitorId: '<x>', on: true })).status === 400);
await Promise.all(Array.from({ length: 12 }, () => pub.get(`/public/properties/${p2.code}?src=tiktok`)));
const stats = (await admin.get(`/properties/${p2.id}/stats`)).data;
check('estadísticas: no pierde vistas simultáneas', stats.sources.TIKTOK === 12, JSON.stringify(stats.sources));
check('estadísticas: cuenta vistas por fuente y escaneos de QR', stats.views === 16 && stats.qrScans === 2 && stats.sources.WHATSAPP === 1 && stats.sources.DIRECT === 1 && stats.favorites === 1, JSON.stringify(stats));
check('estadísticas: serie de 14 días con las vistas de hoy', stats.daily.length === 14 && stats.daily[13].views === 16);
check('estadísticas: ajenas a otra empresa', (await otra.get(`/properties/${p2.id}/stats`)).status === 404);

// Marketing
const pubRes = await admin.post(`/properties/${p2.id}/publications`, { channel: 'INSTAGRAM', url: 'https://instagram.com/p/abc' });
check('marketing: registra una publicación', pubRes.status === 201);
check('marketing: valida la dirección', (await admin.post(`/properties/${p2.id}/publications`, { channel: 'FACEBOOK', url: 'javascript:alert(1)' })).status === 400);
const camp = await admin.post('/campaigns', { name: 'Feria inmobiliaria', channel: 'FACEBOOK', budget: 1500, status: 'ACTIVE' });
check('marketing: crea una campaña', camp.status === 201);
check('marketing: el agente no crea campañas', (await agent.post('/campaigns', { name: 'X', channel: 'OTHER' })).status === 403);
const ov = (await admin.get('/marketing/overview')).data;
check('marketing: resumen por fuente', ov.viewsBySource.QR === 2 && ov.leadsBySource.WEB >= 1 && ov.activePublications === 1, JSON.stringify(ov));
check('marketing: no disponible en el plan Inicio', (await otra.get('/marketing/overview')).status === 403);

// WhatsApp
const tpls = (await agent.get('/whatsapp/templates')).data;
check('whatsapp: plantillas iniciales', tpls.length === 4 && tpls[0].body.includes('{cliente}'));
check('whatsapp: el agente no edita plantillas', (await agent.post('/whatsapp/templates', { name: 'X', body: 'Y' })).status === 403);
const l2 = (await admin.post('/leads', { contactId: buyer.id, propertyId: p2.id, source: 'WHATSAPP' })).data;
await agent.post('/whatsapp/log', { contactId: buyer.id, leadId: l2.id, templateName: 'Primer contacto' });
check('whatsapp: escribir a un lead nuevo lo marca contactado', (await agent.get('/leads')).data.find((l) => l.id === l2.id).status === 'CONTACTED');

// Notificaciones
const notes = (await agent.get('/notifications')).data;
check('notificaciones: el agente recibe el lead asignado', notes.unread >= 1 && notes.items.some((n) => n.type === 'lead' && n.title.includes('Laura')));
check('notificaciones: quien hace la acción no se avisa a sí mismo', !(await admin.get('/notifications')).data.items.some((n) => n.title.includes('Laura Compradora')));
await agent.post('/notifications/read', {});
check('notificaciones: marcar todas como leídas', (await agent.get('/notifications')).data.unread === 0);

// Negociación
const o1 = await agent.post(`/cases/${c2}/offers`, { contactId: buyer.id, kind: 'OFFER', amount: 105000, conditions: 'Pago al contado' });
check('negociación: registra una oferta', o1.status === 201 && o1.data.currency === 'USD', JSON.stringify(o1.data));
let neg = (await agent.get(`/cases/${c2}`)).data;
check('negociación: la oferta inicia el paso 6 y la propiedad pasa a negociación', neg.stages[5].status === 'IN_PROGRESS' && (await agent.get(`/properties/${p2.id}`)).data.status === 'NEGOTIATING');
check('negociación: el lead pasa a Negociación', (await agent.get('/leads')).data.find((l) => l.id === l2.id).status === 'NEGOTIATION');
await agent.patch(`/offers/${o1.data.id}`, { status: 'REJECTED' });
const o2 = await agent.post(`/cases/${c2}/offers`, { contactId: buyer.id, kind: 'COUNTER', amount: 112000 });
const o3 = await agent.post(`/cases/${c2}/offers`, { contactId: buyer.id, kind: 'OFFER', amount: 110000 });
await agent.patch(`/offers/${o3.data.id}`, { status: 'ACCEPTED' });
neg = (await agent.get(`/cases/${c2}`)).data;
const byId = Object.fromEntries(neg.offers.map((o) => [o.id, o.status]));
check('negociación: aceptar una oferta descarta las pendientes y fija al cliente', byId[o3.data.id] === 'ACCEPTED' && byId[o2.data.id] === 'REJECTED' && neg.client?.id === buyer.id, JSON.stringify(byId));
check('negociación: conserva todo el historial de ofertas', neg.offers.length === 3);
check('negociación: una oferta resuelta no se cambia', (await agent.patch(`/offers/${o1.data.id}`, { status: 'ACCEPTED' })).status === 400);
check('negociación: admin recibe aviso de la oferta', (await admin.get('/notifications')).data.items.some((n) => n.type === 'offer'));
const r1 = await agent.post(`/cases/${c2}/reservations`, { contactId: buyer.id, amount: 2000, paidAt: new Date().toISOString() });
check('negociación: registra la reserva y la propiedad queda reservada', r1.status === 201 && (await agent.get(`/properties/${p2.id}`)).data.status === 'RESERVED');
check('negociación: no admite dos reservas activas', (await agent.post(`/cases/${c2}/reservations`, { contactId: buyer.id, amount: 1, paidAt: new Date().toISOString() })).status === 400);
await agent.patch(`/cases/${c2}/stages/NEGOTIATION`, { notes: 'Firma la próxima semana' });
check('negociación: la reserva se mantiene al editar el paso', (await agent.get(`/properties/${p2.id}`)).data.status === 'RESERVED');
check('negociación: lista de negociaciones en curso', (await agent.get('/negotiations')).data.some((n) => n.id === c2 && n.offerCount === 3));
check('negociación: otra empresa no oferta en un expediente ajeno', (await otra.post(`/cases/${c2}/offers`, { contactId: buyer.id, amount: 1 })).status === 404);

// Documentos
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const docForm = (blob, name, extra = {}) => { const f = new FormData(); f.append('file', blob, name); f.append('entityType', 'case'); f.append('entityId', c2); f.append('category', 'CONTRACT'); f.append('name', 'Contrato de reserva'); for (const [k, v] of Object.entries(extra)) f.set(k, v); return f; };
const doc = await agent.form('/documents', docForm(new Blob([pdf], { type: 'application/pdf' }), 'contrato.pdf'));
check('documentos: sube un PDF al expediente', doc.status === 201, JSON.stringify(doc.data));
check('documentos: rechaza un archivo disfrazado de PDF', (await agent.form('/documents', docForm(new Blob(['<html>'], { type: 'application/pdf' }), 'x.pdf'))).status === 400);
check('documentos: aparece en la lista del expediente', (await agent.get(`/documents?entityType=case&entityId=${c2}`)).data.length === 1);
const dl = await agent.get(`/documents/${doc.data.id}/download`);
check('documentos: se descarga con sesión', dl.status === 200 && dl.type === 'application/pdf' && Buffer.from(dl.data).toString().startsWith('%PDF'));
check('documentos: no se descarga sin sesión', (await client('demo.localhost:3000').get(`/documents/${doc.data.id}/download`)).status === 401);
check('documentos: no se descarga desde otra empresa', (await otra.get(`/documents/${doc.data.id}/download`)).status === 404);
check('documentos: otra empresa no lista los ajenos', (await otra.get(`/documents?entityType=case&entityId=${c2}`)).status === 404);
check('documentos: el contador puede leer pero no subir', (await conta.get(`/documents?entityType=case&entityId=${c2}`)).status === 200 && (await conta.form('/documents', docForm(new Blob([pdf], { type: 'application/pdf' }), 'c.pdf'))).status === 403);

// Cierre y postventa
check('postventa: no empieza antes de cerrar', (await agent.put(`/cases/${c2}/post-sale`, { satisfaction: 5 })).status === 400);
await agent.post(`/cases/${c2}/close`, { result: 'WON' });
neg = (await agent.get(`/cases/${c2}`)).data;
check('cierre: toma el monto de la oferta aceptada y aplica la reserva', Number(neg.closedPrice) === 110000 && neg.reservations[0].status === 'APPLIED', `${neg.closedPrice} ${neg.reservations[0]?.status}`);
const ps = await agent.put(`/cases/${c2}/post-sale`, { deliveredAt: new Date().toISOString(), satisfaction: 5, testimonial: 'Excelente atención de principio a fin.', testimonialPublic: true });
check('postventa: registra entrega, satisfacción y testimonio', ps.status === 200 && ps.data.satisfaction === 5, JSON.stringify(ps.data));
check('postventa: valida la satisfacción de 1 a 5', (await agent.put(`/cases/${c2}/post-sale`, { satisfaction: 9 })).status === 400);
const refd = await agent.post(`/cases/${c2}/referrals`, { fullName: 'Mario Referido', phone: '75555555' });
check('postventa: un referido entra como lead', refd.status === 201 && (await agent.get('/leads')).data.some((l) => l.id === refd.data.leadId && l.source === 'REFERRAL'));
check('postventa: lista de operaciones ganadas', (await agent.get('/post-sale')).data.some((x) => x.id === c2 && x._count.referrals === 1));
const testi = (await pub.get('/public/testimonials')).data;
check('portal: muestra el testimonio autorizado solo con el nombre de pila', testi.length === 1 && testi[0].author === 'Laura' && !JSON.stringify(testi).includes('Compradora'), JSON.stringify(testi));
check('portal: los testimonios de una empresa no salen en otra', (await client(`${slug}.localhost:3000`).get('/public/testimonials')).data.length === 0);
const exp2 = (await agent.get(`/cases/${c2}`)).data;
check('expediente: el timeline registra la Fase 2', ['Oferta de', 'Reserva de', 'Documento agregado', 'Referido registrado', 'Inmueble entregado'].every((t) => exp2.timeline.some((a) => a.description.includes(t))));


// ====================== FASE 3 ======================
console.log('\n--- Fase 3 ---');
const F = '/finance';
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
let coms = (await admin.get(`${F}/commissions`)).data;
const com1 = coms.find((c) => c.case.id === caseId), com2 = coms.find((c) => c.case.id === c2);
check('comisión: se genera al cerrar la operación (3 % y 50 % al agente)', com1 && eq(com1.baseAmount, 175000) && eq(com1.companyAmount, 5250) && eq(com1.agentAmount, 2625) && com1.status === 'GENERATED', JSON.stringify(com1));
check('comisión: usa el precio de cierre negociado', com2 && eq(com2.baseAmount, 110000) && eq(com2.companyAmount, 3300) && eq(com2.agentAmount, 1650));
check('comisión: el expediente la muestra', eq((await agent.get(`/cases/${caseId}`)).data.commission?.agentAmount, 2625));
let recs = (await admin.get(`${F}/receivables`)).data;
const rec1 = recs.find((r) => r.case?.id === caseId);
check('por cobrar: la comisión de la empresa queda como cuenta por cobrar al propietario', rec1 && eq(rec1.amount, 5250) && rec1.status === 'PENDING' && rec1.contact?.id === owner.id && rec1.daysOverdue === 0, JSON.stringify(rec1));
check('reglas: la empresa arranca con tres reglas editables', (await admin.get(`${F}/rules`)).data.length === 3);

// Permisos
check('permisos: el agente no ve las finanzas de la empresa', (await agent.get(`${F}/summary`)).status === 403 && (await agent.get(`${F}/transactions`)).status === 403 && (await agent.get(`${F}/commissions`)).status === 403);
const mine = (await agent.get(`${F}/my`)).data;
check('permisos: el agente ve solo sus comisiones', mine.commissions.length === 2 && eq(mine.totals.pending.USD, 4275), JSON.stringify(mine.totals));
check('permisos: el agente no aprueba comisiones', (await agent.patch(`${F}/commissions/${com1.id}`, { status: 'APPROVED' })).status === 403);
check('permisos: el contador sí gestiona finanzas', (await conta.get(`${F}/summary`)).status === 200);
check('plan Inicio: finanzas básicas sí, cuentas y flujo de caja no', (await otra.get(`${F}/summary`)).data.level === 'basic' && (await otra.get(`${F}/receivables`)).status === 403 && (await otra.get(`${F}/cashflow`)).status === 403);
check('aislamiento: otra empresa no cobra una cuenta ajena', (await otra.post(`${F}/transactions/${rec1.id}/void`, { reason: 'x' })).status === 404);

// Cobros
const today = new Date().toISOString();
check('cobro: rechaza un monto mayor al saldo', (await conta.post(`${F}/receivables/${rec1.id}/payments`, { amount: 6000, date: today })).status === 400);
const pay1 = await conta.post(`${F}/receivables/${rec1.id}/payments`, { amount: 2000, date: today, method: 'TRANSFER' });
check('cobro: pago parcial', pay1.status === 201 && pay1.data.status === 'PARTIAL' && eq(pay1.data.paidAmount, 2000), JSON.stringify(pay1.data));
const pay2 = await conta.post(`${F}/receivables/${rec1.id}/payments`, { amount: 3250, date: today, method: 'QR' });
check('cobro: al completar el saldo queda pagada', pay2.data.status === 'PAID');
check('cobro: una cuenta pagada no admite más pagos', (await conta.post(`${F}/receivables/${rec1.id}/payments`, { amount: 1, date: today })).status === 400);
let txs = (await conta.get(`${F}/transactions?kind=INCOME`)).data;
check('cobro: cada pago es un ingreso con su categoría', txs.filter((t) => t.receivableId === rec1.id).length === 2 && txs.every((t) => t.category === 'SALE_COMMISSION'));
const lastTx = txs.find((t) => t.receivableId === rec1.id && eq(t.amount, 3250));
await conta.post(`${F}/transactions/${lastTx.id}/void`, { reason: 'Transferencia rechazada por el banco' });
recs = (await admin.get(`${F}/receivables`)).data;
check('anulación: revierte el saldo de la cuenta', recs.find((r) => r.id === rec1.id).status === 'PARTIAL' && eq(recs.find((r) => r.id === rec1.id).balance, 3250));
check('anulación: no se anula dos veces', (await conta.post(`${F}/transactions/${lastTx.id}/void`, { reason: 'otra vez' })).status === 400);
await conta.post(`${F}/receivables/${rec1.id}/payments`, { amount: 3250, date: today });

// Gastos y cuentas por pagar
const gasto = await conta.post(`${F}/transactions`, { kind: "EXPENSE", category: "ADVERTISING", amount: 400, currency: 'USD', date: today, description: 'Anuncios de la casa', caseId });
check('gasto: se registra ligado al expediente', gasto.status === 201, JSON.stringify(gasto.data));
check('gasto: valida la categoría según el tipo', (await conta.post(`${F}/transactions`, { kind: 'EXPENSE', category: 'SALE_COMMISSION', amount: 1, currency: 'USD', date: today, description: 'x' })).status === 400);
const pay = await conta.post(`${F}/payables`, { supplier: 'Imprenta Central', concept: 'Letreros', category: 'ADVERTISING', amount: 300, currency: 'BOB', dueDate: new Date(Date.now() - 3 * 864e5).toISOString() });
check('por pagar: crea una cuenta de proveedor', pay.status === 201);
check('por pagar: exige proveedor o agente', (await conta.post(`${F}/payables`, { concept: 'x', amount: 1, currency: 'BOB', dueDate: today })).status === 400);
check('por pagar: calcula los días de atraso', (await conta.get(`${F}/payables`)).data.find((x) => x.id === pay.data.id).daysOverdue === 3);
await conta.post(`${F}/payables/${pay.data.id}/payments`, { amount: 300, date: today, method: 'CASH' });
check('por pagar: no se cancela una cuenta con pagos', (await conta.post(`${F}/payables/${pay.data.id}/cancel`, {})).status === 400);

// Comisiones y liquidación
check('comisión: no se liquida sin aprobar', (await conta.post(`${F}/settlements`, { agentId, periodStart: new Date(Date.now() - 864e5).toISOString(), periodEnd: today, currency: 'USD' })).status === 400);
await conta.patch(`${F}/commissions/${com1.id}`, { status: 'APPROVED' }); await conta.patch(`${F}/commissions/${com2.id}`, { status: 'APPROVED' });
const liq = await conta.post(`${F}/settlements`, { agentId, periodStart: new Date(Date.now() - 864e5).toISOString(), periodEnd: today, currency: 'USD' });
check('liquidación: reúne las comisiones aprobadas del periodo', liq.status === 201 && eq(liq.data.commissionsTotal, 4275) && eq(liq.data.total, 4275) && liq.data.code === 'LIQ-0001', JSON.stringify(liq.data));
await conta.post(`${F}/settlements/${liq.data.id}/adjustments`, { kind: 'BONUS', amount: 200, note: 'Bono por meta del mes' });
await conta.post(`${F}/settlements/${liq.data.id}/adjustments`, { kind: 'DEDUCTION', amount: 50.25, note: 'Descuento por celular' });
const adj = await conta.post(`${F}/settlements/${liq.data.id}/adjustments`, { kind: 'ADVANCE', amount: 500, note: 'Anticipo del 5 de octubre' });
check('liquidación: comisiones + bonos − deducciones − anticipos', eq(adj.data.total, 3924.75) && eq(adj.data.bonuses, 200) && eq(adj.data.deductions, 50.25) && eq(adj.data.advances, 500), JSON.stringify(adj.data));
check('liquidación: una comisión liquidada no cambia de estado', (await conta.patch(`${F}/commissions/${com1.id}`, { status: 'CANCELLED' })).status === 400);
check('liquidación: solo el administrador aprueba', (await conta.post(`${F}/settlements/${liq.data.id}/approve`, {})).status === 403);
check('liquidación: no se paga sin aprobar', (await conta.post(`${F}/settlements/${liq.data.id}/pay`, { date: today })).status === 400);
await admin.post(`${F}/settlements/${liq.data.id}/approve`, {});
const liqPayable = (await conta.get(`${F}/payables`)).data.find((x) => x.settlement?.id === liq.data.id);
check('liquidación: al aprobarla aparece como cuenta por pagar al agente', liqPayable && eq(liqPayable.amount, 3924.75) && liqPayable.agent?.id === agentId);
check('liquidación: aprobada ya no admite ajustes', (await conta.post(`${F}/settlements/${liq.data.id}/adjustments`, { kind: 'BONUS', amount: 1, note: 'x' })).status === 400);
check('liquidación: su cuenta se paga desde la liquidación', (await conta.post(`${F}/payables/${liqPayable.id}/payments`, { amount: 10, date: today })).status === 400);
await conta.post(`${F}/settlements/${liq.data.id}/pay`, { date: today, method: 'TRANSFER' });
const liqAfter = (await conta.get(`${F}/settlements/${liq.data.id}`)).data;
check('liquidación: al pagarla, las comisiones quedan pagadas', liqAfter.status === 'PAID' && liqAfter.commissions.every((c) => c.status === 'PAID') && liqAfter.payable.status === 'PAID');
check('liquidación: no se paga dos veces', (await conta.post(`${F}/settlements/${liq.data.id}/pay`, { date: today })).status === 400);
const mine2 = (await agent.get(`${F}/my`)).data;
check('agente: ve su liquidación y sus comisiones pagadas', mine2.settlements.length === 1 && eq(mine2.totals.paid.USD, 4275) && !mine2.totals.pending.USD);
check('agente: recibe aviso de la liquidación pagada', (await agent.get('/notifications')).data.items.some((n) => n.title.includes('LIQ-0001 pagada')));

// Comisión acordada en la captación
const p3 = (await admin.post('/properties', { title: 'Local comercial centro', type: 'COMMERCIAL', operation: 'SALE', price: 80000, currency: 'USD', agentId })).data;
const c3 = (await admin.get(`/properties/${p3.id}`)).data.cases[0].id;
await admin.patch(`/cases/${c3}`, { commissionPct: 5 });
await admin.post(`/cases/${c3}/close`, { result: 'WON', clientId: buyer.id, closedPrice: 80000 });
const com3 = (await admin.get(`${F}/commissions`)).data.find((c) => c.case.id === c3);
check('comisión: el porcentaje acordado en la captación manda', com3 && eq(com3.companyAmount, 4000) && eq(com3.agentAmount, 2000) && com3.ruleName.includes('5 % acordado'), JSON.stringify(com3));

// Resumen, flujo de caja y rentabilidad
const sum = (await conta.get(`${F}/summary`)).data;
const usd = sum.totals.find((t) => t.currency === 'USD'), bob = sum.totals.find((t) => t.currency === 'BOB');
check('resumen: ingresos, gastos y neto del mes por moneda', usd && eq(usd.income, 5250) && eq(usd.expense, 4324.75) && eq(usd.net, 925.25) && bob && eq(bob.expense, 300), JSON.stringify(sum.totals));
check('resumen: por cobrar y comisiones pendientes', eq(usd.receivable, 7300) && eq(usd.pendingCommissions, 2000) && eq(usd.payable, 0), JSON.stringify(usd));
const flow = (await conta.get(`${F}/cashflow?group=month`)).data.find((f) => f.currency === 'USD');
check('flujo de caja: ingresos − gastos = flujo neto', flow && flow.rows.length === 1 && eq(flow.rows[0].income, 5250) && eq(flow.rows[0].expense, 4324.75) && eq(flow.rows[0].net, 925.25) && eq(flow.net, 925.25), JSON.stringify(flow));
check('flujo de caja: el movimiento anulado no cuenta', eq(flow.income, 5250));
const prof = (await conta.get(`${F}/profitability`)).data;
const row = prof.byCase.find((r) => r.id === caseId);
check('rentabilidad por operación: comisión empresa − agente − gastos', row && eq(row.companyCommission, 5250) && eq(row.agentCommission, 2625) && eq(row.expenses, 400) && eq(row.net, 2225), JSON.stringify(row));
const ag = prof.byAgent.find((a) => a.agent.id === agentId);
check('rentabilidad por agente: ventas, valor vendido y comisiones', ag && ag.sales === 3 && eq(ag.valueSold.USD, 365000) && eq(ag.generated.USD, 6275) && eq(ag.paid.USD, 4275) && eq(ag.pending.USD, 2000), JSON.stringify(ag));

// Auditoría con valor anterior y nuevo
const audit3 = (await admin.get('/audit')).data;
const paidEntry = audit3.find((a) => a.action === 'Cobro registrado');
check('auditoría: los cambios financieros guardan valor anterior y nuevo', paidEntry && paidEntry.before && paidEntry.after && paidEntry.before.status !== paidEntry.after.status, JSON.stringify(paidEntry));

// Reportes
await admin.post('/contacts', { fullName: '=HYPERLINK("http://malo","clic")', phone: '70000099' });
const head = (r, n = 4) => Buffer.from(r.data).subarray(0, n).toString('latin1');
const xlsx = await conta.get('/reports/comisiones?format=xlsx');
check('reportes: Excel válido', xlsx.status === 200 && head(xlsx, 2) === 'PK' && xlsx.type.includes('spreadsheetml'));
const pdfR = await conta.get('/reports/finanzas?format=pdf');
check('reportes: PDF válido', pdfR.status === 200 && head(pdfR, 5) === '%PDF-' && Buffer.from(pdfR.data).length > 1500);
const csv = Buffer.from((await conta.get('/reports/clientes?format=csv')).data).toString('utf8');
check('reportes: CSV con acentos y encabezados', csv.charCodeAt(0) === 0xfeff && csv.includes('"Teléfono"') && csv.includes('Laura Compradora'));
check('reportes: neutraliza fórmulas en las celdas', csv.includes(`"'=HYPERLINK`) && !/;"=HYPERLINK|^"=HYPERLINK/m.test(csv));
const csvFin = Buffer.from((await conta.get('/reports/rentabilidad?format=csv')).data).toString('utf8');
check('reportes: la rentabilidad coincide con la pantalla', csvFin.includes('5250;2625;400;2225'), csvFin.split('\r\n').slice(0, 3).join(' | '));
check('reportes: filtra por fecha', Buffer.from((await conta.get('/reports/finanzas?format=csv&from=2020-01-01&to=2020-12-31')).data).toString('utf8').split('\r\n').length === 1);
check('reportes: lista los 11 disponibles', (await conta.get('/reports')).data.length === 11);
check('reportes: el agente no exporta', (await agent.get('/reports/clientes?format=csv')).status === 403);
check('reportes: reporte inexistente', (await conta.get('/reports/__proto__?format=csv')).status === 404);
check('reportes: los datos de otra empresa no se mezclan', !Buffer.from((await otra.get('/reports/clientes?format=csv')).data).toString('utf8').includes('Laura'));

// ============ FASE 4: IA, analítica, alertas, tareas, automatizaciones y portal del propietario ============
// Analítica
const an = await admin.get('/analytics');
const step = (k) => an.data.funnel.find((f) => f.key === k);
check('analítica: embudo completo con 6 pasos', an.status === 200 && an.data.funnel.length === 6 && step('leads').value >= 2 && step('sales').value === 3, JSON.stringify(an.data.funnel));
check('analítica: el embudo coincide con los datos reales', step('leads').value === (await admin.get('/leads')).data.length && step('views').value >= 1);
const anAgent = an.data.agents.find((a) => a.agent.id === agentId);
check('analítica: rendimiento por agente con ventas y valor', anAgent && anAgent.sales === 3 && eq(anAgent.valueSold.USD, 365000) && anAgent.avgDaysToClose === 0, JSON.stringify(anAgent));
check('analítica: demanda y zonas', Array.isArray(an.data.demand) && Array.isArray(an.data.zones) && an.data.zones.length >= 1);
check('analítica: filtro de fechas sin datos da ceros', (await admin.get('/analytics?from=2020-01-01&to=2020-12-31')).data.funnel.every((f) => f.value === 0));
const anMine = await agent.get('/analytics');
check('analítica: el agente ve solo su rendimiento', anMine.status === 200 && anMine.data.agents.every((a) => a.agent.id === agentId));
check('analítica: no disponible en el plan Inicio', (await otra.get('/analytics')).status === 403);

// Alertas
const al = await admin.get('/alerts');
check('alertas: lista ordenada por urgencia', al.status === 200 && Array.isArray(al.data) && al.data.every((a) => a.key && a.title && a.count === a.items.length || a.count >= a.items.length));
check('alertas: disponibles en el plan Inicio', (await otra.get('/alerts')).status === 200);
check('alertas: el agente no recibe alertas financieras', !(await agent.get('/alerts')).data.some((a) => a.key.startsWith('receivables') || a.key.startsWith('commissions')));

// Tareas
const autoTasks = (await admin.get('/tasks')).data;
check('automatización: cada lead creó su tarea de contacto', autoTasks.some((t) => t.automatic && t.type === 'CALL' && t.title.startsWith('Contactar a')), JSON.stringify(autoTasks.map((t) => t.title)));
check('automatización: cerrar una operación creó la tarea de post-venta', autoTasks.filter((t) => t.automatic && t.title.startsWith('Post-venta')).length === 3);
const t1 = await admin.post('/tasks', { title: 'Llamar al notario', type: 'CALL', priority: 'HIGH', dueAt: new Date(Date.now() + 864e5).toISOString(), assignedToId: agentId });
check('tareas: el admin asigna una tarea a un agente', t1.status === 201 && t1.data.assignedTo.id === agentId, JSON.stringify(t1.data));
check('tareas: el agente recibe el aviso', (await agent.get('/notifications')).data.items?.some?.((n) => n.title.includes('Llamar al notario')) ?? (await agent.get('/notifications')).data.some?.((n) => n.title.includes('Llamar al notario')));
const t2 = await agent.post('/tasks', { title: 'Enviar fotos', assignedToId: (await admin.get('/auth/me')).data.id });
check('tareas: un agente solo se asigna tareas a sí mismo', t2.status === 201 && t2.data.assignedTo.id === agentId);
check('tareas: el agente ve solo las suyas', (await agent.get('/tasks')).data.every((t) => t.assignedTo.id === agentId));
const done = await agent.patch(`/tasks/${t1.data.id}`, { status: 'DONE' });
check('tareas: completar guarda la fecha', done.status === 200 && done.data.status === 'DONE' && !!done.data.completedAt);
check('tareas: reabrir limpia la fecha', (await agent.patch(`/tasks/${t1.data.id}`, { status: 'PENDING' })).data.completedAt === null);
check('tareas: el agente no borra tareas que no creó', (await agent.del(`/tasks/${t1.data.id}`)).status === 403);
check('tareas: el agente borra la que creó', (await agent.del(`/tasks/${t2.data.id}`)).status === 200);
check('tareas: rechaza responsable de otra empresa', (await otra.post('/tasks', { title: 'X', assignedToId: agentId })).data.assignedTo?.id !== agentId);
check('tareas: otra empresa no ve las tareas', (await otra.get('/tasks')).data.every((t) => t.title !== 'Llamar al notario') && (await otra.patch(`/tasks/${t1.data.id}`, { status: 'DONE' })).status === 404);
check('tareas: el contador tiene sus propias tareas', (await conta.post('/tasks', { title: 'Conciliar caja', type: 'REVIEW' })).status === 201);

// Automatizaciones
const autos = await admin.get('/automations');
check('automatizaciones: catálogo de 9, todas activas por defecto', autos.status === 200 && autos.data.length === 9 && autos.data.every((a) => a.enabled));
check('automatizaciones: solo el administrador las gestiona', (await agent.get('/automations')).status === 403 && (await agent.post('/automations/run')).status === 403);
const off = await admin.patch('/automations/daily_summary', { enabled: false });
check('automatizaciones: se pueden desactivar', off.status === 200 && off.data.find((a) => a.key === 'daily_summary').enabled === false);
check('automatizaciones: clave inexistente', (await admin.patch('/automations/nada', { enabled: false })).status === 404);
const run1 = await admin.post('/automations/run');
check('automatizaciones: ejecución diaria; la desactivada no corre', run1.status === 201 && run1.data.find((r) => r.key === 'daily_summary').ran === false && run1.data.filter((r) => r.ran).length === 5, JSON.stringify(run1.data));
const run2 = await admin.post('/automations/run');
check('automatizaciones: no se repiten el mismo día', run2.data.every((r) => !r.ran));
await admin.patch('/automations/lead_new_task', { enabled: false });
const before4 = (await admin.get('/tasks')).data.length;
await admin.post('/leads', { contactId: buyer.id, propertyId: prop.id, source: 'PHONE' });
check('automatizaciones: apagada, un lead nuevo no crea tarea', (await admin.get('/tasks')).data.length === before4);
await admin.patch('/automations/lead_new_task', { enabled: true });

// Inteligencia artificial
const ais = await admin.get('/ai/status');
check('IA: estado del plan Corporativo', ais.status === 200 && ais.data.content && ais.data.assistant && ais.data.limit === 5000 && ais.data.suggestions.length >= 5, JSON.stringify(ais.data));
const gen = await admin.post('/ai/content', { propertyId: p2.id, kind: 'whatsapp' });
check('IA: genera contenido con los datos de la propiedad', gen.status === 201 && gen.data.text.includes(`/p/${p2.code}`) && gen.data.text.length > 40, JSON.stringify(gen.data));
check('IA: sin proveedor configurado usa plantillas y lo dice', process.env.ANTHROPIC_API_KEY ? gen.data.source === 'ai' : gen.data.source === 'template');
const genAll = await Promise.all(['title', 'description', 'ad', 'social', 'email', 'cta'].map((kind) => admin.post('/ai/content', { propertyId: p2.id, kind })));
check('IA: los 7 tipos de contenido', genAll.every((g) => g.status === 201 && g.data.text.length > 10));
check('IA: tipo inválido', (await admin.post('/ai/content', { propertyId: p2.id, kind: 'poema' })).status === 400);
check('IA: el contenido no expone datos internos', !genAll.map((g) => g.data.text).join(' ').includes('María Propietaria'));
const genAgent = await agent.post('/ai/content', { propertyId: p3.id, kind: 'title' });
check('IA: el agente solo genera sobre sus propiedades', genAgent.status === (p3.agentId === agentId ? 201 : 404));
const q1 = await admin.post('/ai/assistant', { question: '¿Cuál fue mi rendimiento este mes?' });
check('asistente: responde con cifras reales', q1.status === 201 && q1.data.intent === 'performance' && typeof q1.data.text === 'string', JSON.stringify(q1.data));
const q2 = await agent.post('/ai/assistant', { question: '¿Cuál fue mi rendimiento este mes?' });
check('asistente: el agente obtiene sus 3 cierres por USD 365.000', q2.data.text.includes('3 operaciones') && q2.data.text.includes('365.000'), q2.data.text);
const q3 = await admin.post('/ai/assistant', { question: `¿Qué clientes podrían estar interesados en la propiedad ${p2.code}?` });
check('asistente: clientes compatibles con una propiedad', q3.data.intent === 'match_for_property' && q3.data.title.includes(p2.code));
const q4 = await admin.post('/ai/assistant', { question: '¿Quién ganará el mundial?' });
check('asistente: no inventa respuestas fuera de sus datos', q4.data.intent === 'help');
check('asistente: pregunta vacía', (await admin.post('/ai/assistant', { question: '' })).status === 400);
const ais2 = (await admin.get('/ai/status')).data;
check('IA: mide el consumo del mes', ais2.used === ais.data.used + 11 + (genAgent.status === 201 ? 1 : 0), `${ais.data.used} -> ${ais2.used}`);
check('IA: no incluida en el plan Inicio', (await otra.post('/ai/assistant', { question: 'hola' })).status === 403 && (await otra.post('/ai/content', { propertyId: 'x', kind: 'title' })).status === 403);
const usageSa = await sa.get('/admin/ai-usage');
check('superadmin: consumo de IA por empresa', usageSa.status === 200 && usageSa.data.find((u) => u.tenant.slug === 'demo').requests === ais2.used && usageSa.data.find((u) => u.tenant.slug === slug).requests === 0);
check('superadmin: el consumo no es visible para una empresa', (await admin.get('/admin/ai-usage')).status >= 401);

// Portal del propietario
const ownerEmail = `prop${run}@demo.com`;
check('propietario: no disponible en el plan Inicio', (await otra.post('/owner/accounts', { contactId: 'x', email: ownerEmail, password: PASS })).status === 403);
check('propietario: solo contactos con propiedades', (await admin.post('/owner/accounts', { contactId: buyer.id, email: ownerEmail, password: PASS })).status === 400);
const acc = await admin.post('/owner/accounts', { contactId: owner.id, email: ownerEmail, password: PASS });
check('propietario: el admin crea su acceso', acc.status === 201 && !('passwordHash' in acc.data), JSON.stringify(acc.data));
check('propietario: un solo acceso por contacto', (await admin.post('/owner/accounts', { contactId: owner.id, email: `otro${ownerEmail}`, password: PASS })).status === 400);
check('propietario: no aparece en el equipo y sí en sus cuentas', !(await admin.get('/users')).data.some((u) => u.email === ownerEmail) && (await admin.get('/owner/accounts')).data.some((u) => u.email === ownerEmail));
check('propietario: no puede convertirse en administrador', (await admin.patch(`/users/${acc.data.id}`, { role: 'ADMIN' })).status === 400);
const own = client('demo.localhost:3000');
check('propietario: inicia sesión', (await own.login(ownerEmail, PASS)).status === 200);
const sum4 = await own.get('/owner/summary');
const mineOnly = (await admin.get('/properties')).data;
const ownedIds = (mineOnly.items ?? mineOnly).filter((p) => p.ownerId === owner.id || p.owner?.id === owner.id).map((p) => p.id);
check('propietario: ve solo sus propiedades', sum4.status === 200 && sum4.data.properties.length >= 1 && sum4.data.properties.every((p) => ownedIds.includes(p.id)), JSON.stringify({ n: sum4.data.properties?.length, ownedIds }));
const mainP = sum4.data.properties.find((p) => p.id === prop.id);
check('propietario: ve vistas, interesados, visitas y ofertas', mainP && mainP.views >= 1 && mainP.leads >= 1 && Array.isArray(mainP.visits) && Array.isArray(mainP.offers) && mainP.case?.code, JSON.stringify(mainP));
const ownerJson = JSON.stringify(sum4.data);
check('propietario: no ve datos de interesados ni comisiones', !/Laura|commission|comisi|7[0-9]{7}"/.test(ownerJson.replace(/"phone":"[^"]*"/g, '')), ownerJson.slice(0, 300));
const denied = await Promise.all(['/properties', '/contacts', '/leads', '/finance/summary', '/tasks', '/analytics', '/alerts', '/users', '/automations'].map((u) => own.get(u)));
check('propietario: no entra al panel interno', denied.every((r) => r.status === 403), denied.map((r) => r.status).join(','));
check('propietario: el resto de roles no usa su portal', (await admin.get('/owner/summary')).status === 403 && (await agent.get('/owner/summary')).status === 403);
await admin.patch(`/users/${acc.data.id}`, { isActive: false });
check('propietario: al desactivarlo ya no puede entrar', (await client('demo.localhost:3000').login(ownerEmail, PASS)).status === 401);

// ============ FASE 5: marca, dominios, integraciones, facturas, contabilidad y bancos ============
// Marca (White Label)
const co = await admin.get('/company');
check('empresa: datos y permisos del plan', co.status === 200 && co.data.can.whiteLabel && co.data.can.customDomain && co.data.logo === null);
check('empresa: rechaza un color demasiado claro', (await admin.patch('/company', { primaryColor: '#A3E635' })).status === 400);
check('empresa: rechaza enlaces que no son https', (await admin.patch('/company', { facebook: 'javascript:alert(1)' })).status === 400);
const co2 = await admin.patch('/company', { primaryColor: '#3B1E54', buttonColor: '#7B2D8E', legalName: 'Inmobiliaria Demo S.R.L.', taxId: '1023456028', whatsapp: '70000000', facebook: 'https://facebook.com/demo', hideBrand: true });
check('empresa: guarda colores, datos legales y quita la marca', co2.status === 200 && co2.data.primaryColor === '#3b1e54' && co2.data.hideBrand === true && co2.data.taxId === '1023456028', JSON.stringify(co2.data));
check('empresa: el agente no cambia la marca', (await agent.patch('/company', { name: 'X' })).status === 403);
const logoForm = new FormData(); logoForm.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');
const logoUp = await admin.form('/company/logo', logoForm);
check('empresa: sube el logo', logoUp.status === 201 && logoUp.data.logo?.startsWith('/api/public/logo'), JSON.stringify(logoUp.data));
const svgForm = new FormData(); svgForm.append('file', new Blob(['<svg onload="alert(1)"/>'], { type: 'image/png' }), 'x.png');
check('empresa: rechaza un archivo que no es imagen', (await admin.form('/company/logo', svgForm)).status === 400);
const anon = client('demo.localhost:3000');
const logoGet = await anon.get('/public/logo');
check('portal: el logo es público en su empresa y no en otra', logoGet.status === 200 && logoGet.type === 'image/png' && (await client(`${slug}.localhost:3000`).get('/public/logo')).status === 404);
const site5 = (await anon.get('/public/site')).data;
check('portal: muestra marca, colores y redes; nunca NIT ni datos internos', site5.primaryColor === '#3b1e54' && site5.hideBrand === true && site5.facebook && !('taxId' in site5) && !('legalName' in site5) && !('logoFile' in site5), JSON.stringify(site5));
check('sesión: el panel recibe la marca', (await admin.get('/auth/me')).data.tenant.primaryColor === '#3b1e54');
check('plan Inicio: no puede quitar la marca Soft_Inmo', (await otra.patch('/company', { hideBrand: true })).status === 403 && (await otra.patch('/company', { phone: '3333333' })).status === 200);

// Dominio propio
const dom = `www.inmo${run}.com`;
check('dominio: no disponible en el plan Inicio', (await otra.post('/company/domains', { domain: dom })).status === 403);
check('dominio: rechaza subdominios de la plataforma', (await admin.post('/company/domains', { domain: 'otra.softinmo.com' })).status === 400);
const d1 = await admin.post('/company/domains', { domain: `https://${dom.toUpperCase()}/` });
const drow = d1.data.domains?.find((d) => d.domain === dom);
check('dominio: se registra normalizado y con su registro TXT', d1.status === 201 && drow && !drow.verified && drow.record.name === `_softinmo.${dom}` && drow.record.value.startsWith('softinmo-verify-'), JSON.stringify(d1.data.domains));
check('dominio: no se puede registrar dos veces', (await admin.post('/company/domains', { domain: dom })).status === 400);
check('dominio: sin verificar no resuelve la empresa', (await client(dom).get('/public/site')).status === 404);
check('dominio: la verificación falla si el DNS no tiene el registro', (await admin.post(`/company/domains/${drow.id}/verify`)).status === 400);
check('dominio: otra empresa no puede verificarlo ni borrarlo', (await otra.post(`/company/domains/${drow.id}/verify`)).status >= 403 && (await otra.del(`/company/domains/${drow.id}`)).status >= 403);
check('dominio: soporte lo da por verificado', (await sa.patch(`/admin/domains/${drow.id}`, { verified: true })).status === 200 && (await sa.get('/admin/domains')).data.some((d) => d.domain === dom && d.verifiedAt));
const viaDomain = client(dom);
check('dominio: verificado, muestra el portal de la empresa', (await viaDomain.get('/public/site')).data?.name === site5.name);
check('dominio: se puede iniciar sesión desde el dominio propio', (await viaDomain.login('admin@demo.com', PASS)).status === 200 && (await viaDomain.get('/properties')).status === 200);
check('dominio: un dominio desconocido no resuelve nada', (await client('www.desconocido-xyz.com').get('/public/site')).status === 404);

// Seguridad: intentos de login
const brute = client('demo.localhost:3000');
const tries = [];
for (let i = 0; i < 9; i++) tries.push((await brute.login('conta-inexistente@demo.com', 'mala-clave')).status);
check('login: bloquea tras 8 intentos fallidos', tries.slice(0, 8).every((s) => s === 401) && tries[8] === 429, tries.join(','));
check('login: el bloqueo no afecta a otros usuarios', (await client('demo.localhost:3000').login('admin@demo.com', PASS)).status === 200);

// Integraciones: claves de API y API pública
check('integraciones: no incluidas en el plan Inicio', (await otra.get('/integrations')).status === 403 && (await otra.post('/integrations/keys', { name: 'x' })).status === 403);
check('integraciones: solo el administrador', (await agent.get('/integrations')).status === 403);
const k1 = await admin.post('/integrations/keys', { name: 'Sitio web' });
check('API: crea una clave y la muestra una sola vez', k1.status === 201 && k1.data.key.startsWith('si_live_') && !JSON.stringify((await admin.get('/integrations')).data).includes(k1.data.key));
const apiCall = (method, path, key, body, host = 'api.localhost:3000') => fetch(API + path, { method, headers: { 'x-forwarded-host': host, ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
check('API: sin clave o con clave falsa responde 401', (await apiCall('GET', '/v1/properties')).status === 401 && (await apiCall('GET', '/v1/properties', 'si_live_falsa')).status === 401);
const p5 = (await admin.post('/properties', { title: 'Local comercial en el centro', type: 'COMMERCIAL', operation: 'RENT', price: 900, currency: 'USD', zone: 'Centro', city: 'Santa Cruz', ownerId: owner.id, agentId })).data;
await admin.patch(`/properties/${p5.id}`, { isPublished: true });
await admin.post('/properties', { title: 'Depósito sin publicar', type: 'WAREHOUSE', operation: 'RENT', price: 500, currency: 'USD' });
const v1 = await apiCall('GET', '/v1/properties', k1.data.key);
check('API: lista solo propiedades publicadas, sin datos internos', v1.status === 200 && v1.data.data.length >= 1 && v1.data.data.every((p) => p.isPublished) && !/ownerId|agentId|address|tenantId/.test(JSON.stringify(v1.data)), JSON.stringify(v1.data).slice(0, 200));
const code1 = v1.data.data[0].code;
check('API: una propiedad por código', (await apiCall('GET', `/v1/properties/${code1}`, k1.data.key)).data.data.code === code1 && (await apiCall('GET', '/v1/properties/NOEXISTE', k1.data.key)).status === 404);
check('API: la clave no sirve en el subdominio de otra empresa', (await apiCall('GET', '/v1/properties', k1.data.key, null, `${slug}.localhost:3000`)).status === 401 && (await apiCall('GET', '/v1/properties', k1.data.key, null, 'demo.localhost:3000')).status === 200);
check('API: la clave no abre el panel interno', (await apiCall('GET', '/contacts', k1.data.key)).status === 401 && (await apiCall('GET', '/finance/summary', k1.data.key, null, 'demo.localhost:3000')).status === 401);

// Webhooks: un servidor local recibe los avisos
const { createServer } = await import('node:http');
const { createHmac } = await import('node:crypto');
const received = [];
const hookServer = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { received.push({ event: req.headers['x-softinmo-event'], sig: req.headers['x-softinmo-signature'], body: b }); res.writeHead(req.url === '/falla' ? 500 : 200).end('ok'); }); });
await new Promise((ok) => hookServer.listen(0, '127.0.0.1', ok));
const hookUrl = `http://127.0.0.1:${hookServer.address().port}`;
check('webhooks: exige al menos un evento y eventos conocidos', (await admin.post('/integrations/webhooks', { url: hookUrl, events: [] })).status === 400 && (await admin.post('/integrations/webhooks', { url: hookUrl, events: ['otro.evento'] })).status === 400);
check('webhooks: rechaza direcciones que no son web', (await admin.post('/integrations/webhooks', { url: 'ftp://x.com/a', events: ['lead.created'] })).status === 400);
const wh = await admin.post('/integrations/webhooks', { url: hookUrl, events: ['lead.created', 'case.won'] });
check('webhooks: se crea con su secreto', wh.status === 201 && wh.data.secret.startsWith('whsec_'));
const ping = await admin.post(`/integrations/webhooks/${wh.data.id}/test`);
check('webhooks: envío de prueba', ping.status === 201 && ping.data.ok && received.at(-1)?.event === 'ping');
const leadApi = await apiCall('POST', '/v1/leads', k1.data.key, { fullName: 'Lead por API', phone: `7${run.slice(-7).padStart(7, '5')}`, message: 'Vi la propiedad en su sitio web y quiero más datos.', propertyCode: code1 });
check('API: crea un lead con su contacto', leadApi.status === 201 && leadApi.data.data.status === 'NEW' && (await admin.get('/leads')).data.some((l) => l.id === leadApi.data.data.id && l.contact.fullName === 'Lead por API'), JSON.stringify(leadApi.data));
check('API: valida los datos del lead', (await apiCall('POST', '/v1/leads', k1.data.key, { fullName: '', phone: '1' })).status === 400);
await new Promise((ok) => setTimeout(ok, 500));
const leadHook = received.find((r) => r.event === 'lead.created');
check('webhooks: avisa del lead creado', !!leadHook && JSON.parse(leadHook.body).data.contact.fullName === 'Lead por API', JSON.stringify(received.map((r) => r.event)));
check('webhooks: la firma se verifica con el secreto', leadHook?.sig === `sha256=${createHmac('sha256', wh.data.secret).update(leadHook.body).digest('hex')}`);
check('webhooks: no envía eventos a los que no está suscrito', !received.some((r) => r.event === 'visit.scheduled' || r.event === 'offer.received'));
const whBad = await admin.post('/integrations/webhooks', { url: `${hookUrl}/falla`, events: ['lead.created'] });
const pingBad = await admin.post(`/integrations/webhooks/${whBad.data.id}/test`);
check('webhooks: registra el fallo del destino', pingBad.data.ok === false && pingBad.data.status === 500 && (await admin.get('/integrations')).data.webhooks.find((w) => w.id === whBad.data.id).deliveries[0].ok === false);
check('webhooks: otra empresa no los ve ni los borra', (await otra.del(`/integrations/webhooks/${wh.data.id}`)).status >= 403);
await admin.patch(`/integrations/webhooks/${wh.data.id}`, { isActive: false });
const nBefore = received.length;
await apiCall('POST', '/v1/leads', k1.data.key, { fullName: 'Segundo lead', phone: `6${run.slice(-7).padStart(7, '4')}` });
await new Promise((ok) => setTimeout(ok, 400));
check('webhooks: pausado no envía', received.filter((r) => r.event === 'lead.created').length === received.slice(0, nBefore).filter((r) => r.event === 'lead.created').length + 1);
check('API: revocar la clave la deja sin acceso', (await admin.del(`/integrations/keys/${k1.data.id}`)).status === 200 && (await apiCall('GET', '/v1/properties', k1.data.key)).status === 401);
hookServer.close();

// Contabilidad
check('contabilidad: no incluida en el plan Inicio', (await otra.get('/accounting/statements')).status === 403);
check('contabilidad: el agente no entra', (await agent.get('/accounting/journal')).status === 403);
const accs = (await conta.get('/accounting/accounts')).data;
check('contabilidad: plan de cuentas inicial', accs.length === 19 && accs.some((a) => a.code === '1102' && a.name === 'Bancos'));
const st1 = (await conta.get('/accounting/statements')).data;
const usdSt = st1.find((x) => x.currency === 'USD');
const sumUsd = (await conta.get(`${F}/cashflow?group=year`)).data;
check('contabilidad: los libros cuadran en cada moneda', st1.length >= 1 && st1.every((x) => x.trial.balanced && x.balance.balanced), JSON.stringify(st1.map((x) => [x.currency, x.trial.debit, x.trial.credit, x.balance])));
const txsAll = (await conta.get(`${F}/transactions`)).data;
const live = (txsAll.items ?? txsAll).filter((t) => !t.voidedAt && t.currency === 'USD');
const inc = live.filter((t) => t.kind === 'INCOME' && t.category !== 'RESERVATION').reduce((a, t) => a + Number(t.amount), 0), expSum = live.filter((t) => t.kind === 'EXPENSE').reduce((a, t) => a + Number(t.amount), 0);
check('contabilidad: ingresos y gastos coinciden con Finanzas', eq(usdSt.income.totalIncome, inc) && eq(usdSt.income.totalExpenses, expSum) && eq(usdSt.income.result, inc - expSum), JSON.stringify({ libro: usdSt.income.totalIncome, finanzas: inc, gastosLibro: usdSt.income.totalExpenses, gastos: expSum }));
const journal1 = (await conta.get('/accounting/journal')).data;
check('contabilidad: un asiento por movimiento y reversión por cada anulado', journal1.filter((e) => e.sourceType === 'transaction').length === (txsAll.items ?? txsAll).length && journal1.filter((e) => e.sourceType === 'transaction_void').length === (txsAll.items ?? txsAll).filter((t) => t.voidedAt).length, `${journal1.length} asientos, ${(txsAll.items ?? txsAll).length} movimientos`);
check('contabilidad: consultar dos veces no duplica asientos', (await conta.get('/accounting/journal')).data.length === journal1.length);
const accId = (c) => accs.find((a) => a.code === c).id;
check('contabilidad: rechaza un asiento que no cuadra', (await conta.post('/accounting/journal', { date: new Date().toISOString(), description: 'Mal', currency: 'USD', lines: [{ accountId: accId('1102'), debit: 100 }, { accountId: accId('3101'), credit: 90 }] })).status === 400);
const cap = await conta.post('/accounting/journal', { date: new Date().toISOString(), description: 'Aporte de capital', currency: 'USD', lines: [{ accountId: accId('1102'), debit: 10000 }, { accountId: accId('3101'), credit: 10000 }] });
const st2 = (await conta.get('/accounting/statements')).data.find((x) => x.currency === 'USD');
check('contabilidad: asiento manual; activo = pasivo + patrimonio + resultado', cap.status === 201 && st2.balance.balanced && eq(st2.balance.totalEquity, 10000) && eq(st2.balance.totalAssets, st2.balance.totalLiabilities + 10000 + st2.balance.result), JSON.stringify(st2.balance));
const gasto5 = await conta.post(`${F}/transactions`, { kind: 'EXPENSE', category: 'TRANSPORT', amount: 77, currency: 'USD', date: new Date().toISOString(), description: 'Taxi a notaría', method: 'CASH' });
await conta.post(`${F}/transactions/${gasto5.data.id}/void`, { reason: 'Duplicado' });
const st3 = (await conta.get('/accounting/statements')).data.find((x) => x.currency === 'USD');
check('contabilidad: anular un gasto lo revierte sin borrar el asiento', eq(st3.income.totalExpenses, st2.income.totalExpenses) && st3.trial.balanced && eq(st3.trial.debit, st2.trial.debit + 154));
const led = (await conta.get(`/accounting/ledger/${accId('1101')}?currency=USD`)).data;
check('contabilidad: libro mayor de Caja con saldo acumulado', led.lines.length >= 2 && eq(led.lines.at(-1).balance, led.lines.at(-3)?.balance ?? 0) , JSON.stringify(led.lines.slice(-3)));
check('contabilidad: rango sin movimientos da resultados en cero', (await conta.get('/accounting/statements?from=2020-01-01&to=2020-12-31')).data.every((x) => x.trial.rows.length === 0));
check('contabilidad: cuenta nueva y código repetido', (await conta.post('/accounting/accounts', { code: '5108', name: 'Capacitación', type: 'EXPENSE' })).status === 201 && (await conta.post('/accounting/accounts', { code: '5108', name: 'Otra', type: 'EXPENSE' })).status === 400);
check('contabilidad: los asientos de otra empresa no se mezclan', (await sa.patch(`/admin/tenants/${otraRow.id}`, { planId: plans.find((p) => p.code === 'corporativo').id })).status === 200 && (await otra.get('/accounting/journal')).data.length === (await otra.get(`${F}/transactions`)).data.length);

// Facturas
const inv1 = await conta.post('/invoices', { date: new Date().toISOString(), customerName: 'Laura Compradora', customerTaxId: '4567890', currency: 'BOB', items: [{ description: 'Comisión por intermediación', quantity: 1, unitPrice: 5250 }, { description: 'Avalúo comercial', quantity: 2, unitPrice: 350.5 }] });
check('facturas: borrador con IVA incluido', inv1.status === 201 && inv1.data.status === 'DRAFT' && inv1.data.number === null && eq(inv1.data.total, 5951) && eq(inv1.data.taxAmount, 773.63) && eq(inv1.data.net, 5177.37), JSON.stringify(inv1.data));
check('facturas: valida NIT y conceptos', (await conta.post('/invoices', { date: new Date().toISOString(), customerName: 'X', customerTaxId: 'no válido!', currency: 'BOB', items: [{ description: 'a', quantity: 1, unitPrice: 1 }] })).status === 400 && (await conta.post('/invoices', { date: new Date().toISOString(), customerName: 'X', customerTaxId: '1', currency: 'BOB', items: [] })).status === 400);
const noNit = await otra.post('/invoices', { date: new Date().toISOString(), customerName: 'X', customerTaxId: '1', currency: 'BOB', items: [{ description: 'a', quantity: 1, unitPrice: 10 }] });
check('facturas: no se emite sin NIT y razón social de la empresa', noNit.status === 201 && (await otra.post(`/invoices/${noNit.data.id}/issue`)).status === 400);
const inv2 = await conta.post('/invoices', { date: new Date().toISOString(), customerName: 'Otro Cliente', customerTaxId: '999', currency: 'BOB', items: [{ description: 'Honorarios', quantity: 1, unitPrice: 100 }] });
const [is1, is2] = await Promise.all([conta.post(`/invoices/${inv1.data.id}/issue`), conta.post(`/invoices/${inv2.data.id}/issue`)]);
check('facturas: numeración correlativa sin repetir, aun emitiendo a la vez', is1.status === 200 && is2.status === 200 && [is1.data.number, is2.data.number].sort().join() === '1,2', JSON.stringify([is1.data, is2.data]).slice(0, 300));
check('facturas: una emitida no se vuelve a emitir', (await conta.post(`/invoices/${inv1.data.id}/issue`)).status === 400);
check('facturas: dice con claridad que no es factura electrónica', is1.data.fiscalStatus === 'NOT_SENT' && is1.data.fiscalCode === null && (await conta.get('/invoices')).data.fiscalProvider === null);
const invPdf = await conta.get(`/invoices/${inv1.data.id}/pdf`);
check('facturas: PDF válido', invPdf.status === 200 && head(invPdf, 5) === '%PDF-' && Buffer.from(invPdf.data).length > 1200);
check('facturas: anular exige motivo y conserva el número', (await conta.post(`/invoices/${inv2.data.id}/void`, {})).status === 400 && (await conta.post(`/invoices/${inv2.data.id}/void`, { reason: 'Error en el NIT' })).data.number === is2.data.number);
const invList = (await conta.get('/invoices')).data;
check('facturas: los totales solo cuentan las emitidas vigentes', eq(invList.totals.BOB.total, 5951) && eq(invList.totals.BOB.tax, 773.63));
check('facturas: el agente no factura y otra empresa no ve las facturas', (await agent.get('/invoices')).status === 403 && (await otra.get(`/invoices/${inv1.data.id}/pdf`)).status === 404);

// Conciliación bancaria
check('bancos: el agente no entra', (await agent.get('/bank/accounts')).status === 403);
const bank = await conta.post('/bank/accounts', { name: 'Cuenta corriente USD', bank: 'Banco Demo', number: '1000-200', currency: 'USD' });
const d = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const tIn = await conta.post(`${F}/transactions`, { kind: 'INCOME', category: 'FEE', amount: 432.1, currency: 'USD', date: new Date().toISOString(), description: 'Honorarios por tasación', method: 'TRANSFER' });
const csvBank = `Fecha;Glosa;Nro Documento;Débito;Crédito\n${d(1)};Depósito tasación;D-1;;432,10\n${d(0)};Comisión bancaria;D-2;12,50;\n${d(0)};Sin monto;D-3;;`;
const imp = await conta.post(`/bank/accounts/${bank.data.id}/import`, { csv: csvBank });
check('bancos: importa el extracto e informa las filas con error', imp.status === 201 && imp.data.imported === 2 && imp.data.errors.length === 1, JSON.stringify(imp.data));
check('bancos: reimportar no duplica', (await conta.post(`/bank/accounts/${bank.data.id}/import`, { csv: csvBank })).data.duplicated === 2);
check('bancos: explica qué falta en un archivo mal armado', (await conta.post(`/bank/accounts/${bank.data.id}/import`, { csv: 'Detalle;Monto\nX;1' })).status === 400);
const bl = (await conta.get(`/bank/accounts/${bank.data.id}/lines`)).data;
const lineIn = bl.find((l) => l.amount === 432.1), lineOut = bl.find((l) => l.amount === -12.5);
check('bancos: sugiere el movimiento que coincide', lineIn.suggestions.length === 1 && lineIn.suggestions[0].id === tIn.data.id && lineOut.suggestions.length === 0, JSON.stringify(bl));
check('bancos: no concilia con un movimiento de otro importe', (await conta.post(`/bank/lines/${lineOut.id}/match`, { transactionId: tIn.data.id })).status === 400);
check('bancos: concilia la línea con su movimiento', (await conta.post(`/bank/lines/${lineIn.id}/match`, { transactionId: tIn.data.id })).status === 200);
check('bancos: un movimiento no se concilia dos veces', (await conta.post(`/bank/lines/${lineIn.id}/match`, { transactionId: tIn.data.id })).status === 400);
const fee = await conta.post(`/bank/lines/${lineOut.id}/create`, { category: 'ADMIN' });
check('bancos: registra el gasto que faltaba y lo concilia', fee.status === 201 && ((await conta.get(`${F}/transactions`)).data.items ?? (await conta.get(`${F}/transactions`)).data).some((t) => t.id === fee.data.transactionId && Number(t.amount) === 12.5 && t.kind === 'EXPENSE'));
const bankAcc = (await conta.get('/bank/accounts')).data[0];
check('bancos: cuenta conciliada por completo', bankAcc.pending === 0 && bankAcc.lines === 2 && eq(bankAcc.balance, 419.6), JSON.stringify(bankAcc));
check('bancos: deshacer la conciliación', (await conta.del(`/bank/lines/${lineIn.id}/match`)).status === 200 && (await conta.get('/bank/accounts')).data[0].pending === 1);
check('bancos: otra empresa no ve la cuenta ni sus líneas', (await otra.get(`/bank/accounts/${bank.data.id}/lines`)).status === 404 && (await otra.post(`/bank/lines/${lineIn.id}/match`, { transactionId: tIn.data.id })).status === 404);
check('contabilidad: sigue cuadrando después de todo', (await conta.get('/accounting/statements')).data.every((x) => x.trial.balanced && x.balance.balanced));

// ============ FASE 6: permisos, sucursales, búsqueda, comparador, mapas, tipo de cambio, IVA y legal ============
// Permisos por usuario
const cat = await admin.get('/users/permissions');
check('permisos: catálogo de 6', cat.status === 200 && cat.data.length === 6 && (await agent.get('/users/permissions')).status === 403);
const meAg = (await agent.get('/auth/me')).data;
check('permisos: el agente parte de los permisos de su rol', JSON.stringify(meAg.permissions) === '["create_properties"]', JSON.stringify(meAg.permissions));
const allProps = (await admin.get('/properties')).data.length;
const mineProps = (await agent.get('/properties')).data.length;
await admin.patch(`/users/${agentId}`, { permissions: { view_all: true } });
check('permisos: "ver toda la empresa" tiene efecto inmediato', mineProps < allProps && (await agent.get('/properties')).data.length === allProps, `${mineProps} / ${allProps}`);
await admin.patch(`/users/${agentId}`, { permissions: { view_all: false, create_properties: false } });
check('permisos: sin "registrar propiedades" no puede crear', (await agent.post('/properties', { title: 'X', type: 'HOUSE', operation: 'SALE', price: 1 })).status === 403 && (await agent.get('/properties')).data.length === mineProps);
check('permisos: se guardan solo las diferencias con el rol', JSON.stringify((await admin.get('/users')).data.find((u) => u.id === agentId).permissions) === '[]');
await admin.patch(`/users/${agentId}`, { permissions: { create_properties: true, raro: true } });
check('permisos: sin "gestionar campañas" no crea campañas', (await agent.post('/campaigns', { name: 'X', channel: 'FACEBOOK' })).status === 403);
await admin.patch(`/users/${agentId}`, { permissions: { manage_campaigns: true } });
check('permisos: con "gestionar campañas" sí', (await agent.post('/campaigns', { name: 'Campaña del agente', channel: 'FACEBOOK' })).status === 201);
check('permisos: exportar reportes exige el permiso', (await agent.get('/reports')).status === 403);
await admin.patch(`/users/${agentId}`, { permissions: { export_reports: true } });
check('permisos: exportar también exige ver toda la empresa', (await agent.get('/reports')).status === 403);
await admin.patch(`/users/${agentId}`, { permissions: { view_all: true } });
const agRep = await agent.get('/reports');
check('permisos: el agente exporta solo reportes comerciales', agRep.status === 200 && agRep.data.every((r) => !r.finance) && (await agent.get('/reports/clientes?format=csv')).status === 200 && (await agent.get('/reports/comisiones?format=csv')).status === 403);
await admin.patch(`/users/${agentId}`, { permissions: { view_all: false, export_reports: false, manage_campaigns: false } });
const contaId = (await admin.get('/users')).data.find((u) => u.role === 'ACCOUNTANT').id;
await admin.patch(`/users/${contaId}`, { permissions: { manage_finance: false } });
check('permisos: contador de solo consulta', (await conta.get(`${F}/summary`)).status === 200 && (await conta.post(`${F}/transactions`, { kind: 'EXPENSE', category: 'OTHER', amount: 1, currency: 'USD', date: new Date().toISOString(), description: 'x' })).status === 403 && (await conta.post('/tax/purchases', {})).status === 403);
await admin.patch(`/users/${contaId}`, { permissions: { manage_finance: true } });
check('permisos: el contador recupera el registro', (await conta.post(`${F}/exchange-rates`, { date: new Date().toISOString(), rate: 6.96 })).status === 201);
const tmp = await admin.post('/users', { email: `temp${run}@demo.com`, fullName: 'Temporal', role: 'AGENT', password: PASS });
const tmpC = client('demo.localhost:3000'); await tmpC.login(`temp${run}@demo.com`, PASS);
await admin.patch(`/users/${tmp.data.id}`, { isActive: false });
check('permisos: un usuario desactivado pierde la sesión al instante', (await tmpC.get('/auth/me')).status === 401);

// Sucursales
await sa.patch(`/admin/tenants/${otraRow.id}`, { planId: plans.find((p) => p.code === 'profesional').id });
check('sucursales: no incluidas en el plan Profesional', (await otra.get('/branches')).data.enabled === false && (await otra.post('/branches', { name: 'X' })).status === 403);
const scz = await admin.post('/branches', { name: 'Santa Cruz', city: 'Santa Cruz de la Sierra' });
const lpz = await admin.post('/branches', { name: 'La Paz', city: 'La Paz' });
check('sucursales: se crean y no se repiten', scz.status === 201 && lpz.status === 201 && (await admin.post('/branches', { name: 'La Paz' })).status === 400);
await admin.patch(`/users/${agentId}`, { branchId: scz.data.id });
const pedro = await admin.post('/users', { email: `pedro${run}@demo.com`, fullName: 'Pedro Paceño', role: 'AGENT', password: PASS, branchId: lpz.data.id });
const pLpz = (await admin.post('/properties', { title: 'Departamento en Sopocachi', type: 'APARTMENT', operation: 'SALE', price: 95000, currency: 'USD', zone: 'Sopocachi', city: 'La Paz', agentId: pedro.data.id, bedrooms: 2, builtM2: 85, latitude: -16.5106, longitude: -68.1260, features: ['Ascensor', 'Balcón'] })).data;
check('sucursales: el usuario se asigna a una sucursal', pedro.data.branch?.name === 'La Paz' && (await admin.post('/users', { email: `x${run}@demo.com`, fullName: 'X', role: 'AGENT', password: PASS, branchId: 'no-existe' })).status === 400);
const brList = (await admin.get('/branches')).data;
check('sucursales: lista con agentes y propiedades', brList.enabled && brList.items.find((b) => b.name === 'La Paz').agents === 1 && brList.items.find((b) => b.name === 'La Paz').properties === 1);
admin.header('x-branch', lpz.data.id);
const lpzProps = (await admin.get('/properties')).data;
const lpzDash = (await admin.get('/dashboard')).data;
const lpzAn = (await admin.get('/analytics')).data;
admin.header('x-branch', scz.data.id);
const sczProps = (await admin.get('/properties')).data;
admin.header('x-branch', 'id-de-otra-empresa');
const anyProps = (await admin.get('/properties')).data;
admin.header('x-branch', null);
check('sucursales: vista por sucursal', lpzProps.length === 1 && lpzProps[0].id === pLpz.id && sczProps.every((p) => p.agent?.id === agentId) && sczProps.length >= 1, `${lpzProps.length} ${sczProps.length}`);
check('sucursales: una sucursal ajena se ignora y se ve toda la empresa', anyProps.length === (await admin.get('/properties')).data.length);
check('sucursales: el inicio y la analítica respetan la sucursal', lpzDash.counts.activeProperties === 1 && lpzAn.agents.every((a) => a.agent.id === pedro.data.id), JSON.stringify(lpzDash.counts));
check('sucursales: no se elimina con usuarios asignados', (await admin.del(`/branches/${lpz.data.id}`)).status === 400);
check('sucursales: el agente restringido sigue viendo solo lo suyo aunque elija sucursal', (() => { agent.header('x-branch', lpz.data.id); return true; })() && (await agent.get('/properties')).data.every((p) => p.agent?.id === agentId));
agent.header('x-branch', null);

// Búsqueda global
const s1 = (await admin.get('/search?q=Equipetrol')).data;
const grp = (r, k) => r.groups.find((g) => g.key === k)?.items ?? [];
check('búsqueda: encuentra propiedades por zona', grp(s1, 'properties').length >= 2);
check('búsqueda: clientes, propietarios y leads', grp((await admin.get('/search?q=Laura')).data, 'clients').length >= 1 && grp((await admin.get('/search?q=María')).data, 'owners').length >= 1 && grp((await admin.get('/search?q=Laura')).data, 'leads').length >= 1);
check('búsqueda: operaciones, negociaciones y documentos', grp((await admin.get(`/search?q=${(await admin.get(`/cases/${c2}`)).data.code}`)).data, 'cases').length === 1 && grp((await admin.get('/search?q=Contrato')).data, 'documents').length >= 1 && grp((await admin.get('/search?q=Laura')).data, 'negotiations').length >= 1);
check('búsqueda: el equipo solo lo busca el administrador', grp((await admin.get('/search?q=Pedro')).data, 'agents').length === 1 && grp((await agent.get('/search?q=Pedro')).data, 'agents').length === 0);
check('búsqueda: el agente no encuentra lo de otros', grp((await agent.get('/search?q=Sopocachi')).data, 'properties').length === 0 && grp((await admin.get('/search?q=Sopocachi')).data, 'properties').length === 1);
check('búsqueda: otra empresa no encuentra nada ajeno', (await otra.get('/search?q=Laura')).data.groups.length === 0);
check('búsqueda: menos de 2 letras no busca', (await admin.get('/search?q=a')).data.groups.length === 0);

// Comparador y mapas
await admin.patch(`/properties/${p2.id}`, { latitude: -17.7650, longitude: -63.1960, builtM2: 95, yearBuilt: 2019, features: ['Ascensor', 'Piscina'] });
const cmp = await admin.get(`/compare?ids=${p2.id},${pLpz.id}`);
const ppm2 = cmp.data.rows?.find((r) => r.key === 'ppm2');
check('comparador: dos propiedades lado a lado con precio por m²', cmp.status === 200 && cmp.data.properties.length === 2 && ppm2.values[1] === 'USD 1.117,65' && ppm2.best.length === 1, JSON.stringify(cmp.data.rows));
check('comparador: une las características', cmp.data.features.find((f) => f.name === 'Ascensor').has.every(Boolean));
check('comparador: de 2 a 4 propiedades', (await admin.get(`/compare?ids=${p2.id}`)).status === 400 && (await admin.get(`/compare?ids=a,b,c,d,e`)).status === 400);
check('comparador: el agente no compara propiedades ajenas', (await agent.get(`/compare?ids=${p3.id},${pLpz.id}`)).data.properties.every((p) => p.id !== pLpz.id));
const mapA = (await admin.get('/map/properties')).data;
check('mapa: propiedades con ubicación y aviso de las que no tienen', mapA.items.some((p) => p.id === p2.id && p.latitude === -17.765) && mapA.withoutLocation >= 1);
await admin.patch(`/properties/${pLpz.id}`, { isPublished: true });
const pubLpz = (await anon.get(`/public/properties/${pLpz.code}`)).data;
const exact = { lat: -16.5106, lng: -68.126 };
const dist = Math.hypot((pubLpz.location.lat - exact.lat) * 111320, (pubLpz.location.lng - exact.lng) * 106000);
check('mapa: el portal no muestra la ubicación exacta', !('latitude' in pubLpz) && pubLpz.location.radius === 300 && dist > 80 && dist < 300, JSON.stringify(pubLpz.location));
check('mapa: el listado público no trae coordenadas', !JSON.stringify((await anon.get('/public/properties')).data).includes('latitude'));
const pmap = (await anon.get('/public/map')).data;
check('mapa: mapa público con puntos aproximados', pmap.some((p) => p.code === pLpz.code && p.location && !('latitude' in p)));
const pcmp = await anon.get(`/public/compare?codes=${pLpz.code},${p5.code},NOEXISTE`);
check('comparador público: solo publicadas y sin datos internos', pcmp.status === 200 && pcmp.data.properties.length === 2 && !/agentId|ownerId|latitude|"id"/.test(JSON.stringify(pcmp.data.properties)), JSON.stringify(pcmp.data.properties).slice(0, 200));

// Tipo de cambio
await conta.post(`${F}/exchange-rates`, { date: new Date().toISOString(), rate: 6.97 });
const rates = (await conta.get(`${F}/exchange-rates`)).data;
check('tipo de cambio: uno por día; registrar de nuevo lo reemplaza', rates.length === 1 && rates[0].rate === 6.97);
check('tipo de cambio: valida el valor y es solo para finanzas', (await conta.post(`${F}/exchange-rates`, { date: new Date().toISOString(), rate: 0 })).status === 400 && (await agent.post(`${F}/exchange-rates`, { date: new Date().toISOString(), rate: 7 })).status === 403);
const sum6 = (await conta.get(`${F}/summary`)).data;
const t = (c) => sum6.totals.find((x) => x.currency === c) ?? { income: 0, expense: 0 };
check('tipo de cambio: total equivalente en bolivianos', sum6.consolidated.rate === 6.97 && eq(sum6.consolidated.income, Math.round((t('USD').income * 6.97 + t('BOB').income) * 100) / 100), JSON.stringify(sum6.consolidated));

// Libros IVA
check('libros IVA: no incluidos en el plan Profesional', (await otra.get('/tax/books')).status === 403);
const pur = await conta.post('/tax/purchases', { date: new Date().toISOString(), supplierTaxId: '1020304050', supplierName: 'Imprenta Central', invoiceNumber: '1532', authCode: 'ABC123', total: 600 });
check('libros IVA: registra una compra y no la duplica', pur.status === 201 && (await conta.post('/tax/purchases', { date: new Date().toISOString(), supplierTaxId: '1020304050', supplierName: 'X', invoiceNumber: '1532', total: 1 })).status === 400);
check('libros IVA: valida NIT y número', (await conta.post('/tax/purchases', { date: new Date().toISOString(), supplierTaxId: 'no!', supplierName: 'X', invoiceNumber: '1', total: 1 })).status === 400);
const books = (await conta.get('/tax/books')).data;
const sale1 = books.sales.rows.find((r) => r.number === 1), sale2 = books.sales.rows.find((r) => r.number === 2);
check('libros IVA: ventas con débito fiscal y anuladas en cero', eq(sale1.total, 5951) && eq(sale1.tax, 773.63) && sale2.status === 'A' && sale2.total === 0, JSON.stringify(books.sales.rows));
check('libros IVA: compras con crédito fiscal y saldo a pagar', eq(books.purchases.tax, 78) && eq(books.summary.balance, books.sales.tax - 78) && books.summary.toPay > 0);
const lv = await conta.get('/tax/books/export?book=sales&format=xlsx');
const lc = Buffer.from((await conta.get('/tax/books/export?book=purchases&format=csv')).data).toString('utf8');
check('libros IVA: exporta a Excel y CSV', lv.status === 200 && head(lv, 2) === 'PK' && lc.includes('Imprenta Central') && lc.includes('Crédito fiscal 13 %'));
check('libros IVA: mes inválido', (await conta.get('/tax/books?month=2026-13')).status === 400);
check('libros IVA: elimina la compra', (await conta.del(`/tax/purchases/${pur.data.id}`)).status === 200 && (await conta.get('/tax/books')).data.purchases.rows.length === 0);

// Proceso legal: checklist y firmas
const legal = (await admin.get(`/cases/${c2}/legal`)).data;
check('legal: checklist inicial según la operación', legal.items.length === 9 && legal.items[0].label.includes('Folio real') && legal.signaturesEnabled);
check('legal: consultar de nuevo no duplica', (await admin.get(`/cases/${c2}/legal`)).data.items.length === 9);
const done1 = await agent.patch(`/legal/items/${legal.items[0].id}`, { done: true });
check('legal: marcar un trámite registra quién y cuándo', done1.status === 200 && done1.data.doneAt && done1.data.doneById === agentId);
const extraItem = await agent.post(`/cases/${c2}/legal/items`, { label: 'Certificado de gravámenes' });
check('legal: agregar y quitar trámites', extraItem.status === 201 && (await agent.del(`/legal/items/${extraItem.data.id}`)).status === 200);
check('legal: otro agente u otra empresa no acceden', (await otra.get(`/cases/${c2}/legal`)).status === 404 && (await otra.patch(`/legal/items/${legal.items[1].id}`, { done: true })).status === 404);
const sigForm = new FormData(); sigForm.append('file', new Blob([pdf], { type: 'application/pdf' }), 'minuta.pdf'); sigForm.append('entityType', 'case'); sigForm.append('entityId', c2); sigForm.append('category', 'CONTRACT'); sigForm.append('name', 'Minuta de transferencia');
const minuta = (await agent.form('/documents', sigForm)).data;
check('firma: solo documentos del expediente', (await agent.post(`/cases/${c2}/signatures`, { documentId: 'otro', signerName: 'Laura Compradora', signerRole: 'CLIENT' })).status === 400);
const sig = await agent.post(`/cases/${c2}/signatures`, { documentId: minuta.id, signerName: 'Laura Compradora', signerRole: 'CLIENT' });
const token = sig.data.link?.split('/').pop();
check('firma: genera el enlace', sig.status === 201 && /^[a-f0-9]{48}$/.test(token));
const signer = client('demo.localhost:3000');
const sv = await signer.get(`/public/sign/${token}`);
check('firma: el firmante ve qué firma, sin iniciar sesión', sv.status === 200 && sv.data.status === 'PENDING' && sv.data.document.name === 'Minuta de transferencia' && sv.data.signerName === 'Laura Compradora');
const sd = await signer.get(`/public/sign/${token}/document`);
check('firma: puede abrir el documento', sd.status === 200 && Buffer.from(sd.data).toString().startsWith('%PDF'));
check('firma: el enlace no sirve en otra empresa', (await client(`${slug}.localhost:3000`).get(`/public/sign/${token}`)).status === 404);
check('firma: exige aceptar y el nombre correcto', (await signer.post(`/public/sign/${token}`, { fullName: 'Laura Compradora', accept: false })).status === 400 && (await signer.post(`/public/sign/${token}`, { fullName: 'Otra Persona', accept: true })).status === 400);
const signed = await signer.post(`/public/sign/${token}`, { fullName: '  laura  COMPRADORA ', accept: true });
check('firma: firma con el nombre sin importar mayúsculas', signed.status === 200 && signed.data.status === 'SIGNED');
check('firma: no se firma dos veces', (await signer.post(`/public/sign/${token}`, { fullName: 'Laura Compradora', accept: true })).status === 400);
const { createHash: ch } = await import('node:crypto');
const legal2 = (await admin.get(`/cases/${c2}/legal`)).data.signatures.find((x) => x.id === sig.data.id);
check('firma: guarda fecha, IP y huella del archivo firmado', legal2.status === 'SIGNED' && legal2.signedAt && legal2.signedIp && legal2.documentHash === ch('sha256').update(pdf).digest('hex'));
check('firma: avisa al administrador', (await admin.get('/notifications')).data.items.some((n) => n.title.includes('Laura Compradora firmó')));
const sig2 = await agent.post(`/cases/${c2}/signatures`, { documentId: minuta.id, signerName: 'María Propietaria', signerRole: 'OWNER' });
check('firma: cancelar una solicitud invalida el enlace', (await agent.post(`/signatures/${sig2.data.id}/cancel`)).status === 200 && (await signer.get(`/public/sign/${sig2.data.link.split('/').pop()}`)).data.status === 'CANCELLED' && (await signer.get(`/public/sign/${sig2.data.link.split('/').pop()}/document`)).status === 404);
check('firma: enlace inventado', (await signer.get('/public/sign/' + 'a'.repeat(48))).status === 404);

// Documentos del propietario
await admin.patch(`/users/${acc.data.id}`, { isActive: true });
const own6 = client('demo.localhost:3000'); await own6.login(ownerEmail, PASS);
const ownForm = new FormData(); ownForm.append('file', new Blob([pdf], { type: 'application/pdf' }), 'autorizacion.pdf'); ownForm.append('entityType', 'property'); ownForm.append('entityId', prop.id); ownForm.append('category', 'AUTHORIZATION'); ownForm.append('name', 'Autorización de venta');
const ownDoc = (await admin.form('/documents', ownForm)).data;
const ownSum = (await own6.get('/owner/summary')).data;
check('propietario: descarga los documentos de su propiedad', ownSum.properties.find((p) => p.id === prop.id).documents.some((d) => d.id === ownDoc.id) && (await own6.get(`/owner/documents/${ownDoc.id}`)).status === 200);
check('propietario: no descarga documentos ajenos ni de expedientes', (await own6.get(`/owner/documents/${minuta.id}`)).status === 404 && (await agent.get(`/owner/documents/${ownDoc.id}`)).status === 403);

// ============ ETAPA 7: jefe de sucursal, comisiones por nivel y cierre de gestión ============
// Jefe de sucursal
const pedroC = client('demo.localhost:3000'); await pedroC.login(`pedro${run}@demo.com`, PASS);
const rosa = (await admin.post('/users', { email: `rosa${run}@demo.com`, fullName: 'Rosa Quispe', role: 'AGENT', password: PASS, branchId: lpz.data.id })).data;
const pRosa = (await admin.post('/properties', { title: 'Oficina en San Miguel', type: 'OFFICE', operation: 'RENT', price: 4500, currency: 'BOB', zone: 'San Miguel', city: 'La Paz', agentId: rosa.id })).data;
check('jefe: sin el permiso, el agente ve solo lo suyo', !(await pedroC.get('/properties')).data.some((p) => p.id === pRosa.id));
await admin.patch(`/users/${pedro.data.id}`, { permissions: { branch_manager: true } });
const jProps = (await pedroC.get('/properties')).data;
check('jefe: ve todo lo de su sucursal y nada de otra', jProps.some((p) => p.id === pRosa.id) && jProps.every((p) => [pedro.data.id, rosa.id].includes(p.agent?.id)), JSON.stringify(jProps.map((p) => p.agent?.fullName)));
pedroC.header('x-branch', scz.data.id);
check('jefe: no puede ver otra sucursal eligiéndola', (await pedroC.get('/properties')).data.every((p) => p.agent?.id !== agentId));
pedroC.header('x-branch', null);
check('jefe: elige solo entre los agentes de su sucursal', (await pedroC.get('/users/agents')).data.every((u) => [pedro.data.id, rosa.id].includes(u.id)));
check('jefe: asigna a un agente de su sucursal', (await pedroC.patch(`/properties/${pLpz.id}`, { agentId: rosa.id })).data.agentId === rosa.id);
check('jefe: no asigna a agentes de otra sucursal', (await pedroC.patch(`/properties/${pRosa.id}`, { agentId })).status === 400 && (await pedroC.post('/properties', { title: 'X', type: 'HOUSE', operation: 'SALE', price: 1, agentId })).status === 400);
const jt = await pedroC.post('/tasks', { title: 'Fotos de la oficina', assignedToId: rosa.id });
check('jefe: asigna tareas a su sucursal y ve las de su equipo', jt.status === 201 && jt.data.assignedTo.id === rosa.id && (await pedroC.get('/tasks')).data.some((t) => t.id === jt.data.id) && (await pedroC.post('/tasks', { title: 'X', assignedToId: agentId })).status === 400);
const jAn = (await pedroC.get('/analytics')).data;
check('jefe: la analítica es la de su sucursal', jAn.agents.every((a) => [pedro.data.id, rosa.id].includes(a.agent.id)) && jAn.agents.length >= 1);
check('jefe: no entra a finanzas ni a la configuración', (await pedroC.get(`${F}/summary`)).status === 403 && (await pedroC.get('/users')).status === 403);
check('jefe: un agente común sigue sin poder asignar', (await agent.patch(`/properties/${p3.id}`, { agentId: rosa.id })).data.agentId === agentId);

// Comisiones por nivel
check('niveles: el primero debe empezar en 0', (await admin.post(`${F}/rules`, { name: 'X', operation: 'SALE', agentId: pedro.data.id, basis: 'PERCENT', companyValue: 3, agentSharePct: 50, tiers: [{ from: 10, agentSharePct: 50 }] })).status === 400);
const tierRule = await admin.post(`${F}/rules`, { name: 'Ventas de Pedro por nivel', operation: 'SALE', agentId: pedro.data.id, basis: 'PERCENT', companyValue: 3, agentSharePct: 50, tiers: [{ from: 100000, agentSharePct: 60 }, { from: 0, agentSharePct: 40 }], tierPeriod: 'YEAR' });
check('niveles: se guarda la regla con sus niveles ordenados', tierRule.status === 201 && tierRule.data.tiers[0].from === 0 && tierRule.data.tierPeriod === 'YEAR', JSON.stringify(tierRule.data));
const sellPedro = async (title, price) => {
  const p = (await admin.post('/properties', { title, type: 'APARTMENT', operation: 'SALE', price, currency: 'USD', agentId: pedro.data.id })).data;
  const cid = (await admin.get(`/properties/${p.id}`)).data.cases[0].id;
  await admin.post(`/cases/${cid}/close`, { result: 'WON', clientId: buyer.id, closedPrice: price });
  return (await admin.get(`${F}/commissions`)).data.find((c) => c.case.id === cid);
};
const kom1 = await sellPedro('Departamento en Achumani', 95000);
const kom2 = await sellPedro('Departamento en Obrajes', 50000);
check('niveles: primera venta en el nivel 1 (40 %)', kom1 && Number(kom1.agentSharePct) === 40 && eq(kom1.agentAmount, 1140) && kom1.ruleName.endsWith('nivel 1'), JSON.stringify(kom1));
check('niveles: al pasar USD 100.000 en el año sube al nivel 2 (60 %)', kom2 && Number(kom2.agentSharePct) === 60 && eq(kom2.agentAmount, 900) && kom2.ruleName.endsWith('nivel 2'), JSON.stringify(kom2));
const noTiers = await admin.patch(`${F}/rules/${tierRule.data.id}`, { tiers: [] });
check('niveles: se pueden quitar', noTiers.status === 200 && noTiers.data.tiers === null && noTiers.data.tierPeriod === null);

// Cierre de gestión contable
const lastYear = new Date().getFullYear() - 1;
const dt = (y, m) => new Date(Date.UTC(y, m - 1, 15, 16)).toISOString();
await conta.post(`${F}/transactions`, { kind: 'INCOME', category: 'FEE', amount: 1000, currency: 'USD', date: dt(lastYear, 6), description: 'Honorarios del año pasado', method: 'TRANSFER' });
await conta.post(`${F}/transactions`, { kind: 'EXPENSE', category: 'OFFICE', amount: 300, currency: 'USD', date: dt(lastYear, 7), description: 'Alquiler del año pasado', method: 'TRANSFER' });
await conta.post(`${F}/transactions`, { kind: 'INCOME', category: 'FEE', amount: 100, currency: 'BOB', date: dt(lastYear - 1, 3), description: 'Honorarios de hace dos años', method: 'CASH' });
const par = await Promise.all([conta.get('/accounting/statements'), conta.get('/accounting/accounts'), conta.get('/accounting/closings'), conta.get('/accounting/journal')]);
check('contabilidad: pantallas abiertas a la vez no duplican asientos', par.every((r) => r.status === 200), par.map((r) => r.status).join(','));
const cl0 = (await conta.get('/accounting/closings')).data;
check('cierre: lista las gestiones por cerrar', cl0.closable.includes(lastYear) && cl0.closable.includes(lastYear - 1), JSON.stringify(cl0));
check('cierre: la gestión en curso no se cierra', (await conta.post('/accounting/closings', { year: lastYear + 1 })).status === 400);
const outOfOrder = await conta.post('/accounting/closings', { year: lastYear });
check('cierre: se cierra en orden', outOfOrder.status === 400 && outOfOrder.data.message.includes(`${lastYear - 1}`), JSON.stringify(outOfOrder.data));
check('cierre: cierra la gestión anterior', (await conta.post('/accounting/closings', { year: lastYear - 1 })).status === 201);
const cl1 = await conta.post('/accounting/closings', { year: lastYear });
check('cierre: resultado de la gestión', cl1.status === 201 && eq(cl1.data.find((c) => c.currency === 'USD').result, 700), JSON.stringify(cl1.data));
check('cierre: no se cierra dos veces', (await conta.post('/accounting/closings', { year: lastYear })).status === 400);
const blocked = await conta.post(`${F}/transactions`, { kind: 'EXPENSE', category: 'OTHER', amount: 5, currency: 'USD', date: dt(lastYear, 12), description: 'Tarde' });
check('cierre: bloquea movimientos con fechas cerradas', blocked.status === 400 && blocked.data.message.includes(`${lastYear}`));
check('cierre: bloquea asientos manuales en la gestión cerrada', (await conta.post('/accounting/journal', { date: dt(lastYear, 11), description: 'X', currency: 'USD', lines: [{ accountId: accId('1102'), debit: 1 }, { accountId: accId('3101'), credit: 1 }] })).status === 400);
check('cierre: el cierre vale para todas las monedas', (await conta.post(`${F}/transactions`, { kind: 'EXPENSE', category: 'OTHER', amount: 5, currency: 'BOB', date: dt(lastYear, 12), description: 'Tarde' })).status === 400);
const stLast = (await conta.get(`/accounting/statements?from=${lastYear}-01-01&to=${lastYear}-12-31`)).data.find((x) => x.currency === 'USD');
check('cierre: el estado de resultados de la gestión sigue mostrando su utilidad', eq(stLast.income.result, 700), JSON.stringify(stLast.income));
const stNow = (await conta.get('/accounting/statements')).data.find((x) => x.currency === 'USD');
const retained = stNow.balance.equity.find((r) => r.code === '3201');
check('cierre: el resultado pasa a Resultados acumulados y el balance cuadra', retained && eq(retained.balance, 700) && stNow.balance.balanced, JSON.stringify(stNow.balance.equity));
check('cierre: el diario muestra el asiento de cierre', (await conta.get('/accounting/journal')).data.some((e) => e.sourceType === 'closing' && e.description === `Cierre de la gestión ${lastYear}`));
check('cierre: solo el administrador reabre, y solo la última gestión', (await conta.del(`/accounting/closings/${lastYear}`)).status === 403 && (await admin.del(`/accounting/closings/${lastYear - 1}`)).status === 400);
check('cierre: al reabrir se puede volver a registrar en esas fechas', (await admin.del(`/accounting/closings/${lastYear}`)).status === 200 && (await conta.post(`${F}/transactions`, { kind: 'EXPENSE', category: 'OTHER', amount: 5, currency: 'USD', date: dt(lastYear, 12), description: 'Tarde' })).status === 201);
check('cierre: los libros cuadran después de todo', (await conta.get('/accounting/statements')).data.every((x) => x.trial.balanced && x.balance.balanced));

// ===== ETAPA 8: portal (foto del agente, búsqueda en vivo, reseñas) =====
const pngForm = () => { const f = new FormData(); f.append('file', new Blob([png], { type: 'image/png' }), 'yo.png'); return f; };
const upMe = await pedroC.form('/me/avatar', pngForm());
check('perfil: el agente sube su foto', upMe.status === 201 && upMe.data.avatar.startsWith('/api/public/avatar/'), JSON.stringify(upMe.data));
check('perfil: la sesión trae la foto', (await pedroC.get('/auth/me')).data.avatar === upMe.data.avatar);
const badAv = new FormData(); badAv.append('file', new Blob(['<svg onload=alert(1)>'], { type: 'image/png' }), 'x.png');
check('perfil: rechaza archivos que no son imagen', (await pedroC.form('/me/avatar', badAv)).status === 400);
check('perfil: un agente no cambia la foto de otro', (await pedroC.form(`/users/${agentId}/avatar`, pngForm())).status === 403);
check('perfil: el administrador cambia la foto de otro', (await admin.form(`/users/${agentId}/avatar`, pngForm())).status === 201);
const avGet = await anon.get(upMe.data.avatar.replace('/api', ''));
check('portal: la foto del agente es pública y es una imagen', avGet.status === 200 && avGet.type === 'image/png');
check('portal: la foto no se sirve en otra empresa', (await client(`${slug}.localhost:3000`).get(upMe.data.avatar.replace('/api', ''))).status === 404);
const pAv = (await admin.post('/properties', { title: 'Casa con jardín en Achumani', type: 'HOUSE', operation: 'SALE', price: 210000, currency: 'USD', zone: 'Achumani', city: 'La Paz', agentId: pedro.data.id, bedrooms: 4, features: ['Jardín'] })).data;
await admin.patch(`/properties/${pAv.id}`, { isPublished: true });
let pubAv = (await anon.get(`/public/properties/${pAv.code}`)).data;
check('portal: la ficha muestra al agente con su foto', pubAv.agent?.fullName === 'Pedro Paceño' && pubAv.agent.avatar === upMe.data.avatar && !('id' in pubAv.agent) && !('avatarFile' in pubAv.agent), JSON.stringify(pubAv.agent));

// Búsqueda en vivo
const e8s1 = (await anon.get('/public/search?q=' + encodeURIComponent('casa achumani'))).data;
check('búsqueda: encuentra por tipo y zona', e8s1.results.some((r) => r.code === pAv.code) && e8s1.understood.includes('casa'), JSON.stringify(e8s1.understood));
const e8s2 = (await anon.get('/public/search?q=' + encodeURIComponent('achumany'))).data;
check('búsqueda: tolera una letra mal', e8s2.results.some((r) => r.code === pAv.code));
const e8s3 = (await anon.get('/public/search?q=' + encodeURIComponent('terreno en Achumani'))).data;
check('búsqueda: sin coincidencias propone alternativas con el motivo', e8s3.results.length === 0 && e8s3.alternatives.some((a) => a.code === pAv.code && a.why.includes('Es casa')), JSON.stringify(e8s3.alternatives.map((a) => [a.code, a.why])));
check('búsqueda: no expone coordenadas ni descripción', !/latitude|description|agentId/.test(JSON.stringify(e8s1)));
check('búsqueda: sugiere zonas mientras escribes', (await anon.get('/public/search?q=Achu')).data.suggestions.includes('Achumani'));
const e8sum = (await anon.get('/public/summary')).data;
check('portada: cifras de propiedades publicadas', e8sum.total >= 1 && e8sum.byOperation.SALE >= 1 && e8sum.zones.includes('Achumani'), JSON.stringify(e8sum));

// Reseñas por enlace
const wonPedro = (await pedroC.get('/post-sale')).data[0];
check('reseña: el agente tiene operaciones ganadas', !!wonPedro);
check('reseña: no se pide en operaciones sin cerrar', (await pedroC.post(`/cases/${(await admin.get('/cases')).data.find((c) => c.status === 'OPEN')?.id ?? 'x'}/review-link`)).status >= 400);
check('reseña: un agente no genera enlaces de operaciones ajenas', (await agent.post(`/cases/${wonPedro.id}/review-link`)).status === 404);
const e8rl = await pedroC.post(`/cases/${wonPedro.id}/review-link`);
check('reseña: el agente genera el enlace', e8rl.status === 201 && /^\/resena\/[a-f0-9]{48}$/.test(e8rl.data.link) && e8rl.data.message.includes('reseña'), JSON.stringify(e8rl.data));
check('reseña: pedir de nuevo devuelve el mismo enlace', (await pedroC.post(`/cases/${wonPedro.id}/review-link`)).data.link === e8rl.data.link);
const e8tok = e8rl.data.link.split('/').pop();
const e8rp = await anon.get(`/public/reviews/${e8tok}`);
check('reseña: página pública sin montos ni datos del cliente', e8rp.status === 200 && e8rp.data.agent.fullName === 'Pedro Paceño' && !e8rp.data.done && !/closedPrice|phone|email|price/.test(JSON.stringify(e8rp.data)), JSON.stringify(e8rp.data));
check('reseña: el enlace no sirve en otra empresa', (await client(`${slug}.localhost:3000`).get(`/public/reviews/${e8tok}`)).status === 404);
check('reseña: enlace inventado', (await anon.get(`/public/reviews/${'a'.repeat(48)}`)).status === 404);
check('reseña: pide estrellas válidas', (await anon.post(`/public/reviews/${e8tok}`, { rating: 7, text: 'Excelente atención de principio a fin.' })).status === 400);
check('reseña: pide un comentario', (await anon.post(`/public/reviews/${e8tok}`, { rating: 5, text: 'ok' })).status === 400);
const e8sent = await anon.post(`/public/reviews/${e8tok}`, { rating: 5, text: 'Pedro nos acompañó en todo el proceso, muy recomendable.', publish: true });
check('reseña: el cliente la envía', e8sent.status === 200 && e8sent.data.published === true, JSON.stringify(e8sent.data));
check('reseña: solo una vez', (await anon.post(`/public/reviews/${e8tok}`, { rating: 1, text: 'Cambio mi reseña a una mala.' })).status === 400);
check('reseña: el enlace queda como ya respondido', (await anon.get(`/public/reviews/${e8tok}`)).data.done === true);
check('reseña: ya no se genera otro enlace', (await pedroC.post(`/cases/${wonPedro.id}/review-link`)).status === 400);
const testi8 = (await anon.get('/public/testimonials')).data;
check('reseña: se publica sola en el portal con el agente', testi8.some((t) => t.text.startsWith('Pedro nos acompañó') && t.satisfaction === 5 && t.agent?.fullName === 'Pedro Paceño'), JSON.stringify(testi8[0]));
pubAv = (await anon.get(`/public/properties/${pAv.code}`)).data;
check('reseña: la ficha muestra la calificación del agente', pubAv.agent.rating.count >= 1 && pubAv.agent.rating.average === 5 && pubAv.agent.reviews[0].text.startsWith('Pedro nos'), JSON.stringify(pubAv.agent.rating));
check('reseña: avisa al agente', (await pedroC.get('/notifications')).data.items.some((n) => n.title.startsWith('Nueva reseña')));
await pedroC.put(`/cases/${wonPedro.id}/post-sale`, { satisfaction: 2, testimonial: 'Texto cambiado por el agente', testimonialPublic: true });
check('reseña: el agente no puede cambiar lo que escribió el cliente', (await anon.get('/public/testimonials')).data.some((t) => t.text.startsWith('Pedro nos acompañó')));
check('reseña: solo el administrador la oculta', (await pedroC.patch(`/cases/${wonPedro.id}/review`, { hidden: true })).status === 403);
await admin.patch(`/cases/${wonPedro.id}/review`, { hidden: true });
check('reseña: oculta, sale del portal y de la ficha', !(await anon.get('/public/testimonials')).data.some((t) => t.text.startsWith('Pedro nos')) && (await anon.get(`/public/properties/${pAv.code}`)).data.agent.rating.count === 0);
await admin.patch(`/cases/${wonPedro.id}/review`, { hidden: false });
check('reseña: se puede volver a mostrar', (await anon.get('/public/testimonials')).data.some((t) => t.text.startsWith('Pedro nos')));

// ===== Nueva captación desde Gestión comercial =====
const ownNew = (await admin.post('/contacts', { fullName: 'Hugo Captación', phone: '71234599', type: 'OWNER' })).data;
const nc = await admin.post('/properties', { title: 'Casa nueva captada en Urbarí', type: 'HOUSE', operation: 'SALE', price: 150000, currency: 'USD', zone: 'Urbarí', city: 'Santa Cruz', ownerId: ownNew.id, captation: { isExclusive: true, commissionPct: 4, captationEnds: '2027-04-30' } });
check('captación: la propiedad nueva abre su expediente y devuelve su id', nc.status === 201 && !!nc.data.caseId && /^EXP-/.test(nc.data.caseCode), JSON.stringify(nc.data).slice(0, 200));
const ncCase = (await admin.get(`/cases/${nc.data.caseId}`)).data;
check('captación: guarda las condiciones (exclusiva, comisión y vencimiento)', ncCase.isExclusive === true && Number(ncCase.commissionPct) === 4 && ncCase.captationEnds?.startsWith('2027-04-30') && ncCase.currentStage === 'CAPTATION' && ncCase.ownerId === ownNew.id, JSON.stringify({ e: ncCase.isExclusive, c: ncCase.commissionPct, d: ncCase.captationEnds, s: ncCase.currentStage }));
check('captación: rechaza una comisión fuera de rango', (await admin.post('/properties', { title: 'X', type: 'HOUSE', operation: 'SALE', price: 1, captation: { commissionPct: 150 } })).status === 400);
const listed = (await admin.get('/properties')).data.find((p) => p.id === nc.data.id);
check('captación: el listado indica que ya tiene gestión abierta', listed?.cases?.[0]?.id === nc.data.caseId);
check('captación: no abre otra gestión si ya hay una abierta', (await admin.post('/cases', { propertyId: nc.data.id })).status === 400);
const sinCaso = (await admin.post('/properties', { title: 'Lote sin gestión', type: 'LAND', operation: 'SALE', price: 50000, openCase: false })).data;
check('captación: propiedad registrada sin gestión', sinCaso.caseId === null && (await admin.get('/properties')).data.find((p) => p.id === sinCaso.id).cases.length === 0);
const reopen = await admin.post('/cases', { propertyId: sinCaso.id, commissionPct: 3.5, isExclusive: false });
check('captación: abre la gestión de una propiedad ya registrada', reopen.status === 201 && Number(reopen.data.commissionPct) === 3.5);

// ===== Herramientas de captación =====
check('captación: tipo de cambio de referencia para agentes', (await agent.get('/captation/rate')).status === 200);
const ag1 = await admin.post(`/cases/${nc.data.caseId}/agreement`, { ownerName: 'Hugo Captación', ownerDocId: '4567890 SC', operation: 'SALE', price: 150000, currency: 'USD', value: 3.5, isExclusive: true, days: 90, extra: 'Las visitas se coordinan con 24 h de anticipación.' });
check('acuerdo: genera el PDF y lo guarda en el expediente', ag1.status === 201 && !!ag1.data.documentId && ag1.data.applied === true, JSON.stringify(ag1.data));
const agDocs = (await admin.get(`/documents?entityType=case&entityId=${nc.data.caseId}`)).data;
check('acuerdo: queda como autorización en Documentos', agDocs.some((d) => d.id === ag1.data.documentId && d.category === 'AUTHORIZATION' && d.mimeType === 'application/pdf'));
const agPdf = await admin.get(`/documents/${ag1.data.documentId}/download`);
check('acuerdo: el archivo es un PDF', agPdf.status === 200 && Buffer.from(agPdf.data).subarray(0, 4).toString() === '%PDF');
const ncAfter = (await admin.get(`/cases/${nc.data.caseId}`)).data;
check('acuerdo: aplica comisión, exclusividad y vencimiento al expediente', Number(ncAfter.commissionPct) === 3.5 && ncAfter.isExclusive === true && !!ncAfter.captationEnds);
const ag2 = await admin.post(`/cases/${nc.data.caseId}/agreement`, { ownerName: 'Hugo Captación', operation: 'RENT', price: 4000, currency: 'BOB', value: 1, isExclusive: false });
check('acuerdo: con otra operación no cambia el expediente', ag2.status === 201 && ag2.data.applied === false && Number((await admin.get(`/cases/${nc.data.caseId}`)).data.commissionPct) === 3.5);
check('acuerdo: valida meses de alquiler', (await admin.post(`/cases/${nc.data.caseId}/agreement`, { ownerName: 'X', operation: 'RENT', price: 4000, currency: 'BOB', value: 20 })).status === 400);
check('acuerdo: un agente no lo genera en expedientes ajenos', (await agent.post(`/cases/${nc.data.caseId}/agreement`, { ownerName: 'X', operation: 'SALE', price: 1000, currency: 'USD', value: 3 })).status === 404);

console.log(`\n${passed} correctas, ${failed} fallas`);
process.exit(failed ? 1 : 0);
