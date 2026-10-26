/** Cálculo de facturas. En Bolivia el IVA (13 %) va incluido en el precio: no se suma encima. */
export const DEFAULT_TAX_RATE = 13;
export interface InvoiceItem { description: string; quantity: number; unitPrice: number }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function invoiceTotals(items: InvoiceItem[], taxRate = DEFAULT_TAX_RATE) {
  const lines = items.map((i) => ({ ...i, amount: round2(i.quantity * i.unitPrice) }));
  const total = round2(lines.reduce((s, l) => s + l.amount, 0));
  const taxAmount = round2((total * taxRate) / 100);
  return { lines, total, taxRate, taxAmount, net: round2(total - taxAmount) };
}

const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
  'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function below1000(n: number): string {
  if (n === 100) return 'cien';
  const h = HUNDREDS[Math.floor(n / 100)], r = n % 100;
  const rest = r < 30 ? UNITS[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` y ${UNITS[r % 10]}` : ''}`;
  return [h, rest].filter(Boolean).join(' ');
}
function words(n: number): string {
  if (n === 0) return 'cero';
  const millions = Math.floor(n / 1e6), thousands = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  // Antes de "mil" y "millones" se dice "un", no "uno".
  const un = (s: string) => s.replace(/uno$/, 'un').replace(/veintiun$/, 'veintiún');
  return [
    millions ? (millions === 1 ? 'un millón' : `${un(words(millions))} millones`) : '',
    thousands ? (thousands === 1 ? 'mil' : `${un(below1000(thousands))} mil`) : '',
    below1000(rest),
  ].filter(Boolean).join(' ');
}
/** Importe en letras, como exige una factura: "Son: mil doscientos 50/100 bolivianos". */
export function amountInWords(amount: number, currency: string) {
  const whole = Math.floor(round2(amount));
  const cents = Math.round((round2(amount) - whole) * 100);
  const text = words(whole);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} ${String(cents).padStart(2, '0')}/100 ${currency === 'BOB' ? 'bolivianos' : 'dólares'}`;
}
