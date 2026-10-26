"use client";

import { useState, type FormEvent } from "react";
import { DataTable, Td } from "@/components/finance";
import { canFinance, useSession } from "@/components/Shell";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { taxBookUrl } from "@/lib/images";
import { fmtDate, money, todayInput } from "@/lib/labels";

type Sale = { number: number; date: string; customerTaxId: string; customerName: string; status: "V" | "A"; currency: string; original: number; rate: number | null; missingRate: boolean; total: number; base: number; tax: number };
type Purchase = { id: string; date: string; supplierTaxId: string; supplierName: string; invoiceNumber: string; authCode: string | null; total: number; base: number; tax: number };
type Books = { month: string; sales: { rows: Sale[]; total: number; tax: number; missingRate: boolean }; purchases: { rows: Purchase[]; total: number; tax: number }; summary: { debit: number; credit: number; balance: number; toPay: number; inFavor: number } };
const bs = (n: number) => money(n, "BOB");

function Exports({ month, book }: { month: string; book: "sales" | "purchases" }) {
  return (
    <span className="flex gap-1.5">
      {(["xlsx", "csv", "pdf"] as const).map((f) => (
        <a key={f} href={taxBookUrl(month, book, f)} className="inline-flex h-8 items-center rounded-lg border border-ink/20 bg-white px-3 text-xs font-semibold uppercase text-ink hover:bg-ink/5">{f === "xlsx" ? "Excel" : f}</a>
      ))}
    </span>
  );
}

export default function TaxBooksPage() {
  const user = useSession();
  const [month, setMonth] = useState(() => todayInput().slice(0, 7));
  const state = useFetch<Books>(`/tax/books?month=${month}`);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api("/tax/purchases", { method: "POST", json: formData(e.currentTarget) });
      setAdding(false); state.reload();
    } catch (err) {
      setError(errorText(err));
    }
    setSaving(false);
  }
  async function remove(id: string) {
    await api(`/tax/purchases/${id}`, { method: "DELETE" }).catch((e) => setError(errorText(e)));
    state.reload();
  }

  return (
    <>
      <PageHeader title="Libros de compras y ventas IVA" subtitle="En bolivianos. Las ventas salen de tus facturas emitidas; las compras, de las facturas de proveedores que registres.">
        <Field label="Mes"><Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
      </PageHeader>
      <div className="mb-4"><ErrorNote>{!adding && error}</ErrorNote></div>
      <Loader state={state}>
        {(b) => (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><p className="text-sm text-ink/70">Débito fiscal (ventas)</p><p className="text-2xl font-bold tabular-nums text-ink">{bs(b.summary.debit)}</p></Card>
              <Card><p className="text-sm text-ink/70">Crédito fiscal (compras)</p><p className="text-2xl font-bold tabular-nums text-ink">{bs(b.summary.credit)}</p></Card>
              <Card className={b.summary.toPay > 0 ? "!bg-brand-deep text-on-brand" : ""}>
                <p className={`text-sm ${b.summary.toPay > 0 ? "text-on-brand/80" : "text-ink/70"}`}>{b.summary.toPay > 0 ? "IVA a pagar del mes" : "Saldo a favor"}</p>
                <p className="text-2xl font-bold tabular-nums">{bs(b.summary.toPay > 0 ? b.summary.toPay : b.summary.inFavor)}</p>
              </Card>
            </div>
            {b.sales.missingRate && <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning ring-1 ring-warning/40">Hay facturas en dólares sin tipo de cambio para su fecha: figuran en cero. Registra el tipo de cambio en el Resumen de Finanzas.</p>}

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-ink">Libro de ventas</h2><Exports month={b.month} book="sales" /></div>
              {b.sales.rows.length === 0 ? <p className="text-sm text-ink/65">No hay facturas emitidas en este mes.</p> : (
                <DataTable head={["Fecha", "N°", "Estado", "Cliente", { label: "Importe Bs", num: true }, { label: "Débito fiscal", num: true }]} minWidth={720}>
                  {b.sales.rows.map((r) => (
                    <tr key={r.number}>
                      <Td>{fmtDate(r.date)}</Td><Td strong>{String(r.number).padStart(6, "0")}</Td>
                      <Td><Badge tone={r.status === "A" ? "neutral" : "green"}>{r.status === "A" ? "Anulada" : "Válida"}</Badge></Td>
                      <Td><span className="text-ink">{r.customerName}</span><span className="block text-xs text-ink/65">NIT/CI {r.customerTaxId}{r.currency === "USD" ? ` · ${money(r.original, "USD")}${r.rate ? ` × ${r.rate}` : " · sin tipo de cambio"}` : ""}</span></Td>
                      <Td num strong>{bs(r.total)}</Td><Td num>{bs(r.tax)}</Td>
                    </tr>
                  ))}
                  <tr className="bg-surface"><Td strong>Total</Td><Td /><Td /><Td /><Td num strong>{bs(b.sales.total)}</Td><Td num strong>{bs(b.sales.tax)}</Td></tr>
                </DataTable>
              )}
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-ink">Libro de compras</h2>
                <span className="flex gap-2"><Exports month={b.month} book="purchases" />{canFinance(user.role) && <Button small onClick={() => { setError(null); setAdding(true); }}>Registrar factura de compra</Button>}</span>
              </div>
              {b.purchases.rows.length === 0 ? <p className="text-sm text-ink/65">No registraste compras con factura en este mes.</p> : (
                <DataTable head={["Fecha", "Proveedor", "N° factura", { label: "Importe Bs", num: true }, { label: "Crédito fiscal", num: true }, ""]} minWidth={720}>
                  {b.purchases.rows.map((r) => (
                    <tr key={r.id}>
                      <Td>{fmtDate(r.date)}</Td>
                      <Td><span className="text-ink">{r.supplierName}</span><span className="block text-xs text-ink/65">NIT {r.supplierTaxId}{r.authCode ? ` · Aut. ${r.authCode}` : ""}</span></Td>
                      <Td>{r.invoiceNumber}</Td><Td num strong>{bs(r.total)}</Td><Td num>{bs(r.tax)}</Td>
                      <Td>{canFinance(user.role) && <Button small variant="danger" onClick={() => remove(r.id)}>Eliminar</Button>}</Td>
                    </tr>
                  ))}
                  <tr className="bg-surface"><Td strong>Total</Td><Td /><Td /><Td num strong>{bs(b.purchases.total)}</Td><Td num strong>{bs(b.purchases.tax)}</Td><Td /></tr>
                </DataTable>
              )}
            </section>
            <p className="text-xs text-ink/65">Formato de referencia para tu contador. El formato oficial lo exige Impuestos Nacionales al conectar la facturación electrónica.</p>
          </div>
        )}
      </Loader>
      {adding && (
        <Modal title="Factura de compra" onClose={() => setAdding(false)}>
          <form onSubmit={add} className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha"><Input name="date" type="date" required defaultValue={todayInput()} /></Field>
            <Field label="Importe total (Bs)"><Input name="total" type="number" required min="0.01" step="0.01" /></Field>
            <Field label="NIT del proveedor"><Input name="supplierTaxId" required maxLength={20} /></Field>
            <Field label="Número de factura"><Input name="invoiceNumber" required maxLength={30} /></Field>
            <Field label="Razón social del proveedor" className="sm:col-span-2"><Input name="supplierName" required maxLength={150} /></Field>
            <Field label="Código de autorización" className="sm:col-span-2"><Input name="authCode" maxLength={100} /></Field>
            <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={() => setAdding(false)} saving={saving} /></div>
          </form>
        </Modal>
      )}
    </>
  );
}
