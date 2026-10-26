"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, isBranchManager, selectBranch, selectedBranch, type SessionUser } from "@/lib/api";
import { reloadView } from "@/lib/reload";

type Hit = { id: string; title: string; detail?: string; link: string };
type Group = { key: string; label: string; items: Hit[] };
type Branches = { enabled: boolean; items: Array<{ id: string; name: string }> };

/** Buscador global y selector de sucursal, arriba de cada pantalla del panel. */
export function TopBar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<Branches | null>(null);
  const [branch, setBranch] = useState("");
  const box = useRef<HTMLDivElement>(null);
  // El agente que ve solo lo suyo no elige sucursal.
  const canPickBranch = user.role !== "AGENT" || !!user.permissions?.includes("view_all");
  const manager = isBranchManager(user);

  useEffect(() => {
    if (!canPickBranch && !manager) return;
    api<Branches>("/branches").then((b) => {
      setBranches(b);
      const saved = selectedBranch();
      // Una sucursal guardada que ya no existe se olvida.
      if (saved && !b.items.some((x) => x.id === saved)) selectBranch("");
      else setBranch(saved);
    }).catch(() => null);
  }, [canPickBranch, manager]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      queueMicrotask(() => setGroups(null));
      return;
    }
    const timer = setTimeout(() => {
      api<{ groups: Group[] }>(`/search?q=${encodeURIComponent(term)}`).then((r) => { setGroups(r.groups); setOpen(true); }).catch(() => setGroups([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(link: string) {
    setOpen(false);
    setQ("");
    router.push(link);
  }
  function changeBranch(id: string) {
    selectBranch(id);
    // Recargar aplica la vista a todas las pantallas y listas a la vez.
    reloadView();
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div ref={box} className="relative min-w-0 flex-1 basis-64">
        <form role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) go(`/app/buscar?q=${encodeURIComponent(q.trim())}`); }}>
          <label className="sr-only" htmlFor="global-search">Buscar en todo el sistema</label>
          <input
            id="global-search" type="search" value={q} autoComplete="off" placeholder="Buscar propiedades, clientes, operaciones, documentos…"
            onChange={(e) => setQ(e.target.value)} onFocus={() => groups && setOpen(true)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className="h-11 w-full rounded-xl border border-ink/15 bg-white pl-10 pr-3 text-sm text-ink shadow-sm outline-none placeholder:text-ink/50 focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/25"
          />
          <svg viewBox="0 0 20 20" aria-hidden className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-ink/50"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </form>
        {open && groups && (
          <div className="absolute left-0 right-0 top-12 z-40 max-h-[70vh] overflow-y-auto rounded-xl bg-white p-2 shadow-xl ring-1 ring-ink/10">
            {groups.length === 0 ? <p className="px-3 py-4 text-sm text-ink/65">Sin resultados para “{q.trim()}”.</p> : (
              <>
                {groups.map((g) => (
                  <div key={g.key} className="py-1">
                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink/55">{g.label}</p>
                    <ul>
                      {g.items.slice(0, 4).map((h) => (
                        <li key={`${g.key}-${h.id}`}>
                          <button onClick={() => go(h.link)} className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-surface focus:bg-surface focus:outline-none">
                            <span className="block truncate text-sm font-semibold text-ink">{h.title}</span>
                            {h.detail && <span className="block truncate text-xs text-ink/65">{h.detail}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <Link href={`/app/buscar?q=${encodeURIComponent(q.trim())}`} onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-3 py-2 text-sm font-semibold text-link hover:bg-surface">Ver todos los resultados</Link>
              </>
            )}
          </div>
        )}
      </div>
      {manager && branches?.enabled && (
        <span className="inline-flex h-11 items-center rounded-xl bg-brand-deep px-3 text-sm font-semibold text-on-brand" title="Eres jefe de esta sucursal">
          Sucursal {branches.items.find((b) => b.id === user.branchId)?.name ?? ""} · Jefe
        </span>
      )}
      {canPickBranch && branches?.enabled && branches.items.length > 0 && (
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="whitespace-nowrap text-ink/70">Vista</span>
          <select value={branch} onChange={(e) => changeBranch(e.target.value)} className="h-11 rounded-xl border border-ink/15 bg-white px-3 text-sm font-semibold text-ink shadow-sm">
            <option value="">Toda la empresa</option>
            {branches.items.map((b) => <option key={b.id} value={b.id}>Sucursal {b.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
