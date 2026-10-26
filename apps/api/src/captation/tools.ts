/**
 * Herramientas de captación: cálculo de comisión y cláusulas del acuerdo de trabajo con el propietario.
 * Funciones puras: las usan la API (PDF), la web y la demo.
 *
 * La comisión se guarda en el expediente como porcentaje (commissionPct), igual que las reglas de comisión:
 * - Venta: % del precio de venta.
 * - Alquiler: % de un mes de alquiler (100 % = un mes). En pantalla se pide en meses.
 * - Anticrético: % del monto del anticrético.
 */
export type CaptationOp = 'SALE' | 'RENT' | 'ANTICRETICO';
export type Money = 'USD' | 'BOB';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Porcentaje que se guarda en el expediente a partir de lo que se escribe en pantalla. */
export const toPct = (op: CaptationOp, value: number) => r2(op === 'RENT' ? value * 100 : value);
/** Lo que se muestra en pantalla a partir del porcentaje guardado (meses en alquiler). */
export const fromPct = (op: CaptationOp, pct: number) => r2(op === 'RENT' ? pct / 100 : pct);

export type CommissionInput = { operation: CaptationOp; price: number; currency: Money; value: number; rate: number };
export type CommissionResult = {
  commission: number; usd: number; bob: number; pct: number;
  /** Venta y anticrético: lo que recibe el propietario. Alquiler: lo que recibe en el primer año. */
  ownerNet: number; ownerNetLabel: string; error: string | null;
};

export function commissionError(i: CommissionInput): string | null {
  if (!(i.price > 0)) return 'Escribe un precio mayor que cero';
  if (!(i.value >= 0)) return 'La comisión no puede ser negativa';
  if (i.operation === 'RENT' ? i.value > 12 : i.value > 100) return i.operation === 'RENT' ? 'Máximo 12 meses de alquiler' : 'El porcentaje no puede superar 100';
  if (!(i.rate > 0)) return 'Escribe el tipo de cambio (Bs por 1 USD)';
  return null;
}

/** Comisión en la moneda de la operación y su equivalente en dólares y bolivianos. */
export function computeCommission(i: CommissionInput): CommissionResult {
  const error = commissionError(i);
  if (error) return { commission: 0, usd: 0, bob: 0, pct: 0, ownerNet: 0, ownerNetLabel: '', error };
  const pct = toPct(i.operation, i.value);
  const commission = r2((i.price * pct) / 100);
  const usd = i.currency === 'USD' ? commission : r2(commission / i.rate);
  const bob = i.currency === 'BOB' ? commission : r2(commission * i.rate);
  const ownerNet = i.operation === 'RENT' ? r2(i.price * 12 - commission) : r2(i.price - commission);
  const ownerNetLabel = i.operation === 'RENT' ? 'El propietario recibe en el primer año' : i.operation === 'ANTICRETICO' ? 'El propietario recibe del anticrético' : 'El propietario recibe de la venta';
  return { commission, usd, bob, pct, ownerNet, ownerNetLabel, error: null };
}

export type AgreementInput = {
  company: string; agentName: string; ownerName: string; ownerDocId?: string | null;
  property: string; address?: string | null; operation: CaptationOp; price: number; currency: Money;
  pct: number; isExclusive: boolean; endsAt?: Date | null; days?: number | null; extra?: string | null; city?: string | null;
};
const OP_TEXT: Record<CaptationOp, { verb: string; priceLabel: string }> = {
  SALE: { verb: 'la venta', priceLabel: 'Precio de venta' },
  RENT: { verb: 'el alquiler', priceLabel: 'Alquiler mensual' },
  ANTICRETICO: { verb: 'el anticrético', priceLabel: 'Monto del anticrético' },
};
export const fmtMoney = (n: number, c: Money) => `${c === 'USD' ? 'USD' : 'Bs'} ${n.toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Texto de la comisión según la operación ("3 % del precio de venta", "1 mes de alquiler"). */
export function commissionText(op: CaptationOp, pct: number) {
  if (op === 'RENT') {
    const months = fromPct(op, pct);
    return `${months.toLocaleString('es-BO')} ${months === 1 ? 'mes' : 'meses'} de alquiler`;
  }
  return `${pct.toLocaleString('es-BO')} % ${op === 'SALE' ? 'del precio de venta' : 'del monto del anticrético'}`;
}

/** Cláusulas del acuerdo de trabajo (compromiso de palabra, no contrato). */
export function agreementClauses(a: AgreementInput): Array<{ title: string; text: string }> {
  const op = OP_TEXT[a.operation];
  const commission = r2((a.price * a.pct) / 100);
  const term = a.endsAt
    ? `hasta el ${a.endsAt.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    : a.days ? `por ${a.days} días desde la firma` : 'por el tiempo que ambas partes acuerden';
  const clauses = [
    { title: 'Objeto', text: `${a.ownerName}${a.ownerDocId ? `, con documento ${a.ownerDocId},` : ''} encarga a ${a.company}, a través de su agente ${a.agentName}, la promoción y gestión de ${op.verb} del inmueble "${a.property}"${a.address ? ` ubicado en ${a.address}` : ''}.` },
    { title: 'Precio', text: `${op.priceLabel}: ${fmtMoney(a.price, a.currency)}. Cualquier cambio de precio se acordará por escrito entre ambas partes.` },
    { title: 'Comisión', text: `La comisión de ${a.company} es de ${commissionText(a.operation, a.pct)} (${fmtMoney(commission, a.currency)} al precio indicado) y se paga solo si la operación se concreta.` },
    { title: 'Exclusividad', text: a.isExclusive ? `El propietario encarga la gestión en exclusiva a ${a.company} ${term}.` : `La gestión no es exclusiva: el propietario puede ofrecer el inmueble por otros medios. El acuerdo rige ${term}.` },
    { title: 'Qué hace la inmobiliaria', text: 'Fotografía y publica el inmueble en su portal y redes, atiende y filtra a los interesados, coordina las visitas, informa al propietario de cada avance y acompaña la negociación y los trámites hasta la entrega.' },
    { title: 'Qué hace el propietario', text: 'Brinda información veraz del inmueble, facilita las visitas acordadas y entrega la documentación necesaria (folio real, impuestos al día y documentos de identidad).' },
  ];
  if (a.extra?.trim()) clauses.push({ title: 'Acuerdos adicionales', text: a.extra.trim() });
  return clauses;
}

export const AGREEMENT_NOTE = 'Este documento es un acuerdo de trabajo: deja por escrito lo conversado entre las partes. No es un contrato legal vinculante ni reemplaza la autorización notariada cuando corresponda.';
