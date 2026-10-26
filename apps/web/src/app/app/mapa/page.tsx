"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapView } from "@/components/MapView";
import { Badge, Loader, PageHeader, Select } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { money, OPERATION, PROPERTY_STATUS } from "@/lib/labels";

type Item = { id: string; code: string; title: string; status: string; operation: string; price: number; currency: string; zone: string | null; latitude: number; longitude: number; isPublished: boolean };
const TONE: Record<string, "teal" | "amber" | "dark"> = { AVAILABLE: "teal", RESERVED: "amber", NEGOTIATING: "amber", SOLD: "dark", RENTED: "dark" };

export default function MapPage() {
  const router = useRouter();
  const state = useFetch<{ items: Item[]; withoutLocation: number }>("/map/properties");
  const [op, setOp] = useState("");
  return (
    <>
      <PageHeader title="Mapa de propiedades" subtitle="Ubicación exacta de tu inventario. En el portal público se muestra aproximada.">
        <Select aria-label="Operación" options={OPERATION} placeholder="Toda operación" value={op} onChange={(e) => setOp(e.target.value)} className="w-44" />
      </PageHeader>
      <Loader state={state}>
        {(d) => {
          const items = d.items.filter((p) => !op || p.operation === op);
          return (
            <>
              <MapView label="Mapa de propiedades" height={520} onOpen={(href) => router.push(href)}
                points={items.map((p) => ({ id: p.id, lat: p.latitude, lng: p.longitude, label: `${p.code} · ${p.title}`, detail: `${money(p.price, p.currency)} · ${PROPERTY_STATUS[p.status]}`, href: `/app/propiedades/${p.id}`, tone: TONE[p.status] ?? "teal" }))} />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink/75">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#0f766e]" />Disponible</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#b45309]" />Reservada o en negociación</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#0b3c49]" />Vendida o alquilada</span>
                {d.withoutLocation > 0 && <Badge tone="amber">{d.withoutLocation} propiedad(es) sin ubicación: márcalas al editarlas</Badge>}
              </div>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((p) => (
                  <li key={p.id} className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink/10">
                    <Link href={`/app/propiedades/${p.id}`} className="text-sm font-semibold text-link hover:underline">{p.code} · {p.title}</Link>
                    <p className="text-sm text-ink/70">{money(p.price, p.currency)}{p.zone ? ` · ${p.zone}` : ""}</p>
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      </Loader>
    </>
  );
}
