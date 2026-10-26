"use client";

import { useState, type FormEvent } from "react";
import { DataTable, PaymentForm, Td } from "@/components/finance";
import { Badge, Button, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { ACCOUNT_STATUS, EXPENSE_CATEGORY, fmtDate, money, todayInput } from "@/lib/labels";
import { useAgents } from "@/lib/options";
import { ACCOUNT_TONE } from "@/lib/tones";

type Account = {
  id: string; concept: string; category: string; amount: string; paidAmount: string; currency: string; dueDate: string; status: string; balance: number; daysOverdue: number;
  supplier: string | null; agent: { fullName: string } | null; settlement: { id: string; code: string } | null;
};

function AccountForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const people = useAgents();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [today] = useState(todayInput);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/finance/payables", { method: "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Concepto" className="sm:col-span-2"><Input name="concept" required maxLength={191} /></Field>
      <Field label="Proveedor"><Input name="supplier" maxLength={191} /></Field>
      <Field label="O agente"><Select name="agentId" options={people} placeholder="Ninguno" /></Field>
      <Field label="Categoría"><Select name="category" options={EXPENSE_CATEGORY} defaultValue="SERVICES" /></Field>
      <Field label="Vence el"><Input name="dueDate" type="date" required defaultValue={today} /></Field>
      <Field label="Monto"><Input name="amount" type="number" min={0.01} step="0.01" required /></Field>
      <Field label="Moneda"><Select name="currency" options={{ BOB: "Bolivianos (Bs)", USD: "Dólares (USD)" }} /></Field>
      <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={onCancel} saving={saving} /></div>
    </form>
  );
}

export default function PayablesPage() {
  const state = useFetch<Account[]>("/finance/payables");
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Account | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cancel(id: string) {
    setError(null);
    try {
      await api(`/finance/payables/${id}/cancel`, { method: "POST", json: {} });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="Cuentas por pagar" subtitle="Lo que la inmobiliaria debe a proveedores y agentes. Las liquidaciones aprobadas entran aquí solas.">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="h-4 w-4 accent-brand-teal" /> Solo pendientes
        </label>
        <Button onClick={() => setCreating(true)}>Nueva cuenta por pagar</Button>
      </PageHeader>
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(all) => {
          const rows = all.filter((a) => !onlyOpen || a.status === "PENDING" || a.status === "PARTIAL");
          if (rows.length === 0) return <Empty title="No hay cuentas por pagar" />;
          return (
            <DataTable head={["Concepto", "A quién", "Vencimiento", { label: "Monto", num: true }, { label: "Pagado", num: true }, { label: "Saldo", num: true }, "Estado", ""]} minWidth={920}>
              {rows.map((a) => {
                const open = a.status === "PENDING" || a.status === "PARTIAL";
                return (
                  <tr key={a.id}>
                    <Td strong>{a.concept}<span className="block text-xs font-normal text-ink/65">{EXPENSE_CATEGORY[a.category] ?? a.category}</span></Td>
                    <Td>{a.agent?.fullName ?? a.supplier ?? "—"}</Td>
                    <Td>{fmtDate(a.dueDate)}{a.daysOverdue > 0 && <span className="block text-xs font-semibold text-danger">{a.daysOverdue} día(s) de atraso</span>}</Td>
                    <Td num>{money(a.amount, a.currency)}</Td>
                    <Td num>{money(a.paidAmount, a.currency)}</Td>
                    <Td num strong>{money(a.balance, a.currency)}</Td>
                    <Td><Badge tone={ACCOUNT_TONE[a.status]}>{ACCOUNT_STATUS[a.status]}</Badge></Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        {open && !a.settlement && <Button small onClick={() => setPaying(a)}>Pagar</Button>}
                        {open && a.settlement && <span className="text-xs text-ink/65">Se paga desde la liquidación</span>}
                        {open && !a.settlement && Number(a.paidAmount) === 0 && <Button small variant="ghost" onClick={() => cancel(a.id)}>Cancelar</Button>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          );
        }}
      </Loader>
      {creating && (
        <Modal title="Nueva cuenta por pagar" onClose={() => setCreating(false)}>
          <AccountForm onCancel={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />
        </Modal>
      )}
      {paying && (
        <Modal title={`Pagar: ${paying.concept}`} onClose={() => setPaying(null)}>
          <PaymentForm path={`/finance/payables/${paying.id}/payments`} balance={paying.balance} currency={paying.currency} verb="Pagar" onCancel={() => setPaying(null)} onDone={() => { setPaying(null); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
