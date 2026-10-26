"use client";

import Link from "next/link";
import { imageUrl } from "@/lib/images";
import { OPERATION, PROPERTY_TYPE } from "@/lib/labels";

export type CompareData = {
  properties: Array<{ id?: string; code: string; title: string; type: string; operation: string; images: Array<{ id: string }> }>;
  rows: Array<{ key: string; label: string; values: Array<string | null>; best: number[] }>;
  features: Array<{ name: string; has: boolean[] }>;
};

/** Tabla del comparador: una columna por propiedad; el mejor valor de cada fila va resaltado. */
export function CompareTable({ data, href, images = true }: { data: CompareData; href: (p: CompareData["properties"][number]) => string; images?: boolean }) {
  const cols = data.properties;
  const grid = { gridTemplateColumns: `minmax(8.5rem, 11rem) repeat(${cols.length}, minmax(10rem, 1fr))` };
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
      <div className="min-w-[36rem]" role="table" aria-label="Comparación de propiedades">
        <div className="grid border-b border-ink/10" style={grid} role="row">
          <div role="columnheader" className="p-4 text-xs font-semibold uppercase tracking-wide text-ink/60">Propiedad</div>
          {cols.map((p) => (
            <div key={p.code} role="columnheader" className="border-l border-ink/10 p-4">
              {images && (p.images[0]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={imageUrl(p.images[0].id)} alt="" className="mb-2 aspect-[16/10] w-full rounded-lg object-cover" />
                : <div className="mb-2 flex aspect-[16/10] items-center justify-center rounded-lg bg-ink/5 text-xs text-ink/55">Sin fotos</div>)}
              <Link href={href(p)} className="block text-sm font-bold text-link hover:underline">{p.code}</Link>
              <p className="text-sm font-semibold text-ink">{p.title}</p>
              <p className="text-xs text-ink/65">{PROPERTY_TYPE[p.type]} en {OPERATION[p.operation]?.toLowerCase()}</p>
            </div>
          ))}
        </div>
        {data.rows.map((r) => (
          <div key={r.key} className="grid border-b border-ink/10 last:border-0" style={grid} role="row">
            <div role="rowheader" className="px-4 py-3 text-sm font-medium text-ink/75">{r.label}</div>
            {r.values.map((v, i) => {
              const best = r.best.includes(i);
              return (
                <div key={i} role="cell" className={`border-l border-ink/10 px-4 py-3 text-sm tabular-nums ${best ? "bg-lime-soft font-bold text-ink" : "text-ink"}`}>
                  {v ?? <span className="text-ink/45">Sin dato</span>}
                  {best && <span className="ml-1.5 text-xs font-semibold text-ink/70">mejor</span>}
                </div>
              );
            })}
          </div>
        ))}
        {data.features.length > 0 && (
          <>
            <div className="border-b border-ink/10 bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink/60">Características</div>
            {data.features.map((f) => (
              <div key={f.name} className="grid border-b border-ink/10 last:border-0" style={grid} role="row">
                <div role="rowheader" className="px-4 py-2.5 text-sm text-ink/75">{f.name}</div>
                {f.has.map((h, i) => <div key={i} role="cell" className="border-l border-ink/10 px-4 py-2.5 text-sm text-ink">{h ? "Sí" : <span className="text-ink/45">No</span>}</div>)}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
