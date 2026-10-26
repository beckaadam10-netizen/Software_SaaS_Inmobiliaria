"use client";

import Link from "next/link";
import { CompareTable, type CompareData } from "@/components/CompareTable";
import { PublicChrome, type Site } from "@/components/PublicChrome";
import { Empty, ErrorNote, Loader, Loading } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { useQueryParam } from "@/lib/query";

/** Comparador del portal: propiedades guardadas por el visitante, lado a lado. */
export default function PublicComparePage() {
  const site = useFetch<Site>("/public/site");
  const codes = useQueryParam("codes");
  const count = (codes ?? "").split(",").filter(Boolean).length;
  const data = useFetch<CompareData>(codes && count >= 2 ? `/public/compare?codes=${encodeURIComponent(codes)}` : null);
  if (site.error) return <main className="p-8"><ErrorNote>{site.error}</ErrorNote></main>;
  if (!site.data) return <Loading />;
  return (
    <PublicChrome site={site.data}>
      <Link href="/" className="text-sm font-medium text-link hover:underline">← Todas las propiedades</Link>
      <h1 className="mb-1 mt-3 text-3xl font-bold tracking-tight text-ink">Comparar propiedades</h1>
      <p className="mb-6 text-ink/70">El mejor valor de cada fila va resaltado.</p>
      {codes === null ? <Loading /> : count < 2 ? <Empty title="Guarda al menos dos propiedades">Usa el botón “Guardar” en cada ficha y vuelve aquí para compararlas.</Empty> : (
        <Loader state={data}>{(d) => d.properties.length < 2 ? <Empty title="Algunas propiedades ya no están disponibles" /> : <CompareTable data={d} href={(p) => `/p/${p.code}`} />}</Loader>
      )}
    </PublicChrome>
  );
}
