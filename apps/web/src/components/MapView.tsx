"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";

export type MapPoint = { id: string; lat: number; lng: number; label: string; detail?: string; href?: string; radius?: number; tone?: "teal" | "amber" | "dark" | "lime" };

const TILES = process.env.NEXT_PUBLIC_MAP_TILES ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
/** Centro por defecto: Santa Cruz de la Sierra. */
export const DEFAULT_CENTER = { lat: -17.7833, lng: -63.1821 };
const COLORS = { teal: "#0f766e", amber: "#b45309", dark: "#0b3c49", lime: "#4d7c0f" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Mapa con Leaflet. Los mosaicos salen de OpenStreetMap; para Mapbox o Google basta con cambiar
 * NEXT_PUBLIC_MAP_TILES. Con `onPick`, un clic en el mapa elige la ubicación.
 */
export function MapView({ points, height = 360, onPick, picked, onOpen, label = "Mapa" }: {
  points: MapPoint[]; height?: number; onPick?: (lat: number, lng: number) => void; picked?: { lat: number; lng: number } | null; onOpen?: (href: string) => void; label?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const lib = useRef<typeof L | null>(null);
  const pickRef = useRef(onPick);
  const openRef = useRef(onOpen);
  const [ready, setReady] = useState(false);
  useEffect(() => { pickRef.current = onPick; openRef.current = onOpen; });

  // Leaflet usa window: se carga solo en el navegador.
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      const Lf = ((mod as unknown as { default?: typeof L }).default ?? mod) as typeof L;
      if (cancelled || !el.current || map.current) return;
      lib.current = Lf;
      const m = Lf.map(el.current, { scrollWheelZoom: false, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 12);
      Lf.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
      m.on("click", (e: L.LeafletMouseEvent) => pickRef.current?.(Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6));
      map.current = m;
      layer.current = Lf.layerGroup().addTo(m);
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Se redibuja solo cuando cambian los puntos, no en cada render (así no se pierde el zoom del usuario).
  const signature = JSON.stringify([points, picked]);
  useEffect(() => {
    const Lf = lib.current, m = map.current, g = layer.current;
    if (!ready || !Lf || !m || !g) return;
    const [pts, pick] = JSON.parse(signature) as [MapPoint[], { lat: number; lng: number } | null];
    g.clearLayers();
    const all: L.LatLngExpression[] = [];
    for (const p of pts) {
      const color = COLORS[p.tone ?? "teal"];
      const shape = p.radius
        ? Lf.circle([p.lat, p.lng], { radius: p.radius, color, weight: 2, fillColor: color, fillOpacity: 0.18 })
        : Lf.circleMarker([p.lat, p.lng], { radius: 8, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 1 });
      const html = `<strong>${esc(p.label)}</strong>${p.detail ? `<br>${esc(p.detail)}` : ""}${p.href ? `<br><a href="${esc(p.href)}" data-href="${esc(p.href)}">Ver ficha</a>` : ""}`;
      shape.bindPopup(html).addTo(g);
      all.push([p.lat, p.lng]);
    }
    if (pick) {
      Lf.circleMarker([pick.lat, pick.lng], { radius: 9, color: "#ffffff", weight: 3, fillColor: "#0b3c49", fillOpacity: 1 }).addTo(g);
      all.push([pick.lat, pick.lng]);
    }
    if (all.length === 1) m.setView(all[0], pts[0]?.radius ? 15 : 16);
    else if (all.length > 1) m.fitBounds(Lf.latLngBounds(all), { padding: [32, 32], maxZoom: 16 });
  }, [ready, signature]);

  // Los enlaces de las ventanas emergentes navegan dentro del sistema.
  useEffect(() => {
    const node = el.current;
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[data-href]") as HTMLAnchorElement | null;
      if (a && openRef.current) { e.preventDefault(); openRef.current(a.dataset.href!); }
    };
    node?.addEventListener("click", click);
    return () => node?.removeEventListener("click", click);
  }, []);

  return <div ref={el} role="region" aria-label={label} style={{ height }} className="z-0 w-full overflow-hidden rounded-2xl bg-ink/5 ring-1 ring-ink/10" />;
}
