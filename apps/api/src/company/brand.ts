/** Colores de marca de una empresa. Solo se aceptan colores sobre los que el texto claro se lee bien. */
const HEX = /^#[0-9a-f]{6}$/i;
const LIGHT_TEXT = '#f1faf7';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
/** Devuelve el motivo por el que el color no sirve, o null si sirve. Los menús y botones llevan texto claro encima. */
export function colorError(hex: string | null | undefined): string | null {
  if (hex == null || hex === '') return null;
  if (!HEX.test(hex)) return 'Usa un color en formato #RRGGBB';
  return contrast(hex, LIGHT_TEXT) >= 4.5 ? null : 'Ese color es muy claro: el texto encima no se leería. Elige un tono más oscuro.';
}

/** Dominio propio válido: sin protocolo, sin ruta, con al menos un punto. */
export function normalizeDomain(raw: string, appDomain: string): string | null {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (d.length > 190 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(d)) return null;
  if (d === appDomain || d.endsWith(`.${appDomain}`) || d.endsWith('.localhost')) return null;
  return d;
}
