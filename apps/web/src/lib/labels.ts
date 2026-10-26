export const OPERATION: Record<string, string> = { SALE: "Venta", RENT: "Alquiler", ANTICRETICO: "Anticrético" };
export const PROPERTY_TYPE: Record<string, string> = {
  HOUSE: "Casa", APARTMENT: "Departamento", LAND: "Terreno", OFFICE: "Oficina", COMMERCIAL: "Local comercial", WAREHOUSE: "Galpón", OTHER: "Otro",
};
export const PROPERTY_STATUS: Record<string, string> = {
  AVAILABLE: "Disponible", RESERVED: "Reservada", NEGOTIATING: "En negociación", SOLD: "Vendida", RENTED: "Alquilada", INACTIVE: "Inactiva",
};
export const CONTACT_TYPE: Record<string, string> = {
  PROSPECT: "Prospecto", BUYER: "Comprador", TENANT: "Arrendatario", OWNER: "Propietario", INVESTOR: "Inversionista", COMPANY: "Empresa",
};
export const LEAD_STATUS: Record<string, string> = {
  NEW: "Nuevo", CONTACTED: "Contactado", QUALIFIED: "Calificado", INTERESTED: "Interesado", VISIT: "Visita",
  NEGOTIATION: "Negociación", RESERVED: "Reserva", CLOSED: "Cerrado", LOST: "Perdido",
};
export const LEAD_PIPELINE = ["NEW", "CONTACTED", "QUALIFIED", "INTERESTED", "VISIT", "NEGOTIATION", "RESERVED", "CLOSED", "LOST"];
export const LEAD_SOURCE: Record<string, string> = {
  WEB: "Portal web", WHATSAPP: "WhatsApp", CALL: "Llamada", REFERRAL: "Referido", SOCIAL: "Redes sociales", QR: "Código QR", WALK_IN: "Visita a oficina", OTHER: "Otro",
};
export const VISIT_STATUS: Record<string, string> = {
  REQUESTED: "Solicitada", CONFIRMED: "Confirmada", RESCHEDULED: "Reprogramada", DONE: "Realizada", CANCELLED: "Cancelada", NO_SHOW: "No asistió",
};
export const STAGES = ["CAPTATION", "MARKETING", "LEADS", "VISIT", "FOLLOW_UP", "NEGOTIATION", "LEGAL", "POST_SALE"];
export const STAGE: Record<string, string> = {
  CAPTATION: "Captación", MARKETING: "Marketing", LEADS: "Interesados", VISIT: "Visita",
  FOLLOW_UP: "Post-visita", NEGOTIATION: "Negociación", LEGAL: "Legal", POST_SALE: "Postventa",
};
export const STAGE_HELP: Record<string, string> = {
  CAPTATION: "Acuerdo con el propietario, exclusividad, comisión y documentación inicial.",
  MARKETING: "Fotos, descripción y publicación. Al completarlo la propiedad sale al portal.",
  LEADS: "Atender consultas, calificar interesados y registrar sus preferencias.",
  VISIT: "Agendar, confirmar y realizar las visitas al inmueble.",
  FOLLOW_UP: "Llamar después de la visita, anotar objeciones y nivel de interés.",
  NEGOTIATION: "Ofertas, contraofertas, reserva y condiciones del cierre.",
  LEGAL: "Documentos, contrato, firmas y trámites en notaría.",
  POST_SALE: "Entrega, satisfacción del cliente, testimonio y referidos.",
};
export const STAGE_STATUS: Record<string, string> = { PENDING: "Pendiente", IN_PROGRESS: "En curso", DONE: "Completado" };
export const CASE_STATUS: Record<string, string> = { OPEN: "Abierto", WON: "Ganado", LOST: "Perdido" };
export const ROLE: Record<string, string> = {
  SUPERADMIN: "Superadmin", ADMIN: "Administrador", AGENT: "Agente", ACCOUNTANT: "Contador", OWNER: "Propietario",
};
export const TENANT_STATUS: Record<string, string> = { ACTIVE: "Activa", SUSPENDED: "Suspendida", CANCELLED: "Cancelada" };

