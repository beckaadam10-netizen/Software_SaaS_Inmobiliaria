"use client";

import { useState, type FormEvent } from "react";
import { DataTable, Td } from "@/components/finance";
import { Badge, Button, Card, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select, type Tone } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { invoicePdfUrl } from "@/lib/images";
import { fmtDate, INVOICE_STATUS, money, todayInput } from "@/lib/labels";

type Item = { description: string; quantity: number; unitPrice: number; amount?: number };
type Invoice = { id: string; number: number | null; date: string; customerName: string; customerTaxId: string; currency: string; items: Item[]; total: number; taxAmount: number; net: number; taxRate: number; status: string; fiscalStatus: string; voidReason: string | null };
type Data = { items: Invoice[]; totals: Record<string, { total: number; tax: number }>; taxRate: number; fiscalProvider: string | null };
const TONE: Record<string, Tone> = { DRAFT: "amber", ISSUED: "green", VOIDED: "neutral" };

function InvoiceForm({ taxRate, onDone, onCancel }: { taxRate: number; onDone: () => void; onCancel: () => void }) {
  const [items, setItems] = useState<Array<{ description: string; quantity: string; unitPrice: string }>>([{ description: "", quantity: "1", unitPrice: "" }]);
  const [cur, setCur] = useState("BOB");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const total = Math.round(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0) * 100) / 100;
  const tax = Math.round(total * taxRate) / 100;
  const set = (n: number, patch: Partial<(typeof items)[number]>) => setItems(items.map((it, i) => (i === n ? { ...it, ...patch } : it)));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { date, customerName, customerTaxId } = formData(e.currentTarget);
    setSaving(true); setError(null);
    try {
      await api("/invoices", { method: "POST", json: { date, customerName, customerTaxId, currency: cur, items } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
      <Field label="Cliente (nombre o razón social)" className="sm:col-span-2"><Input name="customerName" required maxLength={150} /></Field>
      <Field label="NIT o CI"><Input name="customerTaxId" required maxLength={20} /></Field>
      <Field label="Fecha"><Input name="date" type="date" required defaultValue={todayInput()} /></Field>
      <Field label="Moneda"><Select options={{ BOB: "Bolivianos", USD: "Dólares" }} value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
      <fieldset className="sm:col-span-3">
        <legend className="mb-2 text-sm font-medium text-ink">Conceptos</legend>
        <div className="flex flex-col gap-2">
          {items.map((it, n) => (
            <div key={n} className="grid grid-cols-[1fr_4.5rem_7rem_auto] gap-2">
              <Input aria-label={`Concepto ${n + 1}`} placeholder="Comisión por intermediación" required maxLength={200} value={it.description} onChange={(e) => set(n, { description: e.target.value })} />
              <Input aria-label={`Cantidad ${n + 1}`} type="number" min="0.01" step="0.01" required value={it.quantity} onChange={(e) => set(n, { quantity: e.target.value })} />
              <Input aria-label={`Precio unitario ${n + 1}`} type="number" min="0.01" step="0.01" required placeholder="Precio" value={it.unitPrice} onChange={(e) => set(n, { unitPrice: e.target.value })} />
              <Button variant="ghost" aria-label={`Quitar concepto ${n + 1}`} disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== n))}>×</Button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems([...items, { description: "", quantity: "1", unitPrice: "" }])} className="mt-2 text-sm font-semibold text-link hover:underline">Agregar concepto</button>
      </fieldset>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-xl bg-surface p-4 text-sm sm:col-span-3">
        <dt className="text-ink/75">Importe sin IVA</dt><dd className="text-right tabular-nums text-ink">{money(total - tax, cur)}</dd>
        <dt className="text-ink/75">IVA incluido ({taxRate} %)</dt><dd className="text-right tabular-nums text-ink">{money(tax, cur)}</dd>
        <dt className="font-semibold text-ink">Total</dt><dd className="text-right font-bold tabular-nums text-ink">{money(total, cur)}</dd>
      </dl>
      <div className="sm:col-span-3">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} label="Guardar borrador" />
      </div>
    </form>
  );
}

