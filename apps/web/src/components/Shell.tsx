"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, isBranchManager, type Role, type SessionUser } from "@/lib/api";
import { brandStyle } from "@/lib/brand";
import { ROLE } from "@/lib/labels";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { ThemeSwitch } from "./ThemeSwitch";
import { TopBar } from "./TopBar";
import { ErrorNote, Loading } from "./ui";

const SessionContext = createContext<SessionUser | null>(null);
export const useSession = () => useContext(SessionContext)!;
export const canEdit = (role: Role) => role === "ADMIN" || role === "AGENT";
/** Finanzas las gestionan el administrador y el contador. */
export const canFinance = (role: Role) => role === "ADMIN" || role === "ACCOUNTANT";
/** Permiso puntual del usuario; el administrador los tiene todos. */
export const hasPermission = (user: SessionUser, key: string) => user.role === "ADMIN" || !!user.permissions?.includes(key);
export { isBranchManager };
/** Puede elegir a qué agente asignar: el administrador (todos) o el jefe de sucursal (los de su sucursal). */
export const canAssignAgents = (user: SessionUser) => user.role === "ADMIN" || isBranchManager(user);

/**
 * Ítem del menú. `section` lo agrupa en un módulo desplegable; sin sección queda arriba, siempre visible.
 * `full` exige finanzas completas; `finance` exige algún módulo financiero.
 */
export type NavItem = { href: string; label: string; section?: string; roles?: Role[]; exact?: boolean; feature?: string; badge?: boolean; finance?: boolean; full?: boolean };

/** Módulos del menú del panel, en este orden. */
export const PANEL_SECTIONS = ["Mi día", "Ventas", "Inventario y clientes", "Marketing", "Finanzas", "Contabilidad y fiscal", "Configuración"];
const FIN: Role[] = ["ADMIN", "ACCOUNTANT"];
export const PANEL_NAV: NavItem[] = [
  { href: "/app", label: "Inicio", exact: true },
  { href: "/app/asistente", label: "Asistente", section: "Mi día", feature: "ai_advanced" },
  { href: "/app/alertas", label: "Alertas", section: "Mi día" },
  { href: "/app/tareas", label: "Tareas", section: "Mi día" },
  { href: "/app/notificaciones", label: "Notificaciones", section: "Mi día", badge: true },
  { href: "/app/gestion", label: "Gestión comercial", section: "Ventas" },
  { href: "/app/presentacion", label: "Mensajes de presentación", section: "Ventas", roles: ["ADMIN", "AGENT"] },
  { href: "/app/leads", label: "Leads", section: "Ventas" },
  { href: "/app/visitas", label: "Visitas", section: "Ventas" },
  { href: "/app/negociaciones", label: "Negociaciones", section: "Ventas" },
  { href: "/app/postventa", label: "Postventa", section: "Ventas" },
  { href: "/app/propiedades", label: "Propiedades", section: "Inventario y clientes" },
  { href: "/app/mapa", label: "Mapa", section: "Inventario y clientes" },
  { href: "/app/contactos", label: "Contactos", section: "Inventario y clientes" },
  { href: "/app/propietarios", label: "Propietarios", section: "Inventario y clientes", roles: ["ADMIN"], feature: "owner_portal" },
  { href: "/app/marketing", label: "Marketing", section: "Marketing", feature: "marketing" },
  { href: "/app/analitica", label: "Analítica", section: "Marketing", feature: "analytics_advanced" },
  { href: "/app/finanzas", label: "Resumen", section: "Finanzas", roles: FIN, finance: true, exact: true },
  { href: "/app/finanzas/movimientos", label: "Ingresos y gastos", section: "Finanzas", roles: FIN, finance: true },
  { href: "/app/finanzas/por-cobrar", label: "Por cobrar", section: "Finanzas", roles: FIN, finance: true, full: true },
  { href: "/app/finanzas/por-pagar", label: "Por pagar", section: "Finanzas", roles: FIN, finance: true, full: true },
  { href: "/app/finanzas/comisiones", label: "Comisiones", section: "Finanzas", roles: FIN, finance: true },
  { href: "/app/finanzas/liquidaciones", label: "Liquidaciones", section: "Finanzas", roles: FIN, finance: true, full: true },
  { href: "/app/finanzas/flujo-de-caja", label: "Flujo de caja", section: "Finanzas", roles: FIN, finance: true, full: true },
  { href: "/app/finanzas/rentabilidad", label: "Rentabilidad", section: "Finanzas", roles: FIN, finance: true, full: true },
  { href: "/app/finanzas/reportes", label: "Reportes", section: "Finanzas", roles: FIN, finance: true },
  { href: "/app/finanzas/mis-comisiones", label: "Mis comisiones", section: "Finanzas", roles: ["AGENT"], finance: true },
  { href: "/app/finanzas/facturas", label: "Facturas", section: "Contabilidad y fiscal", roles: FIN, feature: "invoicing" },
  { href: "/app/finanzas/libros-iva", label: "Libros IVA", section: "Contabilidad y fiscal", roles: FIN, feature: "invoicing" },
  { href: "/app/finanzas/contabilidad", label: "Contabilidad", section: "Contabilidad y fiscal", roles: FIN, feature: "accounting" },
  { href: "/app/finanzas/bancos", label: "Bancos", section: "Contabilidad y fiscal", roles: FIN, feature: "bank_reconciliation" },
  { href: "/app/empresa", label: "Mi empresa", section: "Configuración", roles: ["ADMIN"] },
  { href: "/app/equipo", label: "Equipo y plan", section: "Configuración", roles: ["ADMIN"] },
  { href: "/app/sucursales", label: "Sucursales", section: "Configuración", roles: ["ADMIN"], feature: "multi_branch" },
  { href: "/app/automatizaciones", label: "Automatizaciones", section: "Configuración", roles: ["ADMIN"] },
  { href: "/app/integraciones", label: "Integraciones", section: "Configuración", roles: ["ADMIN"], feature: "integrations" },
  { href: "/app/auditoria", label: "Auditoría", section: "Configuración", roles: ["ADMIN"] },
];
export const ADMIN_SECTIONS = ["Plataforma"];
export const ADMIN_NAV: NavItem[] = [
  { href: "/superadmin", label: "Empresas", section: "Plataforma", exact: true },
  { href: "/superadmin/planes", label: "Planes", section: "Plataforma" },
  { href: "/superadmin/ia", label: "Consumo de IA", section: "Plataforma" },
  { href: "/superadmin/dominios", label: "Dominios", section: "Plataforma" },
];
const MENU_KEY = "softinmo.menu";

