import { createHash } from 'node:crypto';

/** Lectura del extracto bancario (CSV) y sugerencia de conciliación. Funciones puras. */
export interface StatementLine { date: Date; description: string; reference: string | null; amount: number; fingerprint: string }
export interface ParseResult { lines: StatementLine[]; errors: string[] }

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const COLUMNS: Record<string, string[]> = {
  date: ['fecha', 'date', 'fechamovimiento', 'fechatransaccion', 'fechaoperacion'],
  description: ['descripcion', 'glosa', 'detalle', 'concepto', 'description', 'referenciaglosa'],
  reference: ['referencia', 'nrodocumento', 'documento', 'numero', 'nrotransaccion', 'reference', 'comprobante'],
  amount: ['monto', 'importe', 'amount', 'valor'],
  debit: ['debito', 'debe', 'cargo', 'retiro', 'egreso', 'debit', 'debitos'],
  credit: ['credito', 'haber', 'abono', 'deposito', 'ingreso', 'credit', 'creditos'],
};

/** Separa una línea CSV respetando comillas. */
function split(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Acepta 1.234,56 · 1,234.56 · 1234.56 · (120,00) · -120 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,()-]/g, '');
  if (!/\d/.test(s)) return null;
  const negative = s.includes('-') || s.startsWith('(');
  s = s.replace(/[()-]/g, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  // El último separador es el decimal si deja 1 o 2 dígitos detrás; el otro es de miles.
  const dec = Math.max(lastComma, lastDot);
  const decimals = dec >= 0 ? s.length - dec - 1 : 0;
  const isDecimal = dec >= 0 && decimals <= 2 && (lastComma < 0 || lastDot < 0 || decimals > 0);
  const digits = isDecimal ? `${s.slice(0, dec).replace(/[.,]/g, '')}.${s.slice(dec + 1)}` : s.replace(/[.,]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** Acepta 31/12/2026, 31-12-2026, 31/12/26 y 2026-12-31. Las fechas de un extracto son día/mes/año. */
export function parseDate(raw: string): Date | null {
  const s = raw.trim().split(/[ T]/)[0];
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3].length === 2 ? `20${m[3]}` : m[3])];
  else return null;
  const date = new Date(Date.UTC(y, mo - 1, d, 12));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

export function parseStatement(csv: string): ParseResult {
  const rows = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (rows.length < 2) return { lines: [], errors: ['El archivo no tiene movimientos'] };
  const sep = [';', '\t', ','].sort((a, b) => rows[0].split(b).length - rows[0].split(a).length)[0];
  const header = split(rows[0], sep).map(norm);
  const col = (key: string) => header.findIndex((h) => COLUMNS[key].includes(h));
  const idx = { date: col('date'), description: col('description'), reference: col('reference'), amount: col('amount'), debit: col('debit'), credit: col('credit') };
  if (idx.date < 0) return { lines: [], errors: ['Falta la columna de fecha (por ejemplo "Fecha")'] };
  if (idx.amount < 0 && idx.debit < 0 && idx.credit < 0) return { lines: [], errors: ['Falta la columna de monto (por ejemplo "Monto", o "Débito" y "Crédito")'] };

  const lines: StatementLine[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();
  rows.slice(1).forEach((raw, i) => {
    const c = split(raw, sep);
    const date = parseDate(c[idx.date] ?? '');
    let amount: number | null;
    if (idx.amount >= 0) amount = parseAmount(c[idx.amount] ?? '');
    else {
      const debit = idx.debit >= 0 ? parseAmount(c[idx.debit] ?? '') : null;
      const credit = idx.credit >= 0 ? parseAmount(c[idx.credit] ?? '') : null;
      amount = debit == null && credit == null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (!date || amount == null || amount === 0) {
      errors.push(`Fila ${i + 2}: ${!date ? 'fecha no reconocida' : 'monto no reconocido'}`);
      return;
    }
    const description = (idx.description >= 0 ? c[idx.description] : '') || 'Sin descripción';
    const reference = idx.reference >= 0 && c[idx.reference] ? c[idx.reference].slice(0, 80) : null;
    amount = Math.round(amount * 100) / 100;
    // Dos líneas idénticas el mismo día son movimientos distintos: se distinguen por su orden.
    const base = `${date.toISOString().slice(0, 10)}|${amount}|${description}|${reference ?? ''}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    lines.push({ date, description: description.slice(0, 190), reference, amount, fingerprint: createHash('sha256').update(`${base}|${n}`).digest('hex') });
  });
  return { lines, errors: errors.slice(0, 20) };
}

export interface Candidate { id: string; kind: 'INCOME' | 'EXPENSE'; amount: number; date: Date; description: string }
const DAY = 864e5;
/** Movimientos que podrían corresponder a una línea: mismo sentido e importe, y fecha a 5 días o menos. Primero el más cercano. */
export function suggestMatches(line: { amount: number; date: Date }, candidates: Candidate[], windowDays = 5): Candidate[] {
  const kind = line.amount > 0 ? 'INCOME' : 'EXPENSE';
  const amount = Math.abs(line.amount);
  const gap = (c: Candidate) => Math.abs(c.date.getTime() - line.date.getTime());
  return candidates
    .filter((c) => c.kind === kind && Math.abs(c.amount - amount) < 0.005 && gap(c) <= windowDays * DAY + DAY / 2)
    .sort((a, b) => gap(a) - gap(b))
    .slice(0, 5);
}
