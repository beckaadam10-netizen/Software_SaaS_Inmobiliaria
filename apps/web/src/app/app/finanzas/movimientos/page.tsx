"use client";

import { useState, type FormEvent } from "react";
import { DataTable, Td } from "@/components/finance";
import { Badge, Button, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { CATEGORY, EXPENSE_CATEGORY, fmtDate, INCOME_CATEGORY, money, PAY_METHOD, todayInput, TX_KIND } from "@/lib/labels";

type Tx = { id: string; kind: string; category: string; amount: string; currency: string; date: string; description: string; method: string; voidedAt: string | null; voidReason: string | null; case: { id: string; code: string } | null };

function TxForm({ kind, onDone, onCancel }: { kind: "INCOME" | "EXPENSE"; onDone: () => void; onCancel: () => void }) {
  const cases = useFetch<Array<{ id: string; code: string; property: { title: string } }>>("/cases");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [today] = useState(todayInput);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/finance/transactions", { method: "POST", json: { ...formData(e.currentTarget), kind } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Descripción" className="sm:col-span-2"><Input name="description" required maxLength={191} /></Field>
      <Field label="Categoría"><Select name="category" options={kind === "INCOME" ? INCOME_CATEGORY : EXPENSE_CATEGORY} defaultValue={kind === "INCOME" ? "FEE" : "ADVERTISING"} /></Field>
      <Field label="Fecha"><Input name="date" type="date" required defaultValue={today} /></Field>
      <Field label="Monto"><Input name="amount" type="number" min={0.01} step="0.01" required /></Field>
      <Field label="Moneda"><Select name="currency" options={{ BOB: "Bolivianos (Bs)", USD: "Dólares (USD)" }} /></Field>
      <Field label="Forma de pago"><Select name="method" options={PAY_METHOD} /></Field>
      <Field label="Expediente" hint="Opcional: para medir la rentabilidad de la operación.">
        <Select name="caseId" placeholder="Ninguno" options={(cases.data ?? []).map((c) => [c.id, `${c.code} · ${c.property.title}`] as [string, string])} />
      </Field>
      <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={onCancel} saving={saving} label={kind === "INCOME" ? "Registrar ingreso" : "Registrar gasto"} /></div>
    </form>
  );
}

export default function TransactionsPage() {
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [creating, setCreating] = useState<"INCOME" | "EXPENSE" | null>(null);
  const [voiding, setVoiding] = useState<Tx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const params = new URLSearchParams({ ...(kind && { kind }), ...(from && { from }), ...(to && { to }) });
  const state = useFetch<Tx[]>(`/finance/transactions?${params}`);

  async function doVoid(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/finance/transactions/${voiding!.id}/void`, { method: "POST", json: formData(e.currentTarget) });
      setVoiding(null);
      state.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHeader title="Ingresos y gastos" subtitle="Todo el dinero que entró o salió. Un movimiento no se borra: se anula dejando el motivo.">
        <Button variant="ghost" onClick={() => setCreating("EXPENSE")}>Registrar gasto</Button>
        <Button onClick={() => setCreating("INCOME")}>Registrar ingreso</Button>
      </PageHeader>
      <div className="mb-5 grid gap-2 sm:grid-cols-[180px_auto_auto_1fr]">
        <Select options={TX_KIND} placeholder="Ingresos y gastos" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo" />
        <label className="flex items-center gap-2 text-sm text-ink/80">Desde <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-ink/80">Hasta <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <Loader state={state}>
        {(rows) =>
          rows.length === 0 ? <Empty title="No hay movimientos">Prueba con otro periodo o registra el primero.</Empty> : (
            <DataTable head={["Fecha", "Tipo", "Categoría", "Descripción", "Forma de pago", { label: "Monto", num: true }, ""]} minWidth={860}>
              {rows.map((t) => (
                <tr key={t.id} className={t.voidedAt ? "opacity-60" : ""}>
                  <Td>{fmtDate(t.date)}</Td>
                  <Td><Badge tone={t.voidedAt ? "neutral" : t.kind === "INCOME" ? "green" : "amber"}>{t.voidedAt ? "Anulado" : TX_KIND[t.kind]}</Badge></Td>
                  <Td>{CATEGORY[t.category] ?? t.category}</Td>
                  <Td>{t.description}{t.case ? <span className="text-ink/60"> · {t.case.code}</span> : null}{t.voidReason ? <span className="block text-xs">Motivo: {t.voidReason}</span> : null}</Td>
                  <Td>{PAY_METHOD[t.method]}</Td>
                  <Td num strong><span className={t.voidedAt ? "line-through" : ""}>{t.kind === "EXPENSE" ? "−" : ""}{money(t.amount, t.currency)}</span></Td>
                  <Td className="text-right">{!t.voidedAt && <Button small variant="ghost" onClick={() => { setError(null); setVoiding(t); }}>Anular</Button>}</Td>
                </tr>
              ))}
            </DataTable>
          )
        }
      </Loader>
      {creating && (
        <Modal title={creating === "INCOME" ? "Registrar ingreso" : "Registrar gasto"} onClose={() => setCreating(null)}>
          <TxForm kind={creating} onCancel={() => setCreating(null)} onDone={() => { setCreating(null); state.reload(); }} />
        </Modal>
      )}
      {voiding && (
        <Modal title="Anular movimiento" onClose={() => setVoiding(null)}>
          <form onSubmit={doVoid} className="grid gap-4">
            <p className="text-sm text-ink/80">{voiding.description} · {money(voiding.amount, voiding.currency)}. Si pertenece a una cuenta, su saldo vuelve a quedar pendiente.</p>
            <Field label="Motivo de la anulación"><Input name="reason" required maxLength={190} /></Field>
            <ErrorNote>{error}</ErrorNote>
            <FormActions onCancel={() => setVoiding(null)} saving={false} label="Anular movimiento" />
          </form>
        </Modal>
      )}
    </>
  );
}
