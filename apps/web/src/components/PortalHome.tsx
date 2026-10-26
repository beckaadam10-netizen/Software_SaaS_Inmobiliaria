"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { imageUrl } from "@/lib/images";
import { money, OPERATION, PROPERTY_TYPE } from "@/lib/labels";

export type PortalCard = {
  code: string; title: string; type: string; operation: string; price: string | number; currency: string; zone: string | null; city: string | null;
  bedrooms: number | null; bathrooms: number | null; areaM2: number | null; builtM2: number | null; images: Array<{ id: string }>;
};
export type PortalSearch = { understood: string; results: PortalCard[]; alternatives: Array<PortalCard & { why: string[] }>; suggestions: string[] };
export type PortalSummary = { total: number; byOperation: Record<string, number>; byType: Record<string, number>; cities: string[]; zones: string[] };
type Filters = { q: string; operation: string; type: string };

/** Palabras que rotan en el título: los tipos de inmueble que la empresa tiene publicados. */
const WORD: Record<string, string> = { HOUSE: "tu próxima casa", APARTMENT: "tu próximo departamento", LAND: "tu próximo terreno", OFFICE: "tu próxima oficina", COMMERCIAL: "tu próximo local", WAREHOUSE: "tu próximo galpón" };
const PLURAL: Record<string, string> = { HOUSE: "casas", APARTMENT: "departamentos", LAND: "terrenos", OFFICE: "oficinas", COMMERCIAL: "locales", WAREHOUSE: "galpones", OTHER: "otros" };
/** "casas, departamentos y terrenos" con mayúscula inicial. */
const listing = (words: string[]) => {
  const text = words.length > 1 ? `${words.slice(0, -1).join(", ")} y ${words[words.length - 1]}` : (words[0] ?? "inmuebles");
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const EXAMPLES = ["casa con jardín en Equipetrol", "departamento 2 dormitorios", "terreno hasta 80000", "alquiler zona Norte"];

function RotatingWord({ words }: { words: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (words.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % words.length), 2400);
    return () => window.clearInterval(t);
  }, [words.length]);
  return (
    <span className="relative inline-block text-accent-lime sm:whitespace-nowrap" aria-live="off">
      <span key={i} className="inline-block animate-[portal-word_.5s_ease-out]">{words[i] ?? "tu próximo hogar"}</span>
    </span>
  );
}

export function PropertyCard({ p, why }: { p: PortalCard; why?: string[] }) {
  const size = p.builtM2 ?? p.areaM2;
  return (
    <Link href={`/p/${p.code}`} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-ink/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-2 hover:ring-brand-teal">
      <div className="relative aspect-[16/10] overflow-hidden bg-brand-deep/10">
        {p.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(p.images[0].id)} alt={p.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink/55">Fotos próximamente</div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-accent-lime px-2.5 py-0.5 text-xs font-bold text-on-accent shadow-sm">{OPERATION[p.operation]}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xl font-extrabold text-brand-ink">{money(p.price, p.currency)}</p>
        <h3 className="mt-0.5 truncate font-semibold text-ink">{p.title}</h3>
        <p className="truncate text-sm text-ink/70">{[PROPERTY_TYPE[p.type], p.zone, p.city].filter(Boolean).join(" · ")}</p>
        <p className="mt-3 text-sm text-ink/80">
          {[p.bedrooms != null && `${p.bedrooms} hab.`, p.bathrooms != null && `${p.bathrooms} ${p.bathrooms === 1 ? "baño" : "baños"}`, size != null && `${size} m²`].filter(Boolean).join(" · ")}
        </p>
        {why && why.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Diferencias con tu búsqueda">
            {why.map((w) => <li key={w} className="rounded-full bg-lime-soft px-2.5 py-0.5 text-xs font-medium text-ink">{w}</li>)}
          </ul>
        )}
      </div>
    </Link>
  );
}

function Grid({ items }: { items: Array<PortalCard & { why?: string[] }> }) {
  return (
    <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => <li key={p.code}><PropertyCard p={p} why={p.why} /></li>)}
    </ul>
  );
}

