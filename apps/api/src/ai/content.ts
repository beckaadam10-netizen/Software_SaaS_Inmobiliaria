/** Contenido de marketing de una propiedad. Solo usa datos que ya son públicos en el portal. */
export type ContentKind = 'title' | 'description' | 'ad' | 'social' | 'whatsapp' | 'email' | 'cta';
export const CONTENT_KINDS: ContentKind[] = ['title', 'description', 'ad', 'social', 'whatsapp', 'email', 'cta'];

export interface PropertyFacts {
  code: string; title: string; type: string; operation: string; price: number; currency: string; zone: string | null; city: string | null;
  areaM2: number | null; builtM2: number | null; bedrooms: number | null; bathrooms: number | null; parking: number | null;
  features: string[]; description: string | null; company: string; agent: string | null; link: string;
}

const TYPE: Record<string, string> = { HOUSE: 'Casa', APARTMENT: 'Departamento', LAND: 'Terreno', OFFICE: 'Oficina', COMMERCIAL: 'Local comercial', WAREHOUSE: 'Galpón', OTHER: 'Propiedad' };
const OP: Record<string, string> = { SALE: 'en venta', RENT: 'en alquiler', ANTICRETICO: 'en anticrético' };
const price = (f: PropertyFacts) => `${f.currency === 'BOB' ? 'Bs' : 'USD'} ${f.price.toLocaleString('es-BO')}`;
const place = (f: PropertyFacts) => [f.zone, f.city].filter(Boolean).join(', ');

/** Datos de la propiedad en frases cortas; lo que no existe no se menciona. */
export function factLines(f: PropertyFacts): string[] {
  return [
    f.bedrooms ? `${f.bedrooms} ${f.bedrooms === 1 ? 'habitación' : 'habitaciones'}` : null,
    f.bathrooms ? `${f.bathrooms} ${f.bathrooms === 1 ? 'baño' : 'baños'}` : null,
    f.parking ? `${f.parking} ${f.parking === 1 ? 'parqueo' : 'parqueos'}` : null,
    f.builtM2 ? `${f.builtM2} m² construidos` : null,
    f.areaM2 ? `${f.areaM2} m² de terreno` : null,
  ].filter((x): x is string => !!x);
}

/** Texto de respaldo, armado con plantillas, para cuando no hay proveedor de IA configurado. */
export function templateContent(kind: ContentKind, f: PropertyFacts): string {
  const what = `${TYPE[f.type] ?? 'Propiedad'} ${OP[f.operation] ?? ''}`.trim();
  const where = place(f);
  const facts = factLines(f);
  const extras = f.features.slice(0, 4).join(', ').toLowerCase();
  const head = `${what}${where ? ` en ${where}` : ''}`;
  switch (kind) {
    case 'title':
      return `${head}${f.bedrooms ? ` · ${f.bedrooms} hab.` : ''}${f.builtM2 ? ` · ${f.builtM2} m²` : ''}`;
    case 'description':
      return [
        `${head}, por ${price(f)}.`,
        facts.length ? `Cuenta con ${facts.join(', ')}.` : '',
        extras ? `Destaca por: ${extras}.` : '',
        `Agenda tu visita con ${f.company}.`,
      ].filter(Boolean).join(' ');
    case 'ad':
      return [`${head.toUpperCase()}`, price(f), ...facts.map((x) => `• ${x}`), extras ? `• ${extras}` : '', `Más información: ${f.link}`].filter(Boolean).join('\n');
    case 'social':
      return [`${head} por ${price(f)}.`, facts.join(' · '), extras ? `Además: ${extras}.` : '', `Fotos y detalles: ${f.link}`, `#${(f.zone ?? f.city ?? 'inmuebles').replace(/\s+/g, '')} #Inmobiliaria #${(TYPE[f.type] ?? 'Propiedad').replace(/\s+/g, '')}`].filter(Boolean).join('\n');
    case 'whatsapp':
      return `Hola, te comparto esta opción: ${head}, ${price(f)}.${facts.length ? ` ${facts.join(', ')}.` : ''} Mira las fotos aquí: ${f.link}`;
    case 'email':
      return [`Asunto: ${head} por ${price(f)}`, '', 'Hola,', '', `Te escribo para presentarte esta propiedad: ${head}.`, facts.length ? `Tiene ${facts.join(', ')}.` : '', extras ? `También ofrece ${extras}.` : '', '', `Puedes ver las fotos y coordinar una visita aquí: ${f.link}`, '', 'Saludos,', f.agent ?? f.company].filter((x) => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');
    case 'cta':
      return `Agenda hoy tu visita a ${head.toLowerCase()}: ${f.link}`;
  }
}

const KIND_ASK: Record<ContentKind, string> = {
  title: 'un título de anuncio de máximo 70 caracteres',
  description: 'una descripción de 2 párrafos cortos para el portal',
  ad: 'un anuncio breve para clasificados, con viñetas',
  social: 'un texto para Instagram o Facebook con 3 hashtags al final',
  whatsapp: 'un mensaje corto y cordial para WhatsApp',
  email: 'un email con asunto y cuerpo',
  cta: 'una sola frase de llamada a la acción',
};

/** Instrucciones para el proveedor de IA. Los datos van como JSON y se le prohíbe agregar otros. */
export function contentPrompt(kind: ContentKind, f: PropertyFacts, tone?: string) {
  return {
    system:
      'Eres redactor de una inmobiliaria en Bolivia. Escribes en español claro y natural. Usa ÚNICAMENTE los datos del JSON: no inventes características, medidas, ubicaciones ni precios. ' +
      'Si un dato falta, no lo menciones. No uses superlativos sin sustento ni promesas de rentabilidad. Devuelve solo el texto pedido, sin explicaciones.',
    prompt: `Escribe ${KIND_ASK[kind]}${tone ? `, con tono ${tone}` : ''} para esta propiedad:\n${JSON.stringify({ ...f, tipo: TYPE[f.type], operacion: OP[f.operation], precio: price(f) })}`,
  };
}