const TZ = "America/La_Paz";
export function money(value: unknown, currency = "USD") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency === "BOB" ? "Bs" : "USD"} ${n.toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
}
export const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("es-BO", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString("es-BO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const fmtTime = (d: string | Date) => new Date(d).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
export const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
export const dayKey = (d: string | Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
/** Valor para <input type="datetime-local"> en hora local del navegador. */
export function toLocalInput(d: string | Date) {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

// ---------- Fase 2 ----------
export const OFFER_KIND: Record<string, string> = { OFFER: "Oferta", COUNTER: "Contraoferta" };
export const OFFER_STATUS: Record<string, string> = { PENDING: "Pendiente", ACCEPTED: "Aceptada", REJECTED: "Rechazada", WITHDRAWN: "Retirada" };
export const RESERVATION_STATUS: Record<string, string> = { ACTIVE: "Activa", CANCELLED: "Cancelada", APPLIED: "Aplicada al cierre" };
export const DOC_CATEGORY: Record<string, string> = {
  TITLE: "Título de propiedad", CONTRACT: "Contrato", ID: "Documento de identidad", AUTHORIZATION: "Autorización", RECEIPT: "Comprobante", PLAN: "Plano", OTHER: "Otro",
};
export const REFERRAL_STATUS: Record<string, string> = { NEW: "Nuevo", CONTACTED: "Contactado", CONVERTED: "Convertido", DISCARDED: "Descartado" };
export const CHANNEL: Record<string, string> = {
  PORTAL: "Portal propio", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok", WHATSAPP: "WhatsApp",
  EXTERNAL_PORTAL: "Portal inmobiliario", PRINT: "Material impreso", OTHER: "Otro",
};
export const TRAFFIC: Record<string, string> = {
  DIRECT: "Enlace directo", QR: "Código QR", WHATSAPP: "WhatsApp", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok", OTHER: "Otra",
};
export const CAMPAIGN_STATUS: Record<string, string> = { PLANNED: "Planificada", ACTIVE: "Activa", FINISHED: "Finalizada" };

export function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
/** Número para wa.me: solo dígitos; a los celulares bolivianos de 8 dígitos se les antepone 591. */
export function waNumber(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 8 ? `591${digits}` : digits;
}
/** Reemplaza {variables} de una plantilla; las que no tienen valor se dejan visibles para completarlas a mano. */
export function fillTemplate(body: string, vars: Record<string, string | null | undefined>) {
  return body.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] || all);
}

// ---------- Fase 3: finanzas ----------
export const TX_KIND: Record<string, string> = { INCOME: "Ingreso", EXPENSE: "Gasto" };
export const INCOME_CATEGORY: Record<string, string> = {
  SALE_COMMISSION: "Comisión por venta", RENT_COMMISSION: "Comisión por alquiler", FEE: "Honorarios", SERVICE: "Servicios", RESERVATION: "Reservas", OTHER: "Otros",
};
export const EXPENSE_CATEGORY: Record<string, string> = {
  COMMISSION_PAID: "Comisiones pagadas", ADVERTISING: "Publicidad", MARKETING: "Marketing", STAFF: "Personal", SERVICES: "Servicios", OFFICE: "Oficina",
  TRANSPORT: "Transporte", ADMIN: "Administración", OTHER: "Otros",
};
export const CATEGORY: Record<string, string> = { ...EXPENSE_CATEGORY, ...INCOME_CATEGORY };
export const PAY_METHOD: Record<string, string> = { TRANSFER: "Transferencia", CASH: "Efectivo", QR: "QR", CHECK: "Cheque", CARD: "Tarjeta", OTHER: "Otro" };
export const ACCOUNT_STATUS: Record<string, string> = { PENDING: "Pendiente", PARTIAL: "Pago parcial", PAID: "Pagada", CANCELLED: "Cancelada" };
export const COMMISSION_STATUS: Record<string, string> = { GENERATED: "Generada", PENDING: "Pendiente", APPROVED: "Aprobada", PAID: "Pagada", CANCELLED: "Cancelada" };
export const SETTLEMENT_STATUS: Record<string, string> = { DRAFT: "Borrador", APPROVED: "Aprobada", PAID: "Pagada" };
export const ADJUSTMENT: Record<string, string> = { BONUS: "Bonificación", DEDUCTION: "Deducción", ADVANCE: "Anticipo" };
export const GROUPING: Record<string, string> = { day: "Día", week: "Semana", month: "Mes", quarter: "Trimestre", year: "Año" };
/** Fecha de hoy para <input type="date">. */
export const todayInput = () => toLocalInput(new Date()).slice(0, 10);
/** Montos por moneda en una sola línea: "USD 4.275 · Bs 300". */
export function moneyMap(map: Record<string, number> | undefined) {
  const entries = Object.entries(map ?? {}).filter(([, n]) => n);
  return entries.length ? entries.map(([cur, n]) => money(n, cur)).join(" · ") : "—";
}

export const TASK_TYPE: Record<string, string> = {
  CALL: "Llamada", WHATSAPP: "WhatsApp", EMAIL: "Email", VISIT: "Visita", FOLLOW_UP: "Seguimiento", DOCUMENT: "Documento", PAYMENT: "Cobro o pago", SIGNATURE: "Firma", REVIEW: "Revisión", CUSTOM: "Otra",
};
export const TASK_PRIORITY: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente" };
export const ACCOUNT_TYPE: Record<string, string> = { ASSET: "Activo", LIABILITY: "Pasivo", EQUITY: "Patrimonio", INCOME: "Ingreso", EXPENSE: "Gasto" };
export const INVOICE_STATUS: Record<string, string> = { DRAFT: "Borrador", ISSUED: "Emitida", VOIDED: "Anulada" };
export const WEBHOOK_EVENT: Record<string, string> = {
  "lead.created": "Lead nuevo", "visit.scheduled": "Visita agendada", "offer.received": "Oferta recibida", "case.won": "Operación ganada", "case.lost": "Operación perdida", ping: "Prueba",
};
