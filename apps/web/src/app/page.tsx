import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SavedLinks, Testimonials } from "@/components/PortalExtras";
import { PortalHome, type PortalSearch, type PortalSummary } from "@/components/PortalHome";
import { PortalMap } from "@/components/PortalMap";
import { PublicChrome, type Site } from "@/components/PublicChrome";
import { isTenantHost, serverGet } from "@/lib/server-api";

type Search = { q?: string; operation?: string; type?: string };

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isTenantHost())) return {};
  const site = await serverGet<Site>("/public/site");
  return site ? { title: `${site.name} · Propiedades`, description: site.about ?? `Propiedades en venta y alquiler de ${site.name}` } : {};
}

function Landing() {
  return (
    <main className="flex flex-1 flex-col bg-brand-deep text-on-brand">
      <header className="px-6 py-5 sm:px-10"><Logo onDark /></header>
      <section className="flex flex-1 flex-col justify-center gap-6 px-6 pb-24 sm:px-10">
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">El sistema operativo de tu inmobiliaria</h1>
        <p className="max-w-xl text-lg text-on-brand/85">Propiedades, clientes, visitas, negociaciones, finanzas y comisiones en un solo lugar.</p>
        <div>
          <Link href="/login" className="inline-flex h-12 items-center rounded-lg bg-accent-lime px-6 font-semibold text-on-accent transition hover:brightness-95">
            Iniciar sesión
          </Link>
        </div>
      </section>
    </main>
  );
}

const EMPTY_SUMMARY: PortalSummary = { total: 0, byOperation: {}, byType: {}, cities: [], zones: [] };

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await isTenantHost())) return <Landing />;

  const site = await serverGet<Site>("/public/site");
  if (!site) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-2xl font-bold text-ink">Este portal no está disponible</h1>
        <p className="text-ink/70">Revisa la dirección o contacta a la inmobiliaria.</p>
      </main>
    );
  }
  const sp = await searchParams;
  const start = { q: typeof sp.q === "string" ? sp.q.slice(0, 120) : "", operation: typeof sp.operation === "string" ? sp.operation : "", type: typeof sp.type === "string" ? sp.type : "" };
  const params = new URLSearchParams(Object.entries(start).filter(([, v]) => v));
  const [summary, initial] = await Promise.all([
    serverGet<PortalSummary>("/public/summary"),
    serverGet<PortalSearch>(`/public/search?${params}`),
  ]);

  return (
    <PublicChrome site={site}>
      <PortalHome about={site.about} summary={summary ?? EMPTY_SUMMARY} initial={initial ?? { understood: "", results: [], alternatives: [], suggestions: [] }} start={start} />
      <SavedLinks />
      <PortalMap />
      <Testimonials />
    </PublicChrome>
  );
}
