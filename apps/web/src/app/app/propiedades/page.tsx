"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PropertyForm } from "@/components/PropertyForm";
import { canEdit, hasPermission, useSession } from "@/components/Shell";
import { Badge, Button, Empty, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { money, OPERATION, PROPERTY_STATUS, PROPERTY_TYPE } from "@/lib/labels";
import { PROPERTY_TONE as STATUS_TONE } from "@/lib/tones";
import { imageUrl } from "@/lib/images";

type Property = {
  id: string; code: string; title: string; type: string; operation: string; status: string; isPublished: boolean;
  price: string; currency: string; zone: string | null; city: string | null; bedrooms: number | null; bathrooms: number | null; areaM2: number | null;
  agent: { fullName: string } | null; images: Array<{ id: string }>; _count: { leads: number; visits: number };
};

export default function PropertiesPage() {
  const user = useSession();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [operation, setOperation] = useState("");
  const [creating, setCreating] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const params = new URLSearchParams({ ...(q && { q }), ...(status && { status }), ...(operation && { operation }) });
  const state = useFetch<Property[]>(`/properties?${params}`);

  return (
    <>
      <PageHeader title="Propiedades" subtitle="Tu inventario de inmuebles.">
        <Link href="/app/mapa" className="inline-flex h-10 items-center rounded-lg border border-ink/20 bg-white px-4 text-sm font-semibold text-ink hover:bg-ink/5">Ver en el mapa</Link>
        {canEdit(user.role) && (user.role === "ADMIN" || hasPermission(user, "create_properties")) && <Button onClick={() => setCreating(true)}>Nueva propiedad</Button>}
      </PageHeader>

      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <Input type="search" placeholder="Buscar por título, código o zona" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <Select options={PROPERTY_STATUS} placeholder="Todos los estados" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Estado" />
        <Select options={OPERATION} placeholder="Toda operación" value={operation} onChange={(e) => setOperation(e.target.value)} aria-label="Operación" />
      </div>

      <Loader state={state}>
        {(items) =>
          items.length === 0 ? (
            <Empty title="No hay propiedades">{q || status || operation ? "Prueba con otros filtros." : "Registra la primera para abrir su expediente comercial."}</Empty>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((p) => (
                <li key={p.id} className="relative">
                  <label className={`absolute right-3 top-3 z-10 flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ${picked.includes(p.id) ? "bg-brand-deep text-on-brand ring-brand-deep" : "bg-white/95 text-ink ring-ink/15"}`}>
                    <input type="checkbox" className="h-3.5 w-3.5 accent-accent-lime" checked={picked.includes(p.id)} disabled={!picked.includes(p.id) && picked.length >= 4}
                      onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} aria-label={`Comparar ${p.code}`} />
                    Comparar
                  </label>
                  <Link href={`/app/propiedades/${p.id}`} className="block overflow-hidden rounded-2xl bg-white ring-1 ring-ink/10 transition hover:ring-brand-teal">
                    <div className="relative aspect-[16/10] bg-brand-deep/10">
                      {p.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl(p.images[0].id)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-ink/55">Sin fotos</div>
                      )}
                      <div className="absolute left-3 top-3 flex gap-1.5">
                        <Badge tone={STATUS_TONE[p.status]}>{PROPERTY_STATUS[p.status]}</Badge>
                        {p.isPublished && <Badge tone="lime">Publicada</Badge>}
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-xs font-medium text-ink/65">{p.code} · {PROPERTY_TYPE[p.type]} en {OPERATION[p.operation].toLowerCase()}</p>
                      <h2 className="mt-0.5 truncate font-semibold text-ink">{p.title}</h2>
                      <p className="mt-1 text-lg font-bold text-brand-ink">{money(p.price, p.currency)}</p>
                      <p className="mt-1 truncate text-sm text-ink/70">{[p.zone, p.city].filter(Boolean).join(", ") || "Sin ubicación"}</p>
                      <p className="mt-3 text-xs text-ink/65">
                        {p._count.leads} interesados · {p._count.visits} visitas{p.agent ? ` · ${p.agent.fullName}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </Loader>

      {picked.length > 0 && (
        <div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-deep px-5 py-3 text-on-brand shadow-xl">
          <p className="text-sm font-semibold">{picked.length} de 4 elegidas para comparar{picked.length < 2 ? " · elige al menos 2" : ""}</p>
          <div className="flex gap-2">
            <button onClick={() => setPicked([])} className="h-9 rounded-lg border border-on-brand/40 px-3 text-sm font-semibold">Limpiar</button>
            <button disabled={picked.length < 2} onClick={() => router.push(`/app/propiedades/comparar?ids=${picked.join(",")}`)} className="h-9 rounded-lg bg-accent-lime px-4 text-sm font-bold text-on-accent disabled:opacity-50">Comparar</button>
          </div>
        </div>
      )}

      {creating && (
        <Modal title="Nueva propiedad" wide onClose={() => setCreating(false)}>
          <PropertyForm onCancel={() => setCreating(false)} onSaved={(p) => router.push(`/app/propiedades/${p.id}`)} />
        </Modal>
      )}
    </>
  );
}
