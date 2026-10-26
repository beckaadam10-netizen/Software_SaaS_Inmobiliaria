"use client";

import { Empty, Loader, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/labels";

type Entry = { id: string; action: string; entity: string; entityId: string | null; createdAt: string; user: { fullName: string } | null };
const VERB: Record<string, string> = { POST: "Creó o ejecutó", PATCH: "Modificó", DELETE: "Eliminó", PUT: "Reemplazó" };
const ENTITY: Record<string, string> = { properties: "Propiedades", contacts: "Contactos", leads: "Leads", visits: "Visitas", cases: "Gestión comercial", users: "Usuarios" };

export default function AuditPage() {
  const state = useFetch<Entry[]>("/audit");
  return (
    <>
      <PageHeader title="Auditoría" subtitle="Últimos 200 cambios hechos en tu empresa." />
      <Loader state={state}>
        {(items) =>
          items.length === 0 ? <Empty title="Aún no hay cambios registrados" /> : (
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                  <tr>{["Fecha y hora", "Usuario", "Acción", "Módulo", "Detalle técnico"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink/85">{fmtDateTime(a.createdAt)}</td>
                      <td className="px-4 py-2.5 font-medium text-ink">{a.user?.fullName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink/85">{VERB[a.action.split(" ")[0]] ?? a.action}</td>
                      <td className="px-4 py-2.5 text-ink/85">{ENTITY[a.entity] ?? a.entity}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink/65">{a.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loader>
    </>
  );
}