/** Portada del portal: título dinámico, búsqueda en vivo con filtros y resultados con alternativas. */
export function PortalHome({ about, summary, initial, start }: { about: string | null; summary: PortalSummary; initial: PortalSearch; start: Filters }) {
  const [f, setF] = useState<Filters>(start);
  const [data, setData] = useState<PortalSearch>(initial);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const first = useRef(true);
  const results = useRef<HTMLDivElement>(null);

  const types = Object.keys(summary.byType).filter((t) => WORD[t]).sort((a, b) => summary.byType[b] - summary.byType[a]);
  const words = types.length ? types.map((t) => WORD[t]) : [WORD.HOUSE, WORD.APARTMENT, WORD.LAND];
  const city = summary.cities[0];
  const ops = Object.keys(OPERATION).filter((o) => summary.byOperation[o]);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    let alive = true;
    const t = window.setTimeout(() => {
      setLoading(true);
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
      api<PortalSearch>(`/public/search?${qs}`)
        .then((d) => { if (alive) setData(d); })
        .catch(() => null)
        .finally(() => { if (alive) setLoading(false); });
      // La dirección refleja la búsqueda para poder compartirla (si el navegador lo permite).
      try { window.history.replaceState(null, "", qs.toString() ? `?${qs}` : window.location.pathname); } catch { /* sin historial */ }
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [f]);

  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));
  function submit(e: FormEvent) {
    e.preventDefault();
    setFocused(false);
    results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const searching = !!(f.q.trim() || f.operation || f.type);
  const pill = (on: boolean) => `h-9 rounded-full px-4 text-sm font-semibold transition ${on ? "bg-accent-lime text-on-accent shadow-sm" : "bg-on-brand/10 text-on-brand ring-1 ring-on-brand/25 hover:bg-on-brand/20"}`;

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-brand-deep px-5 py-10 text-on-brand shadow-xl sm:px-10 sm:py-14" aria-labelledby="portal-title">
        {/* Fondo decorativo con los colores de la marca. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,color-mix(in_srgb,var(--color-brand-teal)_85%,transparent),transparent_45%),radial-gradient(circle_at_10%_110%,color-mix(in_srgb,var(--color-accent-lime)_30%,transparent),transparent_40%)]" />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full bg-on-brand/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-on-brand/20">
            <span className="h-2 w-2 rounded-full bg-accent-lime" aria-hidden />
            {summary.total} {summary.total === 1 ? "propiedad disponible" : "propiedades disponibles"}{city ? ` · ${city}` : ""}
          </p>
          <h1 id="portal-title" className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Encuentra <RotatingWord words={words} />{city ? <><br className="hidden sm:block" /> en {city}</> : null}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-on-brand/85 sm:text-lg">
            {about ?? `${listing(types.slice(0, 3).map((t) => PLURAL[t]))} seleccionados por nuestros agentes, con fotos reales y atención directa.`}
          </p>

          <form onSubmit={submit} role="search" className="mt-7 rounded-2xl bg-white p-2 text-ink shadow-lg ring-1 ring-ink/10">
            <div className="grid gap-2 sm:grid-cols-[1fr_190px_auto]">
              <div className="relative">
                <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/50" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input
                  type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 150)}
                  placeholder={`Prueba: ${EXAMPLES[0]}`} aria-label="Buscar" autoComplete="off"
                  className="h-12 w-full rounded-xl bg-surface pl-11 pr-3 text-base text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/45 focus:ring-2 focus:ring-brand-teal"
                />
                {focused && data.suggestions.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-ink/10" aria-label="Zonas sugeridas">
                    {data.suggestions.map((s) => (
                      <li key={s}>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { set({ q: f.q.replace(/\S*$/, s) }); setFocused(false); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-ink hover:bg-surface">
                          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-link" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <select value={f.type} onChange={(e) => set({ type: e.target.value })} aria-label="Tipo de inmueble" className="h-12 rounded-xl bg-surface px-3 text-sm font-medium text-ink ring-1 ring-ink/10 focus:ring-2 focus:ring-brand-teal">
                <option value="">Todo tipo de inmueble</option>
                {Object.entries(PROPERTY_TYPE).filter(([k]) => k !== "OTHER").map(([k, v]) => <option key={k} value={k}>{v}{summary.byType[k] ? ` (${summary.byType[k]})` : ""}</option>)}
              </select>
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent-lime px-6 text-base font-bold text-on-accent shadow-sm transition hover:brightness-95 active:scale-[.98]">
                Buscar
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Operación">
            <button type="button" aria-pressed={!f.operation} onClick={() => set({ operation: "" })} className={pill(!f.operation)}>Todas</button>
            {ops.map((o) => <button key={o} type="button" aria-pressed={f.operation === o} onClick={() => set({ operation: f.operation === o ? "" : o })} className={pill(f.operation === o)}>{OPERATION[o]} <span className="opacity-70">{summary.byOperation[o]}</span></button>)}
          </div>
          {summary.zones.length > 0 && (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-brand/80">
              <span>Zonas populares:</span>
              {summary.zones.slice(0, 6).map((z) => <button key={z} type="button" onClick={() => set({ q: z })} className="font-semibold text-on-brand underline decoration-accent-lime decoration-2 underline-offset-4 hover:text-accent-lime">{z}</button>)}
            </p>
          )}
        </div>
      </section>

      <div ref={results} className="scroll-mt-4 pt-8" aria-live="polite" aria-busy={loading}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink">{searching ? (data.results.length ? `${data.results.length} ${data.results.length === 1 ? "resultado" : "resultados"}` : "Sin coincidencias exactas") : "Recién publicadas"}</h2>
            {searching && <p className="text-sm text-ink/70">Buscamos {data.understood}{loading ? "…" : ""}</p>}
          </div>
          {searching && <button type="button" onClick={() => setF({ q: "", operation: "", type: "" })} className="text-sm font-semibold text-link hover:underline">Limpiar búsqueda</button>}
        </div>
        {data.results.length > 0 ? <Grid items={data.results} /> : (
          <p className="mt-5 rounded-2xl border border-dashed border-ink/25 bg-white px-6 py-8 text-center text-ink/75">
            No encontramos exactamente eso{f.q ? <> para <strong className="text-ink">«{f.q}»</strong></> : null}. Mira estas opciones parecidas o escríbenos y te ayudamos a encontrarla.
          </p>
        )}
        {data.alternatives.length > 0 && (
          <section className="mt-10" aria-labelledby="alternativas">
            <h2 id="alternativas" className="text-xl font-bold tracking-tight text-ink">{data.results.length ? "También te pueden interesar" : "Te pueden interesar"}</h2>
            <p className="text-sm text-ink/70">Opciones parecidas a lo que buscas; te contamos en qué cambian.</p>
            <Grid items={data.alternatives} />
          </section>
        )}
      </div>
    </>
  );
}
