"use client";

import { DataTable, Signed, Td } from "@/components/finance";
import { useState, type FormEvent } from "react";
import { canFinance, useSession } from "@/components/Shell";
import { Badge, Button, Card, Empty, ErrorNote, formData, Input, Loader, PageHeader } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { CATEGORY, fmtDate, money, todayInput, TX_KIND } from "@/lib/labels";

type Total = { currency: string; income: number; expense: number; net: number; receivable: number; overdue: number; payable: number; pendingCommissions: number };
type Tx = { id: string; kind: string; category: string; amount: string; currency: string; date: string; description: string };
type Summary = { level: "basic" | "full"; totals: Total[]; recent: Tx[]; consolidated: { rate: number; date: string; income: number; expense: number; net: number; receivable: number; payable: number } | null };

/** Total equivalente en bolivianos y registro del tipo de cambio. */
function ExchangeCard({ s, onChange }: { s: Summary; onChange: () => void }) {
  const user = useSession();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const c = s.consolidated;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api("/finance/exchange-rates", { method: "POST", json: formData(e.currentTarget) });
      onChange();
    } catch (err) {
      setError(errorText(err));
    }
    setSaving(false);
  }
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-ink">Total equivalente en bolivianos</h2>
          <p className="text-sm text-ink/70">{c ? `Con el tipo de cambio de Bs ${c.rate.toLocaleString("es-BO", { minimumFractionDigits: 2 })} por dólar, vigente desde el ${fmtDate(c.date)}. Es solo una referencia: cada monto sigue en su moneda.` : "Registra el tipo de cambio para ver todo sumado en bolivianos."}</p>
        </div>
        {canFinance(user.role) && (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium text-ink">Fecha<Input name="date" type="date" required defaultValue={todayInput()} className="mt-1 w-40" /></label>
            <label className="text-sm font-medium text-ink">Bs por 1 USD<Input name="rate" type="number" required min="0.5" max="100" step="0.0001" defaultValue={c?.rate ?? 6.96} className="mt-1 w-28" /></label>
            <Button type="submit" disabled={saving}>Registrar</Button>
          </form>
        )}
      </div>
      <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>
      {c && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-5">
          {([["Ingresos del mes", c.income], ["Gastos del mes", c.expense], ["Flujo neto", c.net], ...(s.level === "full" ? [["Por cobrar", c.receivable], ["Por pagar", c.payable]] : [])] as Array<[string, number]>).map(([label, v]) => (
            <div key={label}><dt className="text-sm text-ink/70">{label}</dt><dd className="text-xl font-bold tabular-nums text-brand-ink"><Signed value={v} currency="BOB" /></dd></div>
          ))}
        </dl>
      )}
    </Card>
  );
}

export default function FinanceSummaryPage() {
  const state = useFetch<Summary>("/finance/summary");
  return (
    <>
      <PageHeader title="Finanzas" subtitle="Resumen del mes en curso. Los montos se muestran por moneda; no se convierten entre sí." />
      <Loader state={state}>
        {(s) =>
          s.totals.length === 0 ? (
            <Empty title="Aún no hay movimientos">Al cerrar una operación se genera su comisión y su cuenta por cobrar. También puedes registrar ingresos y gastos a mano.</Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {s.totals.map((t) => (
                <Card key={t.currency}>
                  <h2 className="mb-4 font-semibold text-ink">{t.currency === "BOB" ? "Bolivianos" : "Dólares"}</h2>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
                    {[
                      ["Ingresos del mes", money(t.income, t.currency), ""],
                      ["Gastos del mes", money(t.expense, t.currency), ""],
                      ["Flujo neto del mes", null, ""],
                      ["Comisiones por pagar a agentes", money(t.pendingCommissions, t.currency), ""],
                      ...(s.level === "full" ? [
                        ["Por cobrar", money(t.receivable, t.currency), t.overdue > 0 ? `${money(t.overdue, t.currency)} vencido` : "Nada vencido"],
                        ["Por pagar", money(t.payable, t.currency), ""],
                      ] : []),
                    ].map(([label, value, note]) => (
                      <div key={label}>
                        <dt className="text-sm text-ink/70">{label}</dt>
                        <dd className="text-xl font-bold tabular-nums text-brand-ink">{value ?? <Signed value={t.net} currency={t.currency} />}</dd>
                        {note && <p className={`text-xs ${t.overdue > 0 && label === "Por cobrar" ? "font-semibold text-danger" : "text-ink/65"}`}>{note}</p>}
                      </div>
                    ))}
                  </dl>
                </Card>
              ))}
              <ExchangeCard s={s} onChange={state.reload} />
              <div>
                <h2 className="mb-3 text-lg font-bold text-ink">Últimos movimientos</h2>
                {s.recent.length === 0 ? <p className="text-sm text-ink/65">Sin movimientos todavía.</p> : (
                  <DataTable head={["Fecha", "Tipo", "Categoría", "Descripción", { label: "Monto", num: true }]} minWidth={640}>
                    {s.recent.map((t) => (
                      <tr key={t.id}>
                        <Td>{fmtDate(t.date)}</Td>
                        <Td><Badge tone={t.kind === "INCOME" ? "green" : "amber"}>{TX_KIND[t.kind]}</Badge></Td>
                        <Td>{CATEGORY[t.category] ?? t.category}</Td>
                        <Td>{t.description}</Td>
                        <Td num strong>{t.kind === "EXPENSE" ? "−" : ""}{money(t.amount, t.currency)}</Td>
                      </tr>
                    ))}
                  </DataTable>
                )}
              </div>
            </div>
          )
        }
      </Loader>
    </>
  );
}
