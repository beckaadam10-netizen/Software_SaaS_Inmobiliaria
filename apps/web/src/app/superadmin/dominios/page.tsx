"use client";

import { useState } from "react";
import { Badge, Button, Empty, ErrorNote, Loader, PageHeader } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDate } from "@/lib/labels";

type Row = { id: string; domain: string; verifiedAt: string | null; createdAt: string; tenant: { name: string; slug: string } };

export default function DomainsPage() {
  const state = useFetch<Row[]>("/admin/domains");
  const [error, setError] = useState<string | null>(null);
  async function set(r: Row, verified: boolean) {
    setError(null);
    try {
      await api(`/admin/domains/${r.id}`, { method: "PATCH", json: { verified } });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <PageHeader title="Dominios" subtitle="Dominios propios registrados por las empresas. Un dominio verificado abre el portal y el panel de su empresa." />
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(rows) => rows.length === 0 ? <Empty title="Ninguna empresa registró un dominio propio" /> : (
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                <tr>{["Dominio", "Empresa", "Registrado", "Estado", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-semibold text-ink">{r.domain}</td>
                    <td className="px-4 py-3 text-ink/85">{r.tenant.name}<span className="block text-xs text-ink/65">{r.tenant.slug}</span></td>
                    <td className="px-4 py-3 text-ink/65">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-3"><Badge tone={r.verifiedAt ? "green" : "amber"}>{r.verifiedAt ? "Verificado" : "Pendiente"}</Badge></td>
                    <td className="px-4 py-3 text-right"><Button small variant="ghost" onClick={() => set(r, !r.verifiedAt)}>{r.verifiedAt ? "Quitar verificación" : "Dar por verificado"}</Button></td>
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
