"use client";

import { useState } from "react";
import { Badge, Button, Card, ErrorNote, Loader, PageHeader } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/labels";

type Automation = { key: string; name: string; description: string; trigger: "event" | "daily"; enabled: boolean; lastRun: string | null };
type RunResult = { key: string; name: string; ran: boolean; created: number; reason?: string };

export default function AutomationsPage() {
  const state = useFetch<Automation[]>("/automations");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[] | null>(null);

  async function toggle(a: Automation) {
    setError(null);
    try {
      await api(`/automations/${a.key}`, { method: "PATCH", json: { enabled: !a.enabled } });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function run() {
    setRunning(true);
    setError(null);
    try {
      setResults(await api<RunResult[]>("/automations/run", { method: "POST" }));
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
    setRunning(false);
  }

  const group = (list: Automation[], trigger: Automation["trigger"], title: string, help: string) => (
    <Card>
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="mb-2 text-sm text-ink/70">{help}</p>
      <ul className="divide-y divide-ink/10">
        {list.filter((a) => a.trigger === trigger).map((a) => (
          <li key={a.key} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{a.name}</p>
              <p className="text-sm text-ink/70">{a.description}</p>
              {a.lastRun && <p className="text-xs text-ink/60">Última ejecución: {fmtDateTime(a.lastRun)}</p>}
            </div>
            <button
              role="switch" aria-checked={a.enabled} aria-label={a.name} onClick={() => toggle(a)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal ${a.enabled ? "bg-brand-teal" : "bg-ink/25"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${a.enabled ? "left-[1.375rem]" : "left-0.5"}`} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );

  return (
    <>
      <PageHeader title="Automatizaciones" subtitle="El sistema crea tareas y avisos por ti. Enciende solo las que te sirvan.">
        <Button onClick={run} disabled={running}>{running ? "Ejecutando…" : "Ejecutar las diarias ahora"}</Button>
      </PageHeader>
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      {results && (
        <Card className="mb-6">
          <h2 className="mb-2 font-semibold text-ink">Resultado de la ejecución</h2>
          <ul className="divide-y divide-ink/10 text-sm">
            {results.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 py-2">
                <span className="text-ink">{r.name}</span>
                {r.ran ? <Badge tone={r.created ? "lime" : "neutral"}>{r.created ? `${r.created} generado(s)` : "Nada que hacer"}</Badge> : <Badge tone="neutral">{r.reason}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Loader state={state}>
        {(list) => (
          <div className="grid gap-6 lg:grid-cols-2">
            {group(list, "event", "Al ocurrir algo", "Se ejecutan en el momento, cuando pasa el evento.")}
            {group(list, "daily", "Una vez al día", "El sistema las revisa cada día; nunca se repiten el mismo día.")}
          </div>
        )}
      </Loader>
    </>
  );
}
