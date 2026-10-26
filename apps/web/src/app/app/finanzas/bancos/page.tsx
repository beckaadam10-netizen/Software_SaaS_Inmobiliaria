"use client";

import { useRef, useState, type FormEvent } from "react";
import { DataTable, Signed, Td } from "@/components/finance";
import { Badge, Button, Card, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { EXPENSE_CATEGORY, fmtDate, INCOME_CATEGORY, money } from "@/lib/labels";

type Account = { id: string; name: string; bank: string | null; number: string | null; currency: string; lines: number; pending: number; balance: number };
type Suggestion = { id: string; description: string; date: string; amount: number };
type Line = { id: string; date: string; description: string; reference: string | null; amount: number; transaction: { id: string; description: string; date: string } | null; suggestions: Suggestion[] };
type Import = { imported: number; duplicated: number; errors: string[] };

function Lines({ account, onChange }: { account: Account; onChange: () => void }) {
  const state = useFetch<Line[]>(`/bank/accounts/${account.id}/lines`);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<Line | null>(null);
  const [result, setResult] = useState<Import | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => { state.reload(); onChange(); };

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function upload(f?: File) {
    if (!f) return;
    const csv = await f.text();
    if (file.current) file.current.value = "";
    await act(async () => setResult(await api<Import>(`/bank/accounts/${account.id}/import`, { method: "POST", json: { csv } })));
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = formData(e.currentTarget);
    const line = creating!;
    setCreating(null);
    await act(() => api(`/bank/lines/${line.id}/create`, { method: "POST", json: data }));
  }

  return (
    <Card className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">{account.name}</h2>
          <p className="text-sm text-ink/70">{[account.bank, account.number].filter(Boolean).join(" · ") || "Sin datos del banco"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} className="h-4 w-4 accent-brand-teal" />Solo pendientes</label>
          <input ref={file} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Archivo del extracto" onChange={(e) => upload(e.target.files?.[0])} />
          <Button onClick={() => file.current?.click()}>Importar extracto (CSV)</Button>
        </div>
      </div>
      {result && (
        <p role="status" className="mb-4 rounded-lg bg-surface px-3 py-2 text-sm text-ink ring-1 ring-ink/10">
          {result.imported} línea(s) importada(s){result.duplicated ? `, ${result.duplicated} ya estaban` : ""}.{result.errors.length ? ` No se pudieron leer: ${result.errors.join("; ")}.` : ""}
        </p>
      )}
      <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(all) => {
          const lines = onlyPending ? all.filter((l) => !l.transaction) : all;
          return all.length === 0 ? (
            <Empty title="Aún no importaste ningún extracto">
              Descarga el extracto de tu banca por internet en formato CSV y súbelo aquí. Necesita una columna de fecha y una de monto (o débito y crédito).
            </Empty>
          ) : lines.length === 0 ? <Empty title="Todo conciliado">Cada línea del extracto tiene su movimiento en Finanzas.</Empty> : (
            <DataTable head={["Fecha", "Descripción del banco", { label: "Importe", num: true }, "Conciliación"]} minWidth={760}>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>{fmtDate(l.date)}</Td>
                  <Td><span className="text-ink">{l.description}</span>{l.reference && <span className="block text-xs text-ink/65">Ref. {l.reference}</span>}</Td>
                  <Td num strong><Signed value={l.amount} currency={account.currency} /></Td>
                  <Td>
                    {l.transaction ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="green">Conciliada</Badge>
                        <span className="text-sm text-ink/80">{l.transaction.description}</span>
                        <button onClick={() => act(() => api(`/bank/lines/${l.id}/match`, { method: "DELETE" }))} className="text-sm font-medium text-link hover:underline">Deshacer</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-1.5">
                        {l.suggestions.map((s) => (
                          <div key={s.id} className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-ink/85">{s.description} · {fmtDate(s.date)}</span>
                            <Button small onClick={() => act(() => api(`/bank/lines/${l.id}/match`, { method: "POST", json: { transactionId: s.id } }))}>Conciliar</Button>
                          </div>
                        ))}
                        {l.suggestions.length === 0 && <span className="text-sm text-ink/65">No hay un movimiento con ese importe y fecha.</span>}
                        <Button small variant="ghost" onClick={() => setCreating(l)}>Registrar como {l.amount > 0 ? "ingreso" : "gasto"}</Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </DataTable>
          );
        }}
      </Loader>
      {creating && (
        <Modal title={`Registrar ${creating.amount > 0 ? "ingreso" : "gasto"} de ${money(Math.abs(creating.amount), account.currency)}`} onClose={() => setCreating(null)}>
          <form onSubmit={create} className="grid gap-4">
            <Field label="Categoría"><Select name="category" options={creating.amount > 0 ? INCOME_CATEGORY : EXPENSE_CATEGORY} defaultValue={creating.amount > 0 ? "OTHER" : "ADMIN"} /></Field>
            <Field label="Descripción"><Input name="description" required maxLength={190} defaultValue={creating.description} /></Field>
            <p className="text-sm text-ink/70">Se creará el movimiento en Finanzas con fecha {fmtDate(creating.date)} y quedará conciliado.</p>
            <FormActions onCancel={() => setCreating(null)} saving={false} label="Registrar y conciliar" />
          </form>
        </Modal>
      )}
    </Card>
  );
}

export default function BankPage() {
  const state = useFetch<Account[]>("/bank/accounts");
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      const a = await api<Account>("/bank/accounts", { method: "POST", json: formData(e.currentTarget) });
      setSelected(a.id); setModal(false); state.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHeader title="Bancos" subtitle="Importa el extracto de tu banco y comprueba que cada línea tenga su movimiento en Finanzas.">
        <Button onClick={() => setModal(true)}>Nueva cuenta bancaria</Button>
      </PageHeader>
      <Loader state={state}>
        {(accounts) => {
          const current = accounts.find((a) => a.id === selected) ?? accounts[0];
          return accounts.length === 0 ? <Empty title="Registra tu primera cuenta bancaria">Después podrás importar su extracto en CSV y conciliarlo.</Empty> : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map((a) => (
                  <button key={a.id} onClick={() => setSelected(a.id)} aria-pressed={a.id === current.id} className={`rounded-2xl bg-white p-5 text-left ring-1 transition ${a.id === current.id ? "ring-2 ring-brand-teal" : "ring-ink/10 hover:ring-brand-teal"}`}>
                    <p className="font-semibold text-ink">{a.name}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-ink"><Signed value={a.balance} currency={a.currency} /></p>
                    <p className="text-xs text-ink/65">Suma de las líneas importadas</p>
                    <p className="mt-2"><Badge tone={a.pending ? "amber" : a.lines ? "green" : "neutral"}>{a.lines === 0 ? "Sin extracto" : a.pending ? `${a.pending} por conciliar` : "Todo conciliado"}</Badge></p>
                  </button>
                ))}
              </div>
              <Lines key={current.id} account={current} onChange={state.reload} />
            </>
          );
        }}
      </Loader>
      {modal && (
        <Modal title="Nueva cuenta bancaria" onClose={() => setModal(false)}>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre para identificarla" className="sm:col-span-2"><Input name="name" required maxLength={80} placeholder="Cuenta corriente en dólares" /></Field>
            <Field label="Banco"><Input name="bank" maxLength={80} /></Field>
            <Field label="Número de cuenta"><Input name="number" maxLength={40} /></Field>
            <Field label="Moneda"><Select name="currency" options={{ BOB: "Bolivianos", USD: "Dólares" }} defaultValue="BOB" /></Field>
            <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={() => setModal(false)} saving={false} /></div>
          </form>
        </Modal>
      )}
    </>
  );
}
