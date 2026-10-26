"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, Field, Input, Loader, PageHeader, type Tone } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { money } from "@/lib/labels";

type Step = { key: string; label: string; value: number; rate: number | null };
type Agent = {
  agent: { id: string; fullName: string }; properties: number; leads: number; visits: number; negotiations: number; sales: number;
  valueSold: Record<string, number>; commissions: Record<string, number>; conversion: number | null; avgDaysToClose: number | null;
};
type Demand = { id: string; code: string; title: string; zone: string | null; daysOnMarket: number; leads30: number; leadsPrev: number; views30: number; visits30: number; level: "HIGH" | "MEDIUM" | "LOW"; trend: "UP" | "DOWN" | "FLAT" };
type Zone = { zone: string; wanted: number; available: number; leads: number };
type Data = { funnel: Step[]; agents: Agent[]; demand: Demand[]; zones: Zone[]; avgDaysToClose: number | null };

const LEVEL: Record<Demand["level"], { label: string; tone: Tone }> = { HIGH: { label: "Alta", tone: "lime" }, MEDIUM: { label: "Media", tone: "teal" }, LOW: { label: "Baja", tone: "neutral" } };
const TREND: Record<Demand["trend"], string> = { UP: "↑ Sube", DOWN: "↓ Baja", FLAT: "= Igual" };
const sums = (r: Record<string, number>) => Object.entries(r).map(([c, n]) => money(n, c)).join(" · ") || "—";
const th = "px-4 py-3 font-semibold";
const td = "px-4 py-3 tabular-nums text-ink/85";

/** Embudo: una barra por paso, todas del mismo color; el número y la tasa van en texto. */
function Funnel({ steps }: { steps: Step[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((s) => (
        <li key={s.key} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr_9rem]" title={`${s.label}: ${s.value}`}>
          <span className="text-sm font-medium text-ink">{s.label}</span>
          <div className="flex items-center gap-2">
            <div className="h-6 flex-1 rounded bg-ink/5">
              <div className="h-full rounded bg-brand-teal" style={{ width: `${s.value ? Math.max(1.5, (s.value / max) * 100) : 0}%` }} />
            </div>
            <span className="w-12 text-right text-sm font-bold tabular-nums text-ink">{s.value.toLocaleString("es-BO")}</span>
          </div>
          <span className="col-span-2 text-xs text-ink/65 sm:col-span-1">{s.rate == null ? "" : `${s.rate} % del paso anterior`}</span>
        </li>
      ))}
    </ol>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState({ from: "", to: "" });
  const [applied, setApplied] = useState({ from: "", to: "" });
  const q = new URLSearchParams(Object.entries(applied).filter(([, v]) => v)).toString();
  const state = useFetch<Data>(`/analytics${q ? `?${q}` : ""}`);

  return (
    <>
      <PageHeader title="Analítica" subtitle="Embudo comercial, rendimiento del equipo, demanda y zonas más buscadas.">
        <Field label="Desde"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="Hasta"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <Button className="self-end" onClick={() => setApplied(range)}>Aplicar</Button>
        {(applied.from || applied.to) && <Button variant="ghost" className="self-end" onClick={() => { setRange({ from: "", to: "" }); setApplied({ from: "", to: "" }); }}>Todo</Button>}
      </PageHeader>
      <Loader state={state}>
        {(d) => (
          <div className="flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
              <Card>
                <h2 className="mb-4 font-semibold text-ink">Embudo comercial</h2>
                <Funnel steps={d.funnel} />
                <p className="mt-4 text-xs text-ink/65">{applied.from || applied.to ? "Datos del periodo elegido." : "Datos de toda la historia."} Cada porcentaje compara el paso con el anterior.</p>
              </Card>
              <Card>
                <h2 className="text-sm font-semibold text-ink">Tiempo promedio de cierre</h2>
                <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{d.avgDaysToClose == null ? "—" : d.avgDaysToClose}<span className="text-base font-medium text-ink/65">{d.avgDaysToClose == null ? "" : " días"}</span></p>
                <p className="mt-1 text-sm text-ink/70">{d.avgDaysToClose == null ? "Aún no hay operaciones cerradas." : "Desde que se abre el expediente hasta que se gana."}</p>
              </Card>
            </div>

            <section>
              <h2 className="mb-3 font-semibold text-ink">Rendimiento por agente</h2>
              <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                    <tr>{["Agente", "Propiedades", "Leads", "Visitas", "Negociaciones", "Cierres", "Valor vendido", "Comisiones", "Conversión", "Días de cierre"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {d.agents.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-ink/65">Sin actividad en este periodo.</td></tr>}
                    {d.agents.map((a) => (
                      <tr key={a.agent.id}>
                        <td className="px-4 py-3 font-semibold text-ink">{a.agent.fullName}</td>
                        <td className={td}>{a.properties}</td><td className={td}>{a.leads}</td><td className={td}>{a.visits}</td><td className={td}>{a.negotiations}</td>
                        <td className={`${td} font-semibold text-ink`}>{a.sales}</td><td className={td}>{sums(a.valueSold)}</td><td className={td}>{sums(a.commissions)}</td>
                        <td className={td}>{a.conversion == null ? "—" : `${a.conversion} %`}</td><td className={td}>{a.avgDaysToClose ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
              <section>
                <h2 className="mb-1 font-semibold text-ink">Demanda de las propiedades en oferta</h2>
                <p className="mb-3 text-sm text-ink/70">Medida con hechos de los últimos 30 días, comparada con los 30 anteriores. No es una predicción del mercado.</p>
                <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                      <tr>{["Propiedad", "Demanda", "Interesados", "Vistas", "Visitas", "Tendencia", "Días en oferta"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {d.demand.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-ink/65">No hay propiedades en oferta.</td></tr>}
                      {d.demand.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3"><Link href={`/app/propiedades/${p.id}`} className="font-semibold text-link hover:underline">{p.code}</Link><p className="text-xs text-ink/65">{p.title}</p></td>
                          <td className="px-4 py-3"><Badge tone={LEVEL[p.level].tone}>{LEVEL[p.level].label}</Badge></td>
                          <td className={td}>{p.leads30}</td><td className={td}>{p.views30}</td><td className={td}>{p.visits30}</td>
                          <td className={td}>{TREND[p.trend]}</td><td className={td}>{p.daysOnMarket}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h2 className="mb-1 font-semibold text-ink">Zonas más buscadas</h2>
                <p className="mb-3 text-sm text-ink/70">Clientes que piden la zona frente a lo que tienes disponible.</p>
                <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                      <tr>{["Zona", "La buscan", "Disponibles", "Interesados"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {d.zones.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-ink/65">Aún no hay zonas registradas.</td></tr>}
                      {d.zones.map((z) => (
                        <tr key={z.zone}>
                          <td className="px-4 py-3 font-semibold text-ink">{z.zone}{z.wanted > 0 && z.available === 0 && <span className="ml-2"><Badge tone="amber">Sin oferta</Badge></span>}</td>
                          <td className={td}>{z.wanted}</td><td className={td}>{z.available}</td><td className={td}>{z.leads}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}
      </Loader>
    </>
  );
}
