"use client";

import Link from "next/link";
import { DataTable, Signed, Td } from "@/components/finance";
import { Empty, Loader, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { fmtDate, money, moneyMap } from "@/lib/labels";

type ByCase = { id: string; code: string; currency: string; closedPrice: string; closedAt: string; property: { title: string }; companyCommission: number; agentCommission: number; expenses: number; net: number };
type ByAgent = { agent: { id: string; fullName: string }; sales: number; leads: number; conversion: number | null; valueSold: Record<string, number>; generated: Record<string, number>; paid: Record<string, number>; pending: Record<string, number> };

export default function ProfitabilityPage() {
  const state = useFetch<{ byCase: ByCase[]; byAgent: ByAgent[] }>("/finance/profitability");
  return (
    <>
      <PageHeader title="Rentabilidad" subtitle="Ganancia neta de cada operación: comisión de la empresa, menos la del agente, menos los gastos ligados al expediente." />
      <Loader state={state}>
        {({ byCase, byAgent }) =>
          byCase.length === 0 && byAgent.length === 0 ? <Empty title="Aún no hay operaciones cerradas" /> : (
            <div className="flex flex-col gap-8">
              <section>
                <h2 className="mb-3 text-lg font-bold text-ink">Por operación</h2>
                <DataTable head={["Operación", "Cierre", { label: "Precio de cierre", num: true }, { label: "Comisión empresa", num: true }, { label: "Comisión agente", num: true }, { label: "Gastos", num: true }, { label: "Ganancia neta", num: true }]} minWidth={940}>
                  {byCase.map((c) => (
                    <tr key={c.id}>
                      <Td><Link href={`/app/gestion/${c.id}`} className="font-semibold text-link hover:underline">{c.code}</Link><span className="block text-xs text-ink/65">{c.property.title}</span></Td>
                      <Td>{fmtDate(c.closedAt)}</Td>
                      <Td num>{money(c.closedPrice, c.currency)}</Td>
                      <Td num>{money(c.companyCommission, c.currency)}</Td>
                      <Td num>−{money(c.agentCommission, c.currency)}</Td>
                      <Td num>−{money(c.expenses, c.currency)}</Td>
                      <Td num strong><Signed value={c.net} currency={c.currency} /></Td>
                    </tr>
                  ))}
                </DataTable>
              </section>
              <section>
                <h2 className="mb-3 text-lg font-bold text-ink">Por agente</h2>
                <DataTable head={["Agente", { label: "Ventas", num: true }, { label: "Leads", num: true }, { label: "Conversión", num: true }, { label: "Valor vendido", num: true }, { label: "Comisiones generadas", num: true }, { label: "Pagadas", num: true }, { label: "Pendientes", num: true }]} minWidth={980}>
                  {byAgent.map((a) => (
                    <tr key={a.agent.id}>
                      <Td strong>{a.agent.fullName}</Td>
                      <Td num>{a.sales}</Td>
                      <Td num>{a.leads}</Td>
                      <Td num>{a.conversion == null ? "—" : `${a.conversion} %`}</Td>
                      <Td num>{moneyMap(a.valueSold)}</Td>
                      <Td num>{moneyMap(a.generated)}</Td>
                      <Td num>{moneyMap(a.paid)}</Td>
                      <Td num strong>{moneyMap(a.pending)}</Td>
                    </tr>
                  ))}
                </DataTable>
              </section>
            </div>
          )
        }
      </Loader>
    </>
  );
}
