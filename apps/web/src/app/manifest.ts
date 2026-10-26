import type { MetadataRoute } from "next";
import type { Brand } from "@/lib/api";
import { isTenantHost, serverGet } from "@/lib/server-api";

/** Datos para instalar el sistema como aplicación en el celular. Cada empresa ve su nombre y su color. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = (await isTenantHost()) ? await serverGet<Brand>("/public/site") : null;
  return {
    name: site?.name ?? "Soft_Inmo",
    short_name: (site?.name ?? "Soft_Inmo").slice(0, 12),
    description: "Sistema operativo para empresas inmobiliarias",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    lang: "es",
    background_color: "#f1faf7",
    theme_color: site?.primaryColor ?? "#0b3c49",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
