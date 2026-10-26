"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSession } from "@/components/Shell";
import { Badge, Card, Loader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { fmtDateTime, STAGE, STAGES } from "@/lib/labels";

type Ref = { id: string; fullName: string; phone?: string | null };
type Dashboard = {
  counts: Record<string, number>;
  today: {
    leadsToContact: Array<{ id: string; createdAt: string; contact: Ref; property: { code: string; title: string } | null }>;
    visitRequests: Array<{ id: string; scheduledAt: string; contact: Ref; property: { code: string; title: string } }>;
    upcomingVisits: Array<{ id: string; scheduledAt: string; contact: Ref; property: { code: string; title: string } }>;
    stalledCases: Array<{ id: string; code: string; updatedAt: string; property: { code: string; title: string } }>;
    quietProperties: Array<{ id: string; code: string; title: string; viewCount: number }>;
  };
  casesByStage: Record<string, number>;
};

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-2xl bg-white p-4 ring-1 ring-ink/10 transition hover:ring-brand-teal">
      <p className="text-3xl font-bold tabular-nums text-brand-ink">{value}</p>
      <p className="mt-1 text-sm text-ink/75">{label}</p>
    </Link>
  );
}

function Todo({ title, count, href, empty, children }: { title: string; count: number; href: string; empty: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">{title}</h2>
        {count > 0 ? <Badge tone="lime">{count}</Badge> : <Badge>Al día</Badge>}
      </div>
      {count === 0 ? <p className="text-sm text-ink/65">{empty}</p> : <ul className="divide-y divide-ink/10">{children}</ul>}
      {count > 0 && (
        <Link href={href} className="mt-3 inline-block text-sm font-semibold text-link hover:underline">
          Ver todo
        </Link>
      )}
    </Card>
  );
}

const Row = ({ main, sub, href }: { main: string; sub: string; href: string }) => (
  <li>
    <Link href={href} className="block py-2 hover:bg-surface">
      <p className="text-sm font-medium text-ink">{main}</p>
      <p className="text-xs text-ink/65">{sub}</p>
    </Link>
  </li>
);

export default function DashboardPage() {
  const user = useSession();
  const state = useFetch<Dashboard>("/dashboard");
  return (
    <>
      <p className="text-sm font-medium text-link">{user.tenant?.name}</p>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-ink">Hola, {user.fullName.split(" ")[0]}. Esto es lo que tienes que hacer hoy</h1>
      <Loader state={state}>
        {({ counts, today, casesByStage }) => (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <Stat label="Propiedades activas" value={counts.activeProperties} href="/app/propiedades" />
              <Stat label="Publicadas" value={counts.publishedProperties} href="/app/propiedades" />
              <Stat label="Leads nuevos (7 días)" value={counts.newLeads} href="/app/leads" />
              <Stat label="Visitas próximas" value={counts.upcomingVisits} href="/app/visitas" />
              <Stat label="Expedientes abiertos" value={counts.openCases} href="/app/gestion" />
              <Stat label="Cierres del mes" value={counts.wonThisMonth} href="/app/gestion" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Todo title="Leads por contactar" count={today.leadsToContact.length} href="/app/leads" empty="No tienes leads nuevos sin atender.">
                {today.leadsToContact.map((l) => (
                  <Row key={l.id} href="/app/leads" main={l.contact.fullName} sub={`${l.property ? `${l.property.code} · ${l.property.title}` : "Consulta general"} · ${l.contact.phone ?? "sin teléfono"}`} />
                ))}
              </Todo>
              <Todo title="Visitas por confirmar" count={today.visitRequests.length} href="/app/visitas" empty="No hay solicitudes de visita pendientes.">
                {today.visitRequests.map((v) => (
                  <Row key={v.id} href="/app/visitas" main={`${v.contact.fullName} · ${v.property.code}`} sub={fmtDateTime(v.scheduledAt)} />
                ))}
              </Todo>
              <Todo title="Próximas visitas" count={today.upcomingVisits.length} href="/app/visitas" empty="No tienes visitas confirmadas en los próximos 7 días.">
                {today.upcomingVisits.map((v) => (
                  <Row key={v.id} href="/app/visitas" main={`${v.contact.fullName} · ${v.property.code}`} sub={fmtDateTime(v.scheduledAt)} />
                ))}
              </Todo>
              <Todo title="Expedientes sin movimiento" count={today.stalledCases.length} href="/app/gestion" empty="Ningún expediente lleva más de 14 días detenido.">
                {today.stalledCases.map((c) => (
                  <Row key={c.id} href={`/app/gestion/${c.id}`} main={`${c.code} · ${c.property.title}`} sub={`Sin cambios desde ${fmtDateTime(c.updatedAt)}`} />
                ))}
              </Todo>
            </div>

            <Card>
              <h2 className="mb-4 font-semibold text-ink">Expedientes abiertos por paso</h2>
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                {STAGES.map((s, i) => (
                  <li key={s} className="rounded-xl bg-surface px-3 py-3">
                    <p className="text-xs font-medium text-ink/65">Paso {i + 1}</p>
                    <p className="text-sm font-semibold text-ink">{STAGE[s]}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-brand-ink">{casesByStage[s] ?? 0}</p>
                  </li>
                ))}
              </ol>
            </Card>

            {today.quietProperties.length > 0 && (
              <Card>
                <h2 className="mb-1 font-semibold text-ink">Propiedades publicadas sin interesados en 30 días</h2>
                <p className="mb-3 text-sm text-ink/65">Revisa precio, fotos o descripción.</p>
                <ul className="divide-y divide-ink/10">
                  {today.quietProperties.map((p) => (
                    <Row key={p.id} href={`/app/propiedades/${p.id}`} main={`${p.code} · ${p.title}`} sub={`${p.viewCount} visualizaciones`} />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </Loader>
    </>
  );
}
