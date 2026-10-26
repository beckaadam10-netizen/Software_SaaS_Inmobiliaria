"use client";

import Link from "next/link";
import { Card, Empty, Loader, Loading, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { useQueryParam } from "@/lib/query";

type Group = { key: string; label: string; items: Array<{ id: string; title: string; detail?: string; link: string }> };

export default function SearchPage() {
  const raw = useQueryParam("q");
  const q = raw ?? "";
  const state = useFetch<{ q: string; groups: Group[] }>(q.length >= 2 ? `/search?q=${encodeURIComponent(q)}` : null);
  return (
    <>
      <PageHeader title={q ? `Resultados para “${q}”` : "Búsqueda"} subtitle="Propiedades, clientes, propietarios, leads, equipo, operaciones, negociaciones y documentos." />
      {raw === null ? <Loading /> : q.length < 2 ? <Empty title="Escribe al menos 2 letras en el buscador" /> : (
        <Loader state={state}>
          {(r) => r.groups.length === 0 ? <Empty title="Sin resultados">Prueba con otra palabra, un código (DEM-0001) o un teléfono.</Empty> : (
            <div className="grid gap-4 lg:grid-cols-2">
              {r.groups.map((g) => (
                <Card key={g.key}>
                  <h2 className="mb-2 font-semibold text-ink">{g.label} <span className="font-normal text-ink/60">({g.items.length})</span></h2>
                  <ul className="divide-y divide-ink/10">
                    {g.items.map((h) => (
                      <li key={h.id} className="py-2">
                        <Link href={h.link} className="text-sm font-semibold text-link hover:underline">{h.title}</Link>
                        {h.detail && <p className="text-sm text-ink/70">{h.detail}</p>}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </Loader>
      )}
    </>
  );
}
