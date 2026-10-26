"use client";

import Link from "next/link";
import { AnswerList, type AnswerItem } from "@/components/AnswerList";
import { Badge, Card, Empty, Loader, PageHeader, type Tone } from "@/components/ui";
import { useFetch } from "@/lib/api";

type Alert = { key: string; severity: "high" | "medium" | "low"; title: string; detail: string; link: string; count: number; items: AnswerItem[] };
const SEVERITY: Record<Alert["severity"], { label: string; tone: Tone }> = {
  high: { label: "Urgente", tone: "red" },
  medium: { label: "Importante", tone: "amber" },
  low: { label: "Para revisar", tone: "teal" },
};

export default function AlertsPage() {
  const state = useFetch<Alert[]>("/alerts");
  return (
    <>
      <PageHeader title="Alertas" subtitle="Lo que necesita tu atención hoy, ordenado por urgencia." />
      <Loader state={state}>
        {(alerts) =>
          alerts.length === 0 ? <Empty title="Estás al día">No hay leads sin atender, visitas por confirmar ni operaciones detenidas.</Empty> : (
            <div className="grid gap-4 lg:grid-cols-2">
              {alerts.map((a) => (
                <Card key={a.key}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-ink">{a.title}</h2>
                    <Badge tone={SEVERITY[a.severity].tone}>{SEVERITY[a.severity].label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink/70">{a.detail}</p>
                  <AnswerList items={a.items} />
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-ink/65">{a.count > a.items.length ? `y ${a.count - a.items.length} más` : ""}</span>
                    <Link href={a.link} className="font-semibold text-link hover:underline">Ir a resolver</Link>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </Loader>
    </>
  );
}
