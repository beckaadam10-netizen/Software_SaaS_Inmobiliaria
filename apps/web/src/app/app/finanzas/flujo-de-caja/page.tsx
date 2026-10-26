"use client";

import { useState } from "react";
import { DataTable, Signed, Td } from "@/components/finance";
import { Empty, Input, Loader, PageHeader, Select } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { GROUPING, money } from "@/lib/labels";

type Flow = { currency: string; income: number; expense: number; net: number; rows: Array<{ period: string; income: number; expense: number; net: number; balance: number }> };

export default function CashFlowPage() {
  const [group, setGroup] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams({ group, ...(from && { from }), ...(to && { to }) });
  const state = useFetch<Flow[]>(`/finance/cashflow?${params}`);
  return (
    <>
      <PageHeader title="Flujo de caja" subtitle="Ingresos menos gastos es el flujo neto de cada periodo. Solo cuenta el dinero que ya entró o salió." />
      <div className="mb-5 grid gap-2 sm:grid-cols-[180px_auto_auto_1fr]">
        <Select options={GROUPING} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Agrupar por" />
        <label className="flex items-center gap-2 text-sm text-ink/80">Desde <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-ink/80">Hasta <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <Loader state={state}>
        {(flows) =>
          flows.length === 0 ? <Empty title="No hay movimientos en ese periodo" /> : (
            <div className="flex flex-col gap-8">
              {flows.map((f) => (
                <section key={f.currency}>
                  <h2 className="mb-3 text-lg font-bold text-ink">{f.currency === "BOB" ? "Bolivianos" : "Dólares"}</h2>
                  <DataTable head={["Periodo", { label: "Ingresos", num: true }, { label: "Gastos", num: true }, { label: "Flujo neto", num: true }, { label: "Acumulado", num: true }]} minWidth={620}>
                    {f.rows.map((r) => (
                      <tr key={r.period}>
                        <Td strong>{r.period}</Td>
                        <Td num>{money(r.income, f.currency)}</Td>
                        <Td num>{money(r.expense, f.currency)}</Td>
                        <Td num strong><Signed value={r.net} currency={f.currency} /></Td>
                        <Td num><Signed value={r.balance} currency={f.currency} /></Td>
                      </tr>
                    ))}
                    <tr className="bg-surface">
                      <Td strong>Total</Td>
                      <Td num strong>{money(f.income, f.currency)}</Td>
                      <Td num strong>{money(f.expense, f.currency)}</Td>
                      <Td num strong><Signed value={f.net} currency={f.currency} /></Td>
                      <Td />
                    </tr>
                  </DataTable>
                </section>
              ))}
            </div>
          )
        }
      </Loader>
    </>
  );
}
