"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFetch } from "@/lib/api";
import { money } from "@/lib/labels";
import { MapView } from "./MapView";

type Location = { lat: number; lng: number; radius: number };
type Point = { code: string; title: string; price: number; currency: string; zone: string | null; location: Location | null };

/** Zona aproximada de una propiedad en su ficha pública. */
export function PropertyArea({ code, location }: { code: string; location: Location | null }) {
  if (!location) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-ink">Ubicación aproximada</h2>
      <p className="mb-3 text-sm text-ink/70">Por seguridad mostramos la zona; la dirección exacta te la da el agente.</p>
      <MapView height={280} label="Ubicación aproximada" points={[{ id: code, lat: location.lat, lng: location.lng, radius: location.radius, label: "Zona de la propiedad" }]} />
    </section>
  );
}

/** Mapa del portal con todas las propiedades publicadas, en ubicaciones aproximadas. Se abre a pedido. */
export function PortalMap() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const state = useFetch<Point[]>(open ? "/public/map" : null);
  const points = (state.data ?? []).filter((p) => p.location);
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex h-10 items-center rounded-lg border border-ink/25 bg-white px-4 text-sm font-semibold text-ink hover:bg-ink/5">
        {open ? "Ocultar mapa" : "Ver propiedades en el mapa"}
      </button>
      {open && (
        <div className="mt-3">
          {state.data && points.length === 0 ? <p className="text-sm text-ink/70">Las propiedades aún no tienen ubicación en el mapa.</p> : (
            <MapView height={380} label="Mapa de propiedades" onOpen={(href) => router.push(href)}
              points={points.map((p) => ({ id: p.code, lat: p.location!.lat, lng: p.location!.lng, radius: p.location!.radius, label: p.title, detail: `${money(p.price, p.currency)}${p.zone ? ` · ${p.zone}` : ""}`, href: `/p/${p.code}` }))} />
          )}
          <p className="mt-2 text-xs text-ink/65">Las zonas son aproximadas para proteger a los propietarios.</p>
        </div>
      )}
    </div>
  );
}