export default function InvoicesPage() {
  const state = useFetch<Data>("/invoices");
  const [modal, setModal] = useState<"new" | { voiding: Invoice } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = () => { setModal(null); state.reload(); };

  async function issue(i: Invoice) {
    setError(null);
    try {
      await api(`/invoices/${i.id}/issue`, { method: "POST" });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function voidIt(e: FormEvent<HTMLFormElement>, i: Invoice) {
    e.preventDefault();
    try {
      await api(`/invoices/${i.id}/void`, { method: "POST", json: formData(e.currentTarget) });
      done();
    } catch (err) {
      setError(errorText(err));
      setModal(null);
    }
  }

  return (
    <>
      <PageHeader title="Facturas" subtitle="Facturas que tu inmobiliaria emite a sus clientes. El IVA va incluido en el precio.">
        <Button onClick={() => setModal("new")}>Nueva factura</Button>
      </PageHeader>
      <Loader state={state}>
        {(d) => (
          <>
            {!d.fiscalProvider && (
              <p className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning ring-1 ring-warning/40">
                <span className="font-semibold">Estas facturas aún no son facturas electrónicas.</span> Para que tengan validez fiscal hay que conectar el sistema con Impuestos Nacionales (SIAT), un trámite que hace cada empresa. Mientras tanto sirven como control interno y el PDF lo indica.
              </p>
            )}
            <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
            {Object.keys(d.totals).length > 0 && (
              <div className="mb-6 grid gap-4 sm:grid-cols-2">
                {Object.entries(d.totals).map(([cur, t]) => (
                  <Card key={cur}>
                    <h2 className="text-sm font-semibold text-ink">Facturado en {cur === "BOB" ? "bolivianos" : "dólares"}</h2>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{money(t.total, cur)}</p>
                    <p className="text-sm text-ink/70">IVA incluido: {money(t.tax, cur)} · solo facturas emitidas y vigentes</p>
                  </Card>
                ))}
              </div>
            )}
            {d.items.length === 0 ? <Empty title="Aún no hay facturas">Crea un borrador, revísalo y emítelo: al emitir recibe su número correlativo.</Empty> : (
              <DataTable head={["Número", "Fecha", "Cliente", { label: "Total", num: true }, { label: "IVA", num: true }, "Estado", ""]} minWidth={820}>
                {d.items.map((i) => (
                  <tr key={i.id}>
                    <Td strong>{i.number ? String(i.number).padStart(6, "0") : "—"}</Td>
                    <Td>{fmtDate(i.date)}</Td>
                    <Td><span className="font-medium text-ink">{i.customerName}</span><span className="block text-xs text-ink/65">NIT/CI {i.customerTaxId}{i.voidReason ? ` · Anulada: ${i.voidReason}` : ""}</span></Td>
                    <Td num strong>{money(i.total, i.currency)}</Td>
                    <Td num>{money(i.taxAmount, i.currency)}</Td>
                    <Td><Badge tone={TONE[i.status]}>{INVOICE_STATUS[i.status]}</Badge></Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        <a href={invoicePdfUrl(i.id)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg border border-ink/20 bg-white px-3 text-sm font-semibold text-ink hover:bg-ink/5">PDF</a>
                        {i.status === "DRAFT" && <Button small onClick={() => issue(i)}>Emitir</Button>}
                        {i.status !== "VOIDED" && <Button small variant="danger" onClick={() => setModal({ voiding: i })}>Anular</Button>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </DataTable>
            )}
            {modal === "new" && <Modal wide title="Nueva factura" onClose={() => setModal(null)}><InvoiceForm taxRate={d.taxRate} onCancel={() => setModal(null)} onDone={done} /></Modal>}
          </>
        )}
      </Loader>
      {modal && modal !== "new" && (
        <Modal title={`Anular factura${modal.voiding.number ? ` ${String(modal.voiding.number).padStart(6, "0")}` : ""}`} onClose={() => setModal(null)}>
          <form onSubmit={(e) => voidIt(e, modal.voiding)}>
            <Field label="Motivo" hint="La factura no se borra: queda anulada y conserva su número."><Input name="reason" required maxLength={190} /></Field>
            <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancelar</Button><Button type="submit" variant="danger">Anular factura</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
