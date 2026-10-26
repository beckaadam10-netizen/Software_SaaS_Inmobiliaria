"use client";

import Link from "next/link";
import { CompareTable, type CompareData } from "@/components/CompareTable";
import { Empty, Loader, Loading, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { useQueryParam } from "@/lib/query";

export default function ComparePage() {
  const ids = useQueryParam("ids");
  const count = (ids ?? "").split(",").filter(Boolean).length;
  const state = useFetch<CompareData & { properties: Array<{ id: string }> }>(count >= 2 ? `/compare?ids=${encodeURIComponent(ids!)}` : null);
  return (
    <>
      <PageHeader title="Comparar propiedades" subtitle="El mejor valor de cada fila va resaltado. Los precios solo se comparan entre propiedades de la misma operación y moneda.">
        <Link href="/app/propiedades" className="inline-flex h-10 items-center rounded-lg border border-ink/20 bg-white px-4 text-sm font-semibold text-ink hover:bg-ink/5">Elegir otras</Link>
      </PageHeader>
      {ids === null ? <Loading /> : count < 2 ? <Empty title="Elige de 2 a 4 propiedades">En Propiedades, marca “Comparar” en cada una y pulsa el botón Comparar.</Empty> : (
        <Loader state={state}>{(d) => d.properties.length < 2 ? <Empty title="No hay suficientes propiedades para comparar" /> : <CompareTable data={d} href={(p) => `/app/propiedades/${p.id}`} />}</Loader>
      )}
    </>
  );
}
