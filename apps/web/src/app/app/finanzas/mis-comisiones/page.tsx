"use client";

import Link from "next/link";
import { DataTable, Td } from "@/components/finance";
import { Badge, Card, Empty, Loader, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { ADJUSTMENT, COMMISSION_STATUS, fmtDate, money, moneyMap, SETTLEMENT_STATUS } from "@/lib/labels";
import { COMMISSION_TONE, SETTLEMENT_TONE } from "@/lib/tones";

type Mine = {
  totals: { generated: Record<string, number>; paid: Record<string, number>; pending: Record<string, number> };
  commissions: Array<{ id: string; agentAmount: string; baseAmount: string; currency: string; status: string; case: { id: string; code: string; closedAt: string | null; property: { title: string } }; settlement: { code: string } | null }>;
  settlements: Array<{ id: string; code: string; periodStart: string; periodEnd: string; currency: string; commissionsTotal: string; total: string; status: string; paidAt: string | null; adjustments: Array<{ id: string; kind: string; amount: string; note: string }> }>;
};

export default function MyCommissionsPage() {
  const state = useFetch<Mine>("/finance/my");
  return (
    <>
      <PageHeader title="Mis comisiones" subtitle="Lo que generaste con tus operaciones cerradas y lo que ya se te pagó." />
      <Loader state={state}>
        {({ totals, commissions, settlements }) => (
          <div className="flex flex-col gap-8">
            <div className="grid gap-3 sm:grid-cols-3">
              {([["Generadas", totals.generated], ["Pagadas", totals.paid], ["Pendientes de pago", totals.pending]] as const).map(([label, map]) => (
                <Card key={label} className="p-4"><p className="text-xl font-bold tabular-nums text-brand-ink">{moneyMap(map)}</p><p className="mt-1 text-sm text-ink/75">{label}</p></Card>
              ))}
            </div>
            <section>
              <h2 className="mb-3 text-lg font-bold text-ink">Comisiones</h2>
              {commissions.length === 0 ? <Empty title="Aún no tienes comisiones">Se generan cuando cierras una operación como ganada.</Empty> : (
                <DataTable head={["Operación", "Cierre", { label: "Precio de cierre", num: true }, { label: "Tu comisión", num: true }, "Estado"]} minWidth={680}>
                  {commissions.map((c) => (
                    <tr key={c.id}>
                      <Td><Link href={`/app/gestion/${c.case.id}`} className="font-semibold text-link hover:underline">{c.case.code}</Link><span className="block text-xs text-ink/65">{c.case.property.title}</span></Td>
                      <Td>{c.case.closedAt ? fmtDate(c.case.closedAt) : "—"}</Td>
                      <Td num>{money(c.baseAmount, c.currency)}</Td>
                      <Td num strong>{money(c.agentAmount, c.currency)}</Td>
                      <Td><Badge tone={COMMISSION_TONE[c.status]}>{COMMISSION_STATUS[c.status]}</Badge>{c.settlement && <span className="ml-2 text-xs text-ink/65">{c.settlement.code}</span>}</Td>
                    </tr>
                  ))}
                </DataTable>
              )}
            </section>
            {settlements.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-bold text-ink">Liquidaciones</h2>
                <ul className="grid gap-3 md:grid-cols-2">
                  {settlements.map((s) => (
                    <li key={s.id}>
                      <Card>
                        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-ink">{s.code}</h3><Badge tone={SETTLEMENT_TONE[s.status]}>{SETTLEMENT_STATUS[s.status]}</Badge></div>
                        <p className="text-xs text-ink/65">{fmtDate(s.periodStart)} a {fmtDate(s.periodEnd)}{s.paidAt ? ` · pagada el ${fmtDate(s.paidAt)}` : ""}</p>
                        <dl className="mt-3 text-sm">
                          <div className="flex justify-between gap-2 py-1"><dt className="text-ink/80">Comisiones</dt><dd className="tabular-nums text-ink">{money(s.commissionsTotal, s.currency)}</dd></div>
                          {s.adjustments.map((a) => (
                            <div key={a.id} className="flex justify-between gap-2 py-1"><dt className="text-ink/80">{ADJUSTMENT[a.kind]}: {a.note}</dt><dd className="tabular-nums text-ink">{a.kind === "BONUS" ? "+" : "−"}{money(a.amount, s.currency)}</dd></div>
                          ))}
                          <div className="mt-1 flex justify-between gap-2 border-t border-ink/15 py-2"><dt className="font-bold text-ink">Total</dt><dd className="font-bold tabular-nums text-brand-ink">{money(s.total, s.currency)}</dd></div>
                        </dl>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Loader>
    </>
  );
}
