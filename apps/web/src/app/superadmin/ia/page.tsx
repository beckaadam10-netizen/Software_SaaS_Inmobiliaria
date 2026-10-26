"use client";

import { Badge, Loader, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";

type Row = { tenant: { id: string; name: string; slug: string }; plan: string; limit: number | null; requests: number; external: number; inputTokens: number; outputTokens: number };
const n = (v: number) => v.toLocaleString("es-BO");

export default function AiUsagePage() {
  const state = useFetch<Row[]>("/admin/ai-usage");
  return (
    <>
      <PageHeader title="Consumo de IA" subtitle="Solicitudes del mes en curso por empresa. Los tokens solo se cuentan cuando se usa un proveedor externo." />
      <Loader state={state}>
        {(rows) => (
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                <tr>{["Empresa", "Plan", "Solicitudes", "Cupo mensual", "Con proveedor externo", "Tokens de entrada", "Tokens de salida"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {rows.map((r) => (
                  <tr key={r.tenant.id}>
                    <td className="px-4 py-3"><p className="font-semibold text-ink">{r.tenant.name}</p><p className="text-xs text-ink/65">{r.tenant.slug}</p></td>
                    <td className="px-4 py-3 text-ink/85">{r.plan}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-ink">{n(r.requests)} {r.limit != null && r.limit > 0 && r.requests >= r.limit && <Badge tone="red">Cupo agotado</Badge>}</td>
                    <td className="px-4 py-3 tabular-nums text-ink/85">{r.limit == null ? "Sin límite" : r.limit === 0 ? "No incluido" : n(r.limit)}</td>
                    <td className="px-4 py-3 tabular-nums text-ink/85">{n(r.external)}</td>
                    <td className="px-4 py-3 tabular-nums text-ink/85">{n(r.inputTokens)}</td>
                    <td className="px-4 py-3 tabular-nums text-ink/85">{n(r.outputTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loader>
    </>
  );
}
