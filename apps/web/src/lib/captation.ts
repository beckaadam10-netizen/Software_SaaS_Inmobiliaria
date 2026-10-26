/**
 * Cálculo de comisión y propuesta al propietario para el paso de Captación.
 * Mismas reglas que apps/api/src/captation/tools.ts: venta y anticrético en %, alquiler en meses (100 % = un mes).
 */
export type Op = "SALE" | "RENT" | "ANTICRETICO";
export type Cur = "USD" | "BOB";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const toPct = (op: Op, value: number) => r2(op === "RENT" ? value * 100 : value);
export const fromPct = (op: Op, pct: number) => r2(op === "RENT" ? pct / 100 : pct);

export const PRICE_LABEL: Record<Op, string> = { SALE: "Precio de venta", RENT: "Alquiler mensual", ANTICRETICO: "Monto del anticrético" };
export const VALUE_LABEL: Record<Op, string> = { SALE: "Tu comisión (%)", RENT: "Tu comisión (meses de alquiler)", ANTICRETICO: "Tu comisión (%)" };
/** Valores habituales en Bolivia si el expediente no tiene una comisión acordada. */
export const DEFAULT_VALUE: Record<Op, number> = { SALE: 3, RENT: 1, ANTICRETICO: 3 };

export type Calc = { commission: number; usd: number; bob: number; pct: number; ownerNet: number; ownerNetLabel: string; error: string | null };

export function calculate(op: Op, price: number, currency: Cur, value: number, rate: number): Calc {
  const fail = (error: string): Calc => ({ commission: 0, usd: 0, bob: 0, pct: 0, ownerNet: 0, ownerNetLabel: "", error });
  if (!(price > 0)) return fail("Escribe un precio mayor que cero");
  if (!(value >= 0)) return fail("La comisión no puede ser negativa");
  if (op === "RENT" ? value > 12 : value > 100) return fail(op === "RENT" ? "Máximo 12 meses de alquiler" : "El porcentaje no puede superar 100");
  if (!(rate > 0)) return fail("Escribe el tipo de cambio (Bs por 1 USD)");
  const pct = toPct(op, value);
  const commission = r2((price * pct) / 100);
  return {
    commission, pct, error: null,
    usd: currency === "USD" ? commission : r2(commission / rate),
    bob: currency === "BOB" ? commission : r2(commission * rate),
    ownerNet: op === "RENT" ? r2(price * 12 - commission) : r2(price - commission),
    ownerNetLabel: op === "RENT" ? "El propietario recibe en el primer año" : op === "ANTICRETICO" ? "El propietario recibe del anticrético" : "El propietario recibe de la venta",
  };
}

export const fmt = (n: number, c: Cur) => `${c === "USD" ? "USD" : "Bs"} ${n.toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
export const commissionText = (op: Op, value: number) =>
  op === "RENT" ? `${value.toLocaleString("es-BO")} ${value === 1 ? "mes" : "meses"} de alquiler` : `${value.toLocaleString("es-BO")} % ${op === "SALE" ? "del precio de venta" : "del monto del anticrético"}`;

export type ProposalInput = {
  op: Op; price: number; currency: Cur; value: number; calc: Calc; rate: number;
  owner: string | null; agent: string; company: string;
  property: { title: string; zone: string | null; city: string | null; builtM2: number | null; areaM2: number | null; bedrooms: number | null; features: string[] };
  comparables: { count: number; avgPerM2: number | null; min: number | null; max: number | null };
};
const WHAT: Record<Op, string> = { SALE: "venderla", RENT: "alquilarla", ANTICRETICO: "darla en anticrético" };

/** Texto para presentar al propietario: por qué ese precio y qué incluye la comisión. */
export function proposalText(p: ProposalInput) {
  const first = p.owner?.trim().split(/\s+/)[0];
  const place = [p.property.zone, p.property.city].filter(Boolean).join(", ");
  const m2 = p.property.builtM2 ?? p.property.areaM2;
  const perM2 = m2 ? p.price / m2 : null;
  const lines: string[] = [];
  lines.push(`${first ? `Hola ${first}` : "Hola"}, gracias por confiarnos tu propiedad "${p.property.title}"${place ? ` en ${place}` : ""}. Te comparto nuestra propuesta para ${WHAT[p.op]}.`);
  lines.push("");
  lines.push(`PRECIO SUGERIDO: ${fmt(p.price, p.currency)}${p.op === "RENT" ? " por mes" : ""}`);
  const why: string[] = [];
  if (p.comparables.count && p.comparables.avgPerM2 && perM2) {
    const diff = Math.round(((perM2 - p.comparables.avgPerM2) / p.comparables.avgPerM2) * 100);
    why.push(`En la zona tenemos ${p.comparables.count} ${p.comparables.count === 1 ? "inmueble parecido" : "inmuebles parecidos"} a un promedio de ${fmt(Math.round(p.comparables.avgPerM2), p.currency)} por m²; tu propiedad queda en ${fmt(Math.round(perM2), p.currency)} por m² (${diff === 0 ? "igual al promedio" : `${Math.abs(diff)} % ${diff > 0 ? "por encima" : "por debajo"} del promedio`}).`);
  } else if (perM2) {
    why.push(`Equivale a ${fmt(Math.round(perM2), p.currency)} por m², en línea con lo que hoy se ofrece en la zona.`);
  }
  if (p.property.bedrooms) why.push(`Sus ${p.property.bedrooms} ${p.property.bedrooms === 1 ? "habitación" : "habitaciones"}${m2 ? ` y ${m2} m²` : ""} responden a lo que más piden nuestros clientes.`);
  if (p.property.features.length) why.push(`Destacaremos lo que la hace distinta: ${p.property.features.slice(0, 4).join(", ")}.`);
  why.push("Un precio bien ubicado desde el inicio atrae más visitas en las primeras semanas, que es cuando la propiedad tiene más fuerza.");
  lines.push(...why.map((w) => `• ${w}`));
  lines.push("");
  lines.push(`NUESTRA COMISIÓN: ${commissionText(p.op, p.value)} = ${fmt(p.calc.commission, p.currency)}${p.currency === "USD" ? ` (Bs ${p.calc.bob.toLocaleString("es-BO")})` : ` (USD ${p.calc.usd.toLocaleString("es-BO")})`}. Solo se paga si la operación se concreta.`);
  lines.push(`${p.calc.ownerNetLabel}: ${fmt(p.calc.ownerNet, p.currency)}.`);
  lines.push("");
  lines.push("POR QUÉ VALE LA PENA:");
  lines.push("• Fotos profesionales y publicación en nuestro portal, redes sociales y código QR para letreros.");
  lines.push("• Filtramos a los interesados: solo visitan quienes pueden concretar.");
  lines.push("• Coordinamos las visitas, te informamos de cada avance y negociamos para cuidar tu precio.");
  lines.push("• Te acompañamos en los trámites legales hasta la entrega.");
  lines.push("");
  lines.push(`Quedo atento para avanzar. ${p.agent}, ${p.company}.`);
  return lines.join("\n");
}
