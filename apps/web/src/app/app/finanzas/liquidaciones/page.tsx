"use client";

import { useState, type FormEvent } from "react";
import { DataTable, Td } from "@/components/finance";
import { useSession } from "@/components/Shell";
import { Badge, Button, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { ADJUSTMENT, fmtDate, money, PAY_METHOD, SETTLEMENT_STATUS, todayInput, toLocalInput } from "@/lib/labels";
import { useAgents } from "@/lib/options";
import { SETTLEMENT_TONE } from "@/lib/tones";

type Row = { id: string; code: string; periodStart: string; periodEnd: string; currency: string; commissionsTotal: string; bonuses: string; deductions: string; advances: string; total: string; status: string; agent: { fullName: string }; _count: { commissions: number } };
type Detail = Row & {
  paidAt: string | null; adjustments: Array<{ id: string; kind: string; amount: string; note: string }>;
  commissions: Array<{ id: string; agentAmount: string; case: { code: string; property: { title: string } } }>;
};

function CreateForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const agents = useAgents();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dates] = useState(() => { const now = new Date(); return { start: toLocalInput(new Date(now.getFullYear(), now.getMonth(), 1)).slice(0, 10), end: todayInput() }; });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onDone((await api<{ id: string }>("/finance/settlements", { method: "POST", json: formData(e.currentTarget) })).id);
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Agente" className="sm:col-span-2"><Select name="agentId" required options={agents} placeholder="Elige un agente" /></Field>
      <Field label="Desde"><Input name="periodStart" type="date" required defaultValue={dates.start} /></Field>
      <Field label="Hasta"><Input name="periodEnd" type="date" required defaultValue={dates.end} /></Field>
      <Field label="Moneda" hint="Se incluyen las comisiones aprobadas de operaciones cerradas en ese periodo." className="sm:col-span-2">
        <Select name="currency" options={{ USD: "Dólares (USD)", BOB: "Bolivianos (Bs)" }} />
      </Field>
      <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={onCancel} saving={saving} label="Crear liquidación" /></div>
    </form>
  );
}

function DetailView({ id, onChange, onClose }: { id: string; onChange: () => void; onClose: () => void }) {
  const user = useSession();
  const state = useFetch<Detail>(`/finance/settlements/${id}`);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(todayInput);
  const run = async (fn: () => Promise<unknown>, close = false) => {
    setError(null);
    try {
      await fn();
      onChange();
      if (close) onClose();
      else state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const post = (path: string, json: object = {}) => api(`/finance/settlements/${id}${path}`, { method: "POST", json });

  return (
    <Loader state={state}>
      {(s) => {
        const line = (label: string, value: string, sign = "") => (
          <div className="flex justify-between gap-3 py-1.5"><dt className="text-ink/80">{label}</dt><dd className="font-medium tabular-nums text-ink">{sign}{money(value, s.currency)}</dd></div>
        );
        return (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink/80">{s.agent.fullName} · {fmtDate(s.periodStart)} a {fmtDate(s.periodEnd)}</p>
              <Badge tone={SETTLEMENT_TONE[s.status]}>{SETTLEMENT_STATUS[s.status]}{s.paidAt ? ` el ${fmtDate(s.paidAt)}` : ""}</Badge>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink">Comisiones incluidas</h3>
              <ul className="divide-y divide-ink/10 text-sm">
                {s.commissions.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3 py-1.5"><span className="text-ink/85">{c.case.code} · {c.case.property.title}</span><span className="font-medium tabular-nums text-ink">{money(c.agentAmount, s.currency)}</span></li>
                ))}
              </ul>
            </div>
            {(s.adjustments.length > 0 || s.status === "DRAFT") && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-ink">Bonificaciones, deducciones y anticipos</h3>
                {s.adjustments.length === 0 && <p className="text-sm text-ink/65">Sin ajustes.</p>}
                <ul className="divide-y divide-ink/10 text-sm">
                  {s.adjustments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="text-ink/85">{ADJUSTMENT[a.kind]}: {a.note}</span>
                      <span className="flex items-center gap-2"><span className="font-medium tabular-nums text-ink">{a.kind === "BONUS" ? "+" : "−"}{money(a.amount, s.currency)}</span>
                        {s.status === "DRAFT" && <Button small variant="ghost" onClick={() => run(() => api(`/finance/settlements/${id}/adjustments/${a.id}`, { method: "DELETE" }))}>Quitar</Button>}</span>
                    </li>
                  ))}
                </ul>
                {s.status === "DRAFT" && (
                  <form className="mt-3 grid gap-2 sm:grid-cols-[150px_120px_1fr_auto]" onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; run(() => post("/adjustments", formData(form)).then(() => form.reset())); }}>
                    <Select name="kind" options={ADJUSTMENT} aria-label="Tipo de ajuste" />
                    <Input name="amount" type="number" min={0.01} step="0.01" required placeholder="Monto" aria-label="Monto" />
                    <Input name="note" required maxLength={190} placeholder="Motivo" aria-label="Motivo" />
                    <Button type="submit" variant="ghost">Agregar</Button>
                  </form>
                )}
              </div>
            )}
            <dl className="rounded-xl bg-surface px-4 py-2 text-sm">
              {line("Comisiones", s.commissionsTotal)}
              {line("Bonificaciones", s.bonuses, "+")}
              {line("Deducciones", s.deductions, "−")}
              {line("Anticipos", s.advances, "−")}
              <div className="mt-1 flex justify-between gap-3 border-t border-ink/15 py-2 text-base"><dt className="font-bold text-ink">Total a pagar</dt><dd className="font-bold tabular-nums text-brand-ink">{money(s.total, s.currency)}</dd></div>
            </dl>
            <ErrorNote>{error}</ErrorNote>
            {s.status === "DRAFT" && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="danger" onClick={() => run(() => api(`/finance/settlements/${id}`, { method: "DELETE" }), true)}>Eliminar borrador</Button>
                {user.role === "ADMIN" ? <Button onClick={() => run(() => post("/approve"))}>Aprobar liquidación</Button> : <p className="self-center text-sm text-ink/70">La aprueba el administrador.</p>}
              </div>
            )}
            {s.status === "APPROVED" && (
              <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); const f = formData(e.currentTarget); run(() => post("/pay", f)); }}>
                <Field label="Fecha de pago"><Input name="date" type="date" required defaultValue={today} /></Field>
                <Field label="Forma de pago"><Select name="method" options={PAY_METHOD} /></Field>
                <Button type="submit">Registrar pago</Button>
              </form>
            )}
          </div>
        );
      }}
    </Loader>
  );
}