/** Marco del panel: verifica la sesión, muestra el menú y deja el contenido a la derecha. */
export function Shell({ nav, sections = [], zone, children }: { nav: NavItem[]; sections?: string[]; zone: "tenant" | "platform"; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [features, setFeatures] = useState<string[] | null>(null);
  const [unread, setUnread] = useState(0);
  // Módulos abiertos o cerrados por la persona; se recuerdan en este navegador.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MENU_KEY) ?? "{}");
      if (saved && typeof saved === "object") queueMicrotask(() => setOpenSections(saved));
    } catch {
      /* sin almacenamiento: todo empieza según la pantalla actual */
    }
  }, []);

  // Módulos del plan y avisos sin leer (se consultan cada minuto y al cambiar de pantalla).
  useEffect(() => {
    if (!user || zone !== "tenant") return;
    api<{ plan: { features: string[] } }>("/users/usage").then((u) => setFeatures(u.plan.features)).catch(() => null);
  }, [user, zone]);
  useEffect(() => {
    if (!user || zone !== "tenant") return;
    const load = () => api<{ unread: number }>("/notifications").then((n) => setUnread(n.unread)).catch(() => null);
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [user, zone, pathname]);

  useEffect(() => {
    api<SessionUser>("/auth/me")
      .then((u) => {
        // Cada zona es para su tipo de usuario.
        if (zone === "platform" && u.role !== "SUPERADMIN") router.replace("/app");
        else if (zone === "tenant" && u.role === "SUPERADMIN") router.replace("/superadmin");
        else if (u.role === "OWNER") router.replace("/propietario");
        else setUser(u);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        else setError(e instanceof ApiError ? e.message : "Ocurrió un error");
      });
  }, [router, zone]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
  }

  if (error) return <main className="p-8"><ErrorNote>{error}</ErrorNote></main>;
  if (!user) return <main className="flex-1"><Loading /></main>;

  const fullFinance = !features || features.some((f) => f === "finance_full" || f === "finance_advanced");
  const items = nav.filter((i) => (!i.roles || i.roles.includes(user.role)) && (!i.feature || !features || features.includes(i.feature))
    && (!i.finance || !features || features.some((f) => f.startsWith("finance"))) && (!i.full || fullFinance));
  // La pantalla activa es la de la ruta más larga que coincide (así "Finanzas › Resumen" no se marca en sus subpáginas).
  const matches = (i: NavItem) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`));
  const current = items.filter(matches).sort((a, b) => b.href.length - a.href.length)[0];
  const active = (i: NavItem) => i === current;
  const top = items.filter((i) => !i.section);
  const groups = sections.map((name) => ({ name, items: items.filter((i) => i.section === name) })).filter((g) => g.items.length);
  const isOpen = (name: string) => openSections[name] ?? current?.section === name;
  function toggle(name: string) {
    const fallback = current?.section === name;
    setOpenSections((prev) => {
      const next = { ...prev, [name]: !(prev[name] ?? fallback) };
      try { localStorage.setItem(MENU_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
      return next;
    });
  }
  const link = (i: NavItem, nested = false) => (
    <Link
      key={i.href}
      href={i.href}
      onClick={() => setOpen(false)}
      aria-current={active(i) ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-lg py-2 text-sm font-medium transition ${nested ? "pl-9 pr-3" : "px-3"} ${
        active(i) ? "bg-accent-lime text-on-accent" : "text-on-brand/90 hover:bg-on-brand/10"
      }`}
    >
      {i.label}
      {i.badge && unread > 0 && (
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${active(i) ? "bg-brand-deep text-on-brand" : "bg-accent-lime text-on-accent"}`}>
          {unread}<span className="sr-only"> sin leer</span>
        </span>
      )}
    </Link>
  );
  // En el panel de una empresa se ve su marca; la de Soft_Inmo queda para la plataforma.
  const brand = zone === "tenant" ? user.tenant : null;
  const mark = brand?.logo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={brand.logo} alt={brand.name} className="h-9 w-auto max-w-[10rem] rounded bg-[#ffffff] object-contain p-0.5" />
    : brand?.hideBrand ? <span className="text-lg font-bold tracking-tight text-on-brand">{brand.name}</span> : <Logo onDark />;

  return (
    <SessionContext.Provider value={user}>
      <div className="brand-scope flex min-h-screen flex-1 flex-col lg:flex-row" style={brandStyle(brand)}>
        <header className="flex items-center justify-between bg-brand-deep px-4 py-3 lg:hidden">
          {mark}
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-lg border border-on-brand/40 px-3 py-1.5 text-sm font-medium text-on-brand">
            Menú
          </button>
        </header>

        <aside className={`${open ? "flex" : "hidden"} w-full shrink-0 flex-col bg-brand-deep text-on-brand lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64`}>
          <div className="hidden px-5 py-5 lg:block">
            {mark}
          </div>
          <p className="px-5 pb-3 text-xs font-medium uppercase tracking-wide text-on-brand/70">
            {user.tenant?.name ?? "Plataforma"}
          </p>
          <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-3" aria-label="Principal">
            {top.map((i) => link(i))}
            {groups.map((g) => {
              const expanded = isOpen(g.name);
              const id = `menu-${g.name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
              const hasCurrent = g.items.some(active);
              const alert = !expanded && g.items.some((i) => i.badge) && unread > 0;
              return (
                <div key={g.name} className="mt-1">
                  <button type="button" onClick={() => toggle(g.name)} aria-expanded={expanded} aria-controls={id}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold uppercase tracking-wide transition hover:bg-on-brand/10 ${hasCurrent ? "text-accent-lime" : "text-on-brand/75"}`}>
                    <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 5 5 5-5 5" /></svg>
                    <span className="flex-1">{g.name}</span>
                    {alert && <span className="h-2 w-2 rounded-full bg-accent-lime" aria-label="Avisos sin leer" />}
                    {!expanded && <span className="text-[11px] font-semibold text-on-brand/55 tabular-nums">{g.items.length}</span>}
                  </button>
                  {expanded && <div id={id} className="flex flex-col gap-0.5">{g.items.map((i) => link(i, true))}</div>}
                </div>
              );
            })}
          </nav>
          <div className="border-t border-on-brand/15 p-4">
            {zone === "tenant" ? (
              <Link href="/app/perfil" className="-m-1 flex items-center gap-3 rounded-lg p-1 hover:bg-on-brand/10" title="Mi perfil">
                <Avatar name={user.fullName} src={user.avatar} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{user.fullName}</span>
                  <span className="block text-xs text-on-brand/75">{ROLE[user.role]} · Mi perfil</span>
                </span>
              </Link>
            ) : (
              <>
                <p className="truncate text-sm font-semibold">{user.fullName}</p>
                <p className="text-xs text-on-brand/75">{ROLE[user.role]}</p>
              </>
            )}
            <div className="mt-3"><ThemeSwitch onDark /></div>
            <button onClick={logout} className="mt-3 w-full rounded-lg border border-on-brand/35 px-3 py-1.5 text-sm font-medium hover:bg-on-brand/10">
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {zone === "tenant" && <TopBar user={user} />}
          {children}
        </main>
      </div>
    </SessionContext.Provider>
  );
}
