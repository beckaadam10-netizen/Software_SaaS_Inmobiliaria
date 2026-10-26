"use client";

import { useState, type FormEvent } from "react";
import { DataTable, Td } from "@/components/finance";
import { useSession } from "@/components/Shell";
import { Badge, Button, Card, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { ACCOUNT_TYPE, fmtDate, money, todayInput } from "@/lib/labels";

type Account = { id: string; code: string; name: string; type: string };
type Row = { code: string; name: string; type: string; debit: number; credit: number; balance: number };
type Statement = {
  currency: string;
  trial: { rows: Row[]; debit: number; credit: number; balanced: boolean };
  income: { income: Row[]; expenses: Row[]; totalIncome: number; totalExpenses: number; result: number };
  balance: { assets: Row[]; liabilities: Row[]; equity: Row[]; totalAssets: number; totalLiabilities: number; totalEquity: number; result: number; balanced: boolean };
};
type Entry = { id: string; number: number; date: string; description: string; currency: string; sourceType: string; lines: Array<{ debit: number; credit: number; account: { code: string; name: string } }> };
type LedgerData = { account: Account; currency: string; lines: Array<{ date: string; entryNumber: number; description: string; debit: number; credit: number; balance: number }> };

const VIEWS = { resultados: "Estado de resultados", balance: "Balance general", comprobacion: "Sumas y saldos", diario: "Libro diario", mayor: "Libro mayor", cuentas: "Plan de cuentas", cierre: "Cierre de gestión" } as const;
type View = keyof typeof VIEWS;
const VIEW_GROUPS: Array<{ name: string; views: View[] }> = [
  { name: "Estados financieros", views: ["resultados", "balance", "comprobacion"] },
  { name: "Libros", views: ["diario", "mayor"] },
  { name: "Configuración", views: ["cuentas", "cierre"] },
];
const CUR: Record<string, string> = { USD: "Dólares", BOB: "Bolivianos" };
const SOURCE: Record<string, string> = { transaction: "Automático", transaction_void: "Anulación", manual: "Manual", closing: "Cierre de gestión" };
type Closings = { closings: Array<{ id: string; year: number; currency: string; result: number; createdAt: string }>; closable: number[] };

function YearEnd({ onChange }: { onChange: () => void }) {
  const user = useSession();
  const state = useFetch<Closings>("/accounting/closings");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(path: string, method: "POST" | "DELETE", json?: unknown) {
    setBusy(true); setError(null);
    try {
      await api(path, { method, json });
      state.reload(); onChange();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }
  return (
    <Loader state={state}>
      {(d) => {
        const years = [...new Set(d.closings.map((c) => c.year))];
        const next = d.closable[0];
        return (
          <div className="flex max-w-3xl flex-col gap-4">
            <Card>
              <h2 className="text-base font-bold text-ink">Cerrar una gestión</h2>
              <p className="mt-1 text-sm text-ink/75">El cierre lleva la utilidad o pérdida del año a <strong>3201 · Resultados acumulados</strong> y deja ingresos y gastos en cero. Después ya no se pueden registrar movimientos con fecha de ese año. Las gestiones se cierran en orden.</p>
              <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
              {next ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button disabled={busy} onClick={() => run("/accounting/closings", "POST", { year: next })}>Cerrar la gestión {next}</Button>
                  {d.closable.length > 1 && <span className="text-sm text-ink/70">Pendientes: {d.closable.join(", ")}</span>}
                </div>
              ) : <p className="mt-3 text-sm text-ink/70">No hay gestiones pasadas pendientes de cierre.</p>}
            </Card>
            {years.length === 0 ? <Empty title="Aún no cerraste ninguna gestión" /> : (
              <DataTable head={["Gestión", "Moneda", { label: "Resultado", num: true }, "Cerrada el", ""]} minWidth={560}>
                {d.closings.map((c, i) => (
                  <tr key={c.id}>
                    <Td strong>{c.year}</Td>
                    <Td>{CUR[c.currency] ?? c.currency}</Td>
                    <Td num><span className={c.result >= 0 ? "text-success" : "text-danger"}>{money(c.result, c.currency)}</span><span className="block text-xs text-ink/65">{c.result >= 0 ? "Utilidad" : "Pérdida"}</span></Td>
                    <Td>{fmtDate(c.createdAt)}</Td>
                    <Td>
                      {user.role === "ADMIN" && c.year === years[0] && d.closings.findIndex((x) => x.year === c.year) === i && (
                        <div className="flex justify-end"><Button small variant="ghost" disabled={busy} onClick={() => run(`/accounting/closings/${c.year}`, "DELETE")}>Reabrir {c.year}</Button></div>
                      )}
                    </Td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        );
      }}
    </Loader>
  );
}
const amount = (n: number, cur: string) => (n ? money(n, cur) : "");

function Group({ title, rows, total, currency, totalLabel }: { title: string; rows: Row[]; total: number; currency: string; totalLabel: string }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink/65">{title}</h3>
      <dl className="divide-y divide-ink/10 text-sm">
        {rows.length === 0 && <div className="py-1.5 text-ink/60">Sin movimientos</div>}
        {rows.map((r) => <div key={r.code} className="flex justify-between gap-4 py-1.5"><dt className="text-ink/85">{r.code} · {r.name}</dt><dd className="tabular-nums text-ink">{money(r.balance, currency)}</dd></div>)}
        <div className="flex justify-between gap-4 py-2 font-semibold text-ink"><dt>{totalLabel}</dt><dd className="tabular-nums">{money(total, currency)}</dd></div>
      </dl>
    </div>
  );
}

function EntryForm({ accounts, onDone, onCancel }: { accounts: Account[]; onDone: () => void; onCancel: () => void }) {
  const [lines, setLines] = useState([{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sum = (k: "debit" | "credit") => Math.round(lines.reduce((s, l) => s + (Number(l[k]) || 0), 0) * 100) / 100;
  const set = (n: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, i) => (i === n ? { ...l, ...patch } : l)));
  const options = accounts.map((a) => [a.id, `${a.code} · ${a.name}`] as [string, string]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = formData(e.currentTarget);
    setSaving(true); setError(null);
    try {
      await api("/accounting/journal", { method: "POST", json: { date: data.date, description: data.description, currency: data.currency, lines: lines.map((l) => ({ accountId: l.accountId, debit: l.debit || 0, credit: l.credit || 0 })) } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
      <Field label="Descripción" className="sm:col-span-3"><Input name="description" required maxLength={190} placeholder="Aporte de capital de los socios" /></Field>
      <Field label="Fecha"><Input name="date" type="date" required defaultValue={todayInput()} /></Field>
      <Field label="Moneda"><Select name="currency" options={CUR} defaultValue="BOB" /></Field>
      <fieldset className="sm:col-span-3">
        <legend className="mb-2 text-sm font-medium text-ink">Líneas del asiento</legend>
        <div className="flex flex-col gap-2">
          {lines.map((l, n) => (
            <div key={n} className="grid grid-cols-[1fr_6.5rem_6.5rem] gap-2">
              <Select aria-label={`Cuenta ${n + 1}`} required options={options} placeholder="Elige una cuenta" value={l.accountId} onChange={(e) => set(n, { accountId: e.target.value })} />
              <Input aria-label={`Debe ${n + 1}`} type="number" min="0" step="0.01" placeholder="Debe" value={l.debit} onChange={(e) => set(n, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
              <Input aria-label={`Haber ${n + 1}`} type="number" min="0" step="0.01" placeholder="Haber" value={l.credit} onChange={(e) => set(n, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines([...lines, { accountId: "", debit: "", credit: "" }])} className="mt-2 text-sm font-semibold text-link hover:underline">Agregar línea</button>
        <p className={`mt-2 text-sm font-semibold ${sum("debit") === sum("credit") && sum("debit") > 0 ? "text-success" : "text-warning"}`} role="status">
          Debe {sum("debit").toLocaleString("es-BO")} · Haber {sum("credit").toLocaleString("es-BO")} · {sum("debit") === sum("credit") && sum("debit") > 0 ? "El asiento cuadra" : "El asiento todavía no cuadra"}
        </p>
      </fieldset>
      <div className="sm:col-span-3">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} label="Registrar asiento" />
      </div>
    </form>
  );
}

function Ledger({ accounts, currency }: { accounts: Account[]; currency: string }) {
  const [accountId, setAccountId] = useState(accounts.find((a) => a.code === "1102")?.id ?? accounts[0]?.id ?? "");
  const state = useFetch<LedgerData>(accountId ? `/accounting/ledger/${accountId}?currency=${currency}` : null);
  return (
    <>
      <div className="mb-4 max-w-sm"><Field label="Cuenta"><Select options={accounts.map((a) => [a.id, `${a.code} · ${a.name}`])} value={accountId} onChange={(e) => setAccountId(e.target.value)} /></Field></div>
      <Loader state={state}>
        {(d) => d.lines.length === 0 ? <Empty title="Esta cuenta no tiene movimientos en esta moneda" /> : (
          <DataTable head={["Fecha", "Asiento", "Descripción", { label: "Debe", num: true }, { label: "Haber", num: true }, { label: "Saldo", num: true }]}>
            {d.lines.map((l, i) => (
              <tr key={i}><Td>{fmtDate(l.date)}</Td><Td>N° {l.entryNumber}</Td><Td>{l.description}</Td><Td num>{amount(l.debit, currency)}</Td><Td num>{amount(l.credit, currency)}</Td><Td num strong>{money(l.balance, currency)}</Td></tr>
            ))}
          </DataTable>
        )}
      </Loader>
    </>
  );
}

export default function AccountingPage() {
  const [view, setView] = useState<View>("resultados");
  const [currency, setCurrency] = useState("USD");
  const [modal, setModal] = useState<"entry" | "account" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statements = useFetch<Statement[]>("/accounting/statements");
  const journal = useFetch<Entry[]>(view === "diario" ? "/accounting/journal" : null);
  const accounts = useFetch<Account[]>("/accounting/accounts");
  const reload = () => { setModal(null); statements.reload(); journal.reload(); accounts.reload(); };

  async function createAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await api("/accounting/accounts", { method: "POST", json: formData(e.currentTarget) });
      reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHeader title="Contabilidad" subtitle="Doble partida. Cada ingreso o gasto de Finanzas genera su asiento automáticamente.">
        <Select aria-label="Moneda" options={CUR} value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-36" />
        <Button onClick={() => setModal("entry")}>Asiento manual</Button>
      </PageHeader>
      <div className="mb-5 flex flex-wrap gap-x-6 gap-y-3" role="group" aria-label="Vista">
        {VIEW_GROUPS.map((g) => (
          <div key={g.name}>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink/60">{g.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.views.map((v) => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`h-9 rounded-lg px-3 text-sm font-semibold ${view === v ? "bg-brand-deep text-on-brand" : "bg-white text-ink ring-1 ring-ink/15 hover:bg-ink/5"}`}>{VIEWS[v]}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {view === "cierre" ? (
        <YearEnd onChange={() => { statements.reload(); accounts.reload(); }} />
      ) : view === "diario" ? (
        <Loader state={journal}>
          {(entries) => {
            const rows = entries.filter((e) => e.currency === currency);
            return rows.length === 0 ? <Empty title="No hay asientos en esta moneda" /> : (
              <div className="flex flex-col gap-3">
                {rows.map((e) => (
                  <Card key={e.id} className="!p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">N° {e.number} · {e.description}</p>
                      <p className="flex items-center gap-2 text-xs text-ink/65">{fmtDate(e.date)} <Badge tone={e.sourceType === "manual" ? "teal" : e.sourceType === "transaction_void" ? "amber" : e.sourceType === "closing" ? "info" : "neutral"}>{SOURCE[e.sourceType]}</Badge></p>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {e.lines.map((l, i) => (
                          <tr key={i} className="border-t border-ink/10">
                            <td className={`py-1.5 text-ink/85 ${l.credit ? "pl-6" : ""}`}>{l.account.code} · {l.account.name}</td>
                            <td className="w-32 py-1.5 text-right tabular-nums text-ink">{amount(l.debit, e.currency)}</td>
                            <td className="w-32 py-1.5 text-right tabular-nums text-ink">{amount(l.credit, e.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                ))}
              </div>
            );
          }}
        </Loader>
      ) : view === "mayor" ? (
        <Loader state={accounts}>{(list) => <Ledger key={currency} accounts={list} currency={currency} />}</Loader>
      ) : view === "cuentas" ? (
        <Loader state={accounts}>
          {(list) => (
            <>
              <div className="mb-3 flex justify-end"><Button variant="ghost" onClick={() => setModal("account")}>Nueva cuenta</Button></div>
              <DataTable head={["Código", "Cuenta", "Tipo"]} minWidth={420}>
                {list.map((a) => <tr key={a.id}><Td strong>{a.code}</Td><Td>{a.name}</Td><Td>{ACCOUNT_TYPE[a.type]}</Td></tr>)}
              </DataTable>
            </>
          )}
        </Loader>
      ) : (
        <Loader state={statements}>
          {(all) => {
            const s = all.find((x) => x.currency === currency);
            if (!s) return <Empty title="No hay movimientos en esta moneda">Registra ingresos o gastos en Finanzas y aparecerán aquí.</Empty>;
            if (view === "comprobacion") return (
              <>
                <DataTable head={["Código", "Cuenta", { label: "Debe", num: true }, { label: "Haber", num: true }, { label: "Saldo", num: true }]}>
                  {s.trial.rows.map((r) => <tr key={r.code}><Td strong>{r.code}</Td><Td>{r.name}</Td><Td num>{money(r.debit, currency)}</Td><Td num>{money(r.credit, currency)}</Td><Td num strong>{money(r.balance, currency)}</Td></tr>)}
                  <tr className="bg-surface"><Td strong>Total</Td><Td /><Td num strong>{money(s.trial.debit, currency)}</Td><Td num strong>{money(s.trial.credit, currency)}</Td><Td /></tr>
                </DataTable>
                <p className="mt-3 text-sm font-semibold" role="status"><Badge tone={s.trial.balanced ? "green" : "red"}>{s.trial.balanced ? "Los libros cuadran: debe = haber" : "Los libros no cuadran"}</Badge></p>
              </>
            );
            if (view === "resultados") return (
              <Card className="max-w-2xl">
                <div className="flex flex-col gap-5">
                  <Group title="Ingresos" rows={s.income.income} total={s.income.totalIncome} currency={currency} totalLabel="Total de ingresos" />
                  <Group title="Gastos" rows={s.income.expenses} total={s.income.totalExpenses} currency={currency} totalLabel="Total de gastos" />
                  <p className="flex justify-between gap-4 rounded-xl bg-brand-deep px-4 py-3 font-bold text-on-brand"><span>{s.income.result >= 0 ? "Utilidad" : "Pérdida"} del periodo</span><span className="tabular-nums">{money(s.income.result, currency)}</span></p>
                </div>
              </Card>
            );
            return (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card><Group title="Activo" rows={s.balance.assets} total={s.balance.totalAssets} currency={currency} totalLabel="Total activo" /></Card>
                  <Card>
                    <div className="flex flex-col gap-5">
                      <Group title="Pasivo" rows={s.balance.liabilities} total={s.balance.totalLiabilities} currency={currency} totalLabel="Total pasivo" />
                      <Group title="Patrimonio" rows={[...s.balance.equity, { code: "—", name: "Resultado acumulado", type: "EQUITY", debit: 0, credit: 0, balance: s.balance.result }]} total={Math.round((s.balance.totalEquity + s.balance.result) * 100) / 100} currency={currency} totalLabel="Total patrimonio" />
                    </div>
                  </Card>
                </div>
                <p className="mt-3 text-sm" role="status"><Badge tone={s.balance.balanced ? "green" : "red"}>{s.balance.balanced ? "Activo = pasivo + patrimonio" : "El balance no cuadra"}</Badge></p>
                <p className="mt-2 max-w-2xl text-xs text-ink/65">Contabilidad en base de caja: registra el dinero cuando entra o sale. Si el activo sale negativo, falta registrar el capital o el saldo inicial con un asiento manual.</p>
              </>
            );
          }}
        </Loader>
      )}

      {modal === "entry" && accounts.data && <Modal wide title="Asiento manual" onClose={() => setModal(null)}><EntryForm accounts={accounts.data} onCancel={() => setModal(null)} onDone={reload} /></Modal>}
      {modal === "account" && (
        <Modal title="Nueva cuenta" onClose={() => setModal(null)}>
          <form onSubmit={createAccount} className="grid gap-4">
            <Field label="Código" hint="De 4 a 10 dígitos. Ejemplo: 5108"><Input name="code" required pattern="\d{4,10}" /></Field>
            <Field label="Nombre"><Input name="name" required maxLength={120} /></Field>
            <Field label="Tipo"><Select name="type" options={ACCOUNT_TYPE} defaultValue="EXPENSE" /></Field>
            <div><ErrorNote>{error}</ErrorNote><FormActions onCancel={() => setModal(null)} saving={false} /></div>
          </form>
        </Modal>
      )}
    </>
  );
}
