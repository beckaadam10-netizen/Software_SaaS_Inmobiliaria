"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFetch } from "@/lib/api";
import { useSession } from "./Shell";

type Tab = { href: string; label: string; full?: boolean; feature?: string };
/** Pestañas del módulo financiero agrupadas por tema; se muestran las del grupo de la pantalla actual. */
const GROUPS: Array<{ name: string; tabs: Tab[] }> = [
  { name: "Día a día", tabs: [
    { href: "/app/finanzas", label: "Resumen" },
    { href: "/app/finanzas/movimientos", label: "Ingresos y gastos" },
    { href: "/app/finanzas/por-cobrar", label: "Por cobrar", full: true },
    { href: "/app/finanzas/por-pagar", label: "Por pagar", full: true },
  ] },
  { name: "Comisiones", tabs: [
    { href: "/app/finanzas/comisiones", label: "Comisiones" },
    { href: "/app/finanzas/liquidaciones", label: "Liquidaciones", full: true },
  ] },
  { name: "Análisis", tabs: [
    { href: "/app/finanzas/flujo-de-caja", label: "Flujo de caja", full: true },
    { href: "/app/finanzas/rentabilidad", label: "Rentabilidad", full: true },
    { href: "/app/finanzas/reportes", label: "Reportes" },
  ] },
  { name: "Contabilidad y fiscal", tabs: [
    { href: "/app/finanzas/facturas", label: "Facturas", feature: "invoicing" },
    { href: "/app/finanzas/libros-iva", label: "Libros IVA", feature: "invoicing" },
    { href: "/app/finanzas/contabilidad", label: "Contabilidad", feature: "accounting" },
    { href: "/app/finanzas/bancos", label: "Bancos", feature: "bank_reconciliation" },
  ] },
];

/** Navegación del módulo financiero: primero el grupo, luego sus pestañas. Las de finanzas completas se ocultan en planes básicos. */
export function FinanceTabs() {
  const user = useSession();
  const pathname = usePathname();
  const usage = useFetch<{ plan: { features: string[] } }>("/users/usage");
  if (user.role === "AGENT") return null;
  const features = usage.data?.plan.features;
  const full = !features || features.some((f) => f === "finance_full" || f === "finance_advanced");
  const groups = GROUPS.map((g) => ({ ...g, tabs: g.tabs.filter((t) => (full || !t.full) && (!t.feature || !features || features.includes(t.feature))) })).filter((g) => g.tabs.length);
  const current = groups.find((g) => g.tabs.some((t) => t.href === pathname)) ?? groups[0];
  return (
    <nav aria-label="Finanzas" className="mb-6">
      <ul className="flex flex-wrap gap-1.5" aria-label="Grupos de Finanzas">
        {groups.map((g) => {
          const on = g === current;
          return (
            <li key={g.name}>
              <Link href={g.tabs[0].href} aria-current={on ? "true" : undefined}
                className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition ${on ? "bg-brand-deep text-on-brand" : "bg-white text-ink ring-1 ring-ink/15 hover:bg-ink/5"}`}>
                {g.name}
              </Link>
            </li>
          );
        })}
      </ul>
      {current && current.tabs.length > 1 && (
        <ul className="-mx-4 mt-3 flex gap-1 overflow-x-auto border-b border-ink/15 px-4 sm:mx-0 sm:px-0">
          {current.tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined}
                  className={`block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${active ? "border-brand-teal text-brand-ink" : "border-transparent text-ink/70 hover:text-ink"}`}>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
