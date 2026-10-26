"use client";

import { useState } from "react";
import { Card, Input, Loader, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { reportUrl } from "@/lib/images";

type ReportInfo = { id: string; title: string; finance: boolean };
const FORMATS: Array<[string, string]> = [["xlsx", "Excel"], ["pdf", "PDF"], ["csv", "CSV"]];

export default function ReportsPage() {
  const state = useFetch<ReportInfo[]>("/reports");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <>
      <PageHeader title="Reportes" subtitle="Descarga cada reporte en Excel, PDF o CSV. Sin fechas, incluye todo el historial." />
      <div className="mb-5 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-ink/80">Desde <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-ink/80">Hasta <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <Loader state={state}>
        {(reports) => (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Card className="flex h-full items-center justify-between gap-3 p-4">
                  <div>
                    <h2 className="font-semibold text-ink">{r.title}</h2>
                    <p className="text-xs text-ink/65">{r.finance ? "Finanzas" : "Operación"}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {FORMATS.map(([format, label]) => (
                      <a key={format} href={reportUrl(r.id, format, from, to)} className="inline-flex h-8 items-center rounded-lg border border-ink/20 bg-white px-3 text-sm font-semibold text-ink hover:bg-ink/5" aria-label={`${r.title} en ${label}`}>
                        {label}
                      </a>
                    ))}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Loader>
    </>
  );
}
