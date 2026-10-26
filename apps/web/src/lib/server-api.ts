import { headers } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const APP_DOMAIN = process.env.APP_DOMAIN ?? "softinmo.com";
const RESERVED = new Set(["admin", "www", "app", "api"]);

/**
 * ¿La petición llegó a la dirección de una empresa? Sí en su subdominio y también en cualquier dominio
 * que no sea de la plataforma: puede ser su dominio propio, y el backend decide si existe.
 */
export async function isTenantHost(): Promise<boolean> {
  const h = await headers();
  const hostname = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0].toLowerCase();
  if (!hostname || hostname === "localhost" || hostname === APP_DOMAIN) return false;
  for (const base of [".localhost", `.${APP_DOMAIN}`]) if (hostname.endsWith(base)) return !RESERVED.has(hostname.slice(0, -base.length));
  return true;
}

/** Lee del backend desde el servidor (para páginas públicas con SEO). Devuelve null si no existe. */
export async function serverGet<T>(path: string): Promise<T | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  try {
    const res = await fetch(`${API_URL}/api${path}`, { headers: { "x-forwarded-host": host }, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
