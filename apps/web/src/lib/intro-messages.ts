/**
 * Mensajes de presentación del agente para un propietario del que aún no se sabe el nombre.
 * Cada mensaje combina 5 partes: saludo × presentación × propuesta (según la operación) × experiencia × invitación.
 * 5 × 5 × 8 × 1 × 5 = 1.000 mensajes distintos por operación.
 */
export type IntroOp = "SALE" | "RENT" | "ANTICRETICO";

const GREETINGS = [
  "¡Hola! Buen día, espero que se encuentre muy bien.",
  "Hola, ¿qué tal? Le saludo con mucho gusto.",
  "¡Buen día! Un gusto saludarle.",
  "Hola, muy buenas. Espero no interrumpirle.",
  "¡Hola! Gracias por tomarse un momento para leer este mensaje.",
];

const INTROS = [
  "Mi nombre es {agent} y soy asesor inmobiliario en {company}.",
  "Le escribe {agent}, agente inmobiliario de {company}.",
  "Soy {agent}, de {company}, y me dedico a acompañar a propietarios de la zona.",
  "Me presento: soy {agent}, asesor de {company}, inmobiliaria de confianza en la ciudad.",
  "Le saluda {agent}, del equipo comercial de {company}.",
];

const VALUE: Record<IntroOp, string[]> = {
  SALE: [
    "Ayudo a propietarios a vender su inmueble al mejor precio del mercado y en el menor tiempo posible.",
    "Me especializo en la venta de casas, departamentos y terrenos, desde la valuación hasta la firma en notaría.",
    "Si está pensando en vender, puedo prepararle sin costo un estudio del precio de su propiedad con comparables reales de la zona.",
    "Trabajo con compradores ya calificados que buscan inmuebles como el suyo, así su venta avanza más rápido.",
    "Me encargo de todo el proceso de venta: fotos profesionales, publicidad, visitas, negociación y trámites legales.",
    "Muchos propietarios pierden meses con un precio mal ubicado; yo le ayudo a definir el precio de venta correcto desde el primer día.",
    "Vendo propiedades con un plan de marketing completo: portal, redes sociales, letreros con QR y base de clientes.",
    "Mi trabajo es que usted venda tranquilo: filtro a los interesados y solo le presento ofertas serias.",
  ],
  RENT: [
    "Ayudo a propietarios a alquilar su inmueble rápido y con inquilinos confiables.",
    "Me especializo en alquileres: encuentro al inquilino, verifico sus referencias y preparo el contrato.",
    "Si su propiedad está vacía, puedo ayudarle a alquilarla al precio justo del mercado y sin perder meses de renta.",
    "Trabajo con una cartera de personas y empresas que buscan alquilar en la zona, así su inmueble no queda desocupado.",
    "Me encargo de todo el alquiler: publicidad, visitas, evaluación del inquilino, contrato y entrega con inventario.",
    "Le asesoro para fijar un alquiler competitivo que atraiga buenos inquilinos sin dejar dinero sobre la mesa.",
    "Publico su inmueble en alquiler en nuestro portal y redes con buenas fotos, y coordino las visitas para que usted no pierda tiempo.",
    "Mi objetivo es que usted reciba su alquiler puntual y sin dolores de cabeza, con un inquilino bien evaluado.",
  ],
  ANTICRETICO: [
    "Ayudo a propietarios a dar su inmueble en anticrético de forma segura y con el monto adecuado.",
    "Me especializo en anticréticos: busco al interesado, reviso su capacidad y acompaño el contrato ante notario.",
    "Si necesita liquidez sin vender su propiedad, el anticrético puede ser una buena opción y yo le explico cómo funciona.",
    "Trabajo con personas que buscan anticrético en la zona y ya tienen el monto disponible.",
    "Me encargo de todo el proceso del anticrético: valuación del monto, publicidad, visitas, contrato y registro en Derechos Reales.",
    "Le asesoro para fijar un monto de anticrético competitivo y unas condiciones claras para ambas partes.",
    "Publico su inmueble en anticrético en nuestro portal y redes, y coordino las visitas solo con interesados serios.",
    "Mi objetivo es que su anticrético quede bien hecho: con contrato notariado, registro y plazos claros.",
  ],
};

const EXPERIENCE = "En {company} cuidamos cada detalle para que el proceso sea transparente de principio a fin.";

const CLOSINGS = [
  "¿Le gustaría que conversemos unos minutos esta semana? Con gusto le visito o le llamo.",
  "Si le interesa, puedo pasar a conocer su propiedad sin ningún compromiso. ¿Qué día le queda mejor?",
  "Quedo atento a su respuesta para coordinar una reunión cuando le sea cómodo.",
  "Si me comparte algunos datos de su inmueble, le preparo una propuesta sin costo.",
  "¿Puedo llamarle para contarle cómo trabajamos? Serán solo cinco minutos.",
];

export const INTRO_TOTAL = GREETINGS.length * INTROS.length * VALUE.SALE.length * CLOSINGS.length;

/** Mensaje número `n` (0 a 999) de una operación. */
export function introMessage(op: IntroOp, n: number, agent: string, company: string) {
  const i = ((n % INTRO_TOTAL) + INTRO_TOTAL) % INTRO_TOTAL;
  const g = i % GREETINGS.length;
  const p = Math.floor(i / GREETINGS.length) % INTROS.length;
  const v = Math.floor(i / (GREETINGS.length * INTROS.length)) % VALUE[op].length;
  const c = Math.floor(i / (GREETINGS.length * INTROS.length * VALUE[op].length)) % CLOSINGS.length;
  const fill = (t: string) => t.replaceAll("{agent}", agent).replaceAll("{company}", company);
  return [GREETINGS[g], fill(INTROS[p]), VALUE[op][v], fill(EXPERIENCE), CLOSINGS[c]].join(" ");
}

/**
 * Recorre los 1.000 mensajes en un orden mezclado y sin repetir: empieza en un punto al azar
 * y avanza con un salto que no comparte divisores con 1.000 (así pasa por todos antes de repetir).
 */
const STRIDES = [7, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139];
export function randomWalk(seed = Math.random()) {
  const start = Math.floor(seed * INTRO_TOTAL);
  const stride = STRIDES[Math.floor(seed * 1e6) % STRIDES.length];
  return (step: number) => (start + step * stride) % INTRO_TOTAL;
}
