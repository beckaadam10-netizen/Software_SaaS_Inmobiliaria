import { rateOn, toBOB } from '../finance/fx.js';

/**
 * Libros de compras y ventas IVA (Bolivia), en bolivianos. Formato de referencia: el definitivo
 * lo pide Impuestos Nacionales al conectar la facturación electrónica.
 */
export const IVA = 13;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const iva = (n: number) => round2((n * IVA) / 100);

export interface SaleInvoice { number: number | null; date: Date; customerName: string; customerTaxId: string; currency: string; total: number; status: string; fiscalCode: string | null }
export interface Purchase { date: Date; supplierTaxId: string; supplierName: string; invoiceNumber: string; authCode: string | null; total: number }

/** Libro de ventas. Las anuladas figuran con importe cero y estado A, como exige el formato. */
export function salesBook(invoices: SaleInvoice[], rates: Array<{ date: Date; rate: number }>) {
  const rows = invoices
    .filter((i) => i.number != null)
    .sort((a, b) => a.number! - b.number!)
    .map((i) => {
      const voided = i.status === 'VOIDED';
      const rate = i.currency === 'USD' ? rateOn(rates, i.date) : null;
      const missingRate = i.currency === 'USD' && !rate;
      const totalBOB = voided || missingRate ? 0 : toBOB(i.total, i.currency, rate?.rate ?? 1);
      return {
        date: i.date, number: i.number!, customerTaxId: i.customerTaxId, customerName: i.customerName, authCode: i.fiscalCode,
        status: voided ? 'A' : 'V', currency: i.currency, original: i.total, rate: rate?.rate ?? null, missingRate,
        total: totalBOB, base: round2(totalBOB - iva(totalBOB)), tax: iva(totalBOB),
      };
    });
  return { rows, total: round2(rows.reduce((s, r) => s + r.total, 0)), tax: round2(rows.reduce((s, r) => s + r.tax, 0)), missingRate: rows.some((r) => r.missingRate) };
}

export function purchasesBook(purchases: Purchase[]) {
  const rows = purchases
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((p) => ({ ...p, base: round2(p.total - iva(p.total)), tax: iva(p.total) }));
  return { rows, total: round2(rows.reduce((s, r) => s + r.total, 0)), tax: round2(rows.reduce((s, r) => s + r.tax, 0)) };
}

/** Débito fiscal (ventas) menos crédito fiscal (compras). Positivo = IVA a pagar; negativo = saldo a favor. */
export function ivaSummary(sales: { tax: number }, purchases: { tax: number }) {
  const balance = round2(sales.tax - purchases.tax);
  return { debit: sales.tax, credit: purchases.tax, balance, toPay: Math.max(0, balance), inFavor: Math.max(0, -balance) };
}

/** Primer y último instante de un mes "2026-10" en hora de Bolivia (UTC-4). */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  return { from: new Date(Date.UTC(y, mo - 1, 1, 4)), to: new Date(Date.UTC(y, mo, 1, 4)) };
}
