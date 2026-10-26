"use client";

import Link from "next/link";
import { useState } from "react";
import { NewCaptation } from "@/components/NewCaptation";
import { canEdit, useSession } from "@/components/Shell";
import { Badge, Button, Empty, Loader, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { CASE_STATUS, fmtDate, money, OPERATION, STAGE, STAGES } from "@/lib/labels";
import { CASE_TONE } from "@/lib/tones";

type Case = {
  id: string; code: string; operation: string; price: string; currency: string; currentStage: string; status: string; updatedAt: string;
  property: { code: string; title: string; zone: string | null }; agent: { fullName: string } | null; client: { fullName: string } | null;
  stages: Array<{ stage: string; status: string }>;
};

function Steps({ stages }: { stages: Case["stages"] }) {
  const by = Object.fromEntries(stages.map((s) => [s.stage, s.status]));
  return (
    <ol className="flex gap-1" aria-label="Avance de los 8 pasos">
      {STAGES.map((s, i) => (
        <li
          key={s}
          title={`${i + 1}. ${STAGE[s]}`}
          className={`h-1.5 flex-1 rounded-full ${by[s] === "DONE" ? "bg-brand-teal" : by[s] === "IN_PROGRESS" ? "bg-accent-lime" : "bg-ink/15"}`}
        />
      ))}
    </ol>
  );
}

function CaseCard({ c }: { c: Case }) {
  return (
    <Link href={`/app/gestion/${c.id}`} className="block rounded-xl bg-white p-3 ring-1 ring-ink/10 transition hover:ring-brand-teal">
      <p className="text-xs font-medium text-ink/65">{c.code} · {OPERATION[c.operation]}</p>
      <p className="truncate text-sm font-semibold text-ink">{c.property.title}</p>
      <p className="text-sm font-bold text-brand-ink">{money(c.price, c.currency)}</p>
      <p className="mb-2 mt-1 truncate text-xs text-ink/65">{c.agent?.fullName ?? "Sin agente"}{c.client ? ` · ${c.client.fullName}` : ""}</p>
      <Steps stages={c.stages} />
    </Link>
  );
}

export default function CasesPage() {
  const user = useSession();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [creating, setCreating] = useState(false);
  const state = useFetch<Case[]>("/cases");
  return (
    <>
      <PageHeader title="Gestión comercial" subtitle="Cada operación avanza por los 8 pasos, de la captación a la postventa.">
        <div className="flex rounded-lg bg-ink/5 p-0.5">
          {([["kanban", "Tablero"], ["list", "Lista"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === k ? "bg-white text-ink shadow-sm" : "text-ink/70"}`}>
              {label}
            </button>
          ))}
        </div>
        {canEdit(user.role) && <Button onClick={() => setCreating(true)}><span aria-hidden className="mr-1 text-lg leading-none">+</span>Nueva captación</Button>}
      </PageHeader>
      {creating && <NewCaptation onClose={() => setCreating(false)} />}
      <Loader state={state}>
        {(cases) => {
          if (cases.length === 0) {
            return <Empty title="Aún no hay expedientes">Usa <strong>+ Nueva captación</strong> para abrir el primero, o registra una propiedad y su expediente se abre solo.</Empty>;
          }
          if (view === "list") {
            return (
              <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                    <tr>{["Expediente", "Propiedad", "Precio", "Agente", "Paso actual", "Estado", "Actualizado"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {cases.map((c) => (
                      <tr key={c.id} className="hover:bg-surface">
                        <td className="px-4 py-3"><Link href={`/app/gestion/${c.id}`} className="font-semibold text-link hover:underline">{c.code}</Link></td>
                        <td className="px-4 py-3 text-ink">{c.property.title}</td>
                        <td className="px-4 py-3 font-medium text-ink">{money(c.price, c.currency)}</td>
                        <td className="px-4 py-3 text-ink/85">{c.agent?.fullName ?? "—"}</td>
                        <td className="px-4 py-3 text-ink/85">{STAGES.indexOf(c.currentStage) + 1}. {STAGE[c.currentStage]}</td>
                        <td className="px-4 py-3"><Badge tone={CASE_TONE[c.status]}>{CASE_STATUS[c.status]}</Badge></td>
                        <td className="px-4 py-3 text-ink/65">{fmtDate(c.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          const open = cases.filter((c) => c.status !== "LOST");
          const lost = cases.filter((c) => c.status === "LOST");
          return (
            <>
              <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
                <div className="flex gap-3">
                  {STAGES.map((stage, i) => {
                    const items = open.filter((c) => c.currentStage === stage);
                    return (
                      <section key={stage} className="flex w-60 shrink-0 flex-col rounded-2xl bg-ink/5 p-2">
                        <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-ink">
                          <span><span className="text-ink/55">{i + 1}.</span> {STAGE[stage]}</span>
                          <span className="text-ink/60">{items.length}</span>
                        </h2>
                        <div className="flex flex-col gap-2">
                          {items.map((c) => <CaseCard key={c.id} c={c} />)}
                          {items.length === 0 && <p className="px-2 py-3 text-xs text-ink/50">Sin expedientes</p>}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
              {lost.length > 0 && <p className="mt-2 text-sm text-ink/65">{lost.length} expediente(s) perdido(s): cámbialo a la vista Lista para verlos.</p>}
            </>
          );
        }}
      </Loader>
    </>
  );
}
