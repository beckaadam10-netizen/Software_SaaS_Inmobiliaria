"use client";

import { useState, type FormEvent } from "react";
import { DataTable, PaymentForm, Td } from "@/components/finance";
import { Badge, Button, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { ACCOUNT_STATUS, INCOME_CATEGORY, fmtDate, money, todayInput } from "@/lib/labels";
import { useContacts } from "@/lib/options";
import { ACCOUNT_TONE } from "@/lib/tones";

type Account = {
  id: string; concept: string; category: string; amount: string; paidAmount: string; currency: string; dueDate: string; status: string; balance: number; daysOverdue: number;
  contact: { fullName: string; phone: string | null } | null; case: { id: string; code: string } | null;
};

function AccountForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const people = useContacts();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [today] = useState(todayInput);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/finance/receivables", { method: "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Concepto" className="sm:col-span-2"><Input name="concept" required maxLength={191} /></Field>
      <Field label="Cliente" className="sm:col-span-2"><Select name="contactId" options={people} placeholder="Sin cliente" /></Field>
      <Field label="Categoría"><Select name="category" options={INCOME_CATEGORY} defaultValue="FEE" /></Field>
      <Field label="Vence el"><Input name="dueDate" type="date" required defaultValue={today} /></Field>
      <Field label="Monto"><Input name="amount" type="number" min={0.01} step="0.01" required /></Field>
      <Field label="Moneda"><Select name="currency" options={{ BOB: "Bolivianos (Bs)", USD: "Dólares (USD)" }} /></Field>
      <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={onCancel} saving={saving} /></div>
    </form>
  );
}

export default function ReceivablesPage() {
  const state = useFetch<Account[]>("/finance/receivables");
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Account | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cancel(id: string) {
    setError(null);
    try {
      await api(`/finance/receivables/${id}/cancel`, { method: "POST", json: {} });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="Cuentas por cobrar" subtitle="Lo que le deben a la inmobiliaria. La comisión de cada operación cerrada entra aquí sola.">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="h-4 w-4 accent-brand-teal" /> Solo pendientes
        </label>
        <Button onClick={() => setCreating(true)}>Nueva cuenta por cobrar</Button>
      </PageHeader>
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(all) => {
          const rows = all.filter((a) => !onlyOpen || a.status === "PENDING" || a.status === "PARTIAL");
          if (rows.length === 0) return <Empty title="No hay cuentas por cobrar" />;
          return (
            <DataTable head={["Concepto", "Cliente", "Vencimiento", { label: "Monto", num: true }, { label: "Cobrado", num: true }, { label: "Saldo", num: true }, "Estado", ""]} minWidth={920}>
              {rows.map((a) => {
                const open = a.status === "PENDING" || a.status === "PARTIAL";
                return (
                  <tr key={a.id}>
                    <Td strong>{a.concept}<span className="block text-xs font-normal text-ink/65">{INCOME_CATEGORY[a.category] ?? a.category}</span></Td>
                    <Td>{a.contact?.fullName ?? "—"}{a.case && <span className="block text-xs text-ink/65">{a.case.code}</span>}</Td>
                    <Td>{fmtDate(a.dueDate)}{a.daysOverdue > 0 && <span className="block text-xs font-semibold text-danger">{a.daysOverdue} día(s) de atraso</span>}</Td>
                    <Td num>{money(a.amount, a.currency)}</Td>
                    <Td num>{money(a.paidAmount, a.currency)}</Td>
                    <Td num strong>{money(a.balance, a.currency)}</Td>
                    <Td><Badge tone={ACCOUNT_TONE[a.status]}>{ACCOUNT_STATUS[a.status]}</Badge></Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        {open && <Button small onClick={() => setPaying(a)}>Cobrar</Button>}
                        {open && Number(a.paidAmount) === 0 && <Button small variant="ghost" onClick={() => cancel(a.id)}>Cancelar</Button>}
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
        <Modal title="Nueva cuenta por cobrar" onClose={() => setCreating(false)}>
          <AccountForm onCancel={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />
        </Modal>
      )}
      {paying && (
        <Modal title={`Cobrar: ${paying.concept}`} onClose={() => setPaying(null)}>
          <PaymentForm path={`/finance/receivables/${paying.id}/payments`} balance={paying.balance} currency={paying.currency} verb="Cobrar" onCancel={() => setPaying(null)} onDone={() => { setPaying(null); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