export default function SettlementsPage() {
  const state = useFetch<Row[]>("/finance/settlements");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = state.data?.find((s) => s.id === openId);
  return (
    <>
      <PageHeader title="Liquidaciones" subtitle="Pago periódico a cada agente: comisiones aprobadas más bonificaciones, menos deducciones y anticipos.">
        <Button onClick={() => setCreating(true)}>Nueva liquidación</Button>
      </PageHeader>
      <Loader state={state}>
        {(rows) =>
          rows.length === 0 ? <Empty title="Aún no hay liquidaciones">Aprueba las comisiones y crea la liquidación del periodo para cada agente.</Empty> : (
            <DataTable head={["Liquidación", "Agente", "Periodo", { label: "Comisiones", num: true }, { label: "Total a pagar", num: true }, "Estado", ""]} minWidth={820}>
              {rows.map((s) => (
                <tr key={s.id}>
                  <Td strong>{s.code}</Td>
                  <Td>{s.agent.fullName}</Td>
                  <Td>{fmtDate(s.periodStart)} a {fmtDate(s.periodEnd)}</Td>
                  <Td num>{money(s.commissionsTotal, s.currency)}<span className="block text-xs text-ink/65">{s._count.commissions} comisión(es)</span></Td>
                  <Td num strong>{money(s.total, s.currency)}</Td>
                  <Td><Badge tone={SETTLEMENT_TONE[s.status]}>{SETTLEMENT_STATUS[s.status]}</Badge></Td>
                  <Td className="text-right"><Button small variant="ghost" onClick={() => setOpenId(s.id)}>{s.status === "PAID" ? "Ver" : "Abrir"}</Button></Td>
                </tr>
              ))}
            </DataTable>
          )
        }
      </Loader>
      {creating && (
        <Modal title="Nueva liquidación" onClose={() => setCreating(false)}>
          <CreateForm onCancel={() => setCreating(false)} onDone={(id) => { setCreating(false); state.reload(); setOpenId(id); }} />
        </Modal>
      )}
      {openId && (
        <Modal title={`Liquidación ${opened?.code ?? ""}`} wide onClose={() => setOpenId(null)}>
          <DetailView id={openId} onChange={state.reload} onClose={() => setOpenId(null)} />
        </Modal>
      )}
    </>
  );
}
