import Link from "next/link";
import type { ReactNode } from "react";
import type { Brand } from "@/lib/api";
import { brandStyle } from "@/lib/brand";
import { ThemeSwitch } from "./ThemeSwitch";

export type Site = Brand & { slug: string };
type IconName = "chat" | "pin" | "phone" | "mail" | "clock" | "globe" | "people" | "camera" | "music";
const SOCIAL: Array<[string, string, IconName]> = [["whatsapp", "WhatsApp", "chat"], ["facebook", "Facebook", "people"], ["instagram", "Instagram", "camera"], ["tiktok", "TikTok", "music"], ["website", "Sitio web", "globe"]];

/** Íconos de línea genéricos (no son los logos oficiales de cada red); el nombre va siempre en la etiqueta. */
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    chat: <><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 20.5l1.6-5.2A8.4 8.4 0 1 1 21 11.5Z" /><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" /></>,
    pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
    phone: <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
    camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></>,
    music: <><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  };
  return <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

/** Encabezado y pie del portal público de una empresa, con su logo y sus colores. */
export function PublicChrome({ site, children }: { site: Site; children: ReactNode }) {
  const wa = site.whatsapp?.replace(/\D/g, "");
  const networks = SOCIAL.filter(([k]) => (k === "whatsapp" ? !!wa : !!site[k as keyof Brand]));
  return (
    <div className="brand-scope flex min-h-screen flex-1 flex-col" style={brandStyle(site)}>
      <header className="bg-brand-deep">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3 text-lg font-bold tracking-tight text-on-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {site.logo && <img src={site.logo} alt="" className="h-9 w-auto max-w-[9rem] rounded bg-[#ffffff] object-contain p-0.5" />}
            <span className="truncate">{site.name}</span>
          </Link>
          <Link href="/login" className="rounded-lg border border-on-brand/40 px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-on-brand/10">
            Ingresar
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <footer className="mt-12 bg-brand-deep text-on-brand">
        <div className="h-1 bg-accent-lime" aria-hidden />
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-xl font-extrabold tracking-tight">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {site.logo && <img src={site.logo} alt="" className="h-10 w-auto max-w-[9rem] rounded bg-[#ffffff] object-contain p-0.5" />}
              {site.name}
            </Link>
            {site.about && <p className="mt-3 max-w-sm text-sm leading-relaxed text-on-brand/80">{site.about}</p>}
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-accent-lime px-5 text-sm font-bold text-on-accent transition hover:brightness-95">
                <Icon name="chat" /> Escríbenos por WhatsApp
              </a>
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-accent-lime">Contacto</h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm text-on-brand/85">
              {site.address && <li className="flex gap-2.5"><Icon name="pin" /><span>{site.address}</span></li>}
              {site.phone && <li className="flex gap-2.5"><Icon name="phone" /><a href={`tel:${site.phone.replace(/[^\d+]/g, "")}`} className="hover:text-accent-lime">{site.phone}</a></li>}
              {site.email && <li className="flex gap-2.5"><Icon name="mail" /><a href={`mailto:${site.email}`} className="break-all hover:text-accent-lime">{site.email}</a></li>}
              {site.schedule && <li className="flex gap-2.5"><Icon name="clock" /><span>{site.schedule}</span></li>}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-accent-lime">Síguenos</h2>
            {networks.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2.5">
                {networks.map(([k, label, icon]) => (
                  <li key={k}>
                    <a href={k === "whatsapp" ? `https://wa.me/${wa}` : (site[k as keyof Brand] as string)} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}
                      className="flex h-11 w-11 items-center justify-center rounded-full bg-on-brand/10 ring-1 ring-on-brand/25 transition hover:-translate-y-0.5 hover:bg-accent-lime hover:text-on-accent">
                      <Icon name={icon} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-on-brand/70">Pronto en redes sociales.</p>}
            <p className="mt-3 text-xs text-on-brand/65">{networks.map(([, label]) => label).join(" · ")}</p>
          </div>
        </div>
        <div className="border-t border-on-brand/15">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-on-brand/70 sm:px-6">
            <p>© {new Date().getFullYear()} {site.name}{!site.hideBrand ? " · Funciona con Soft_Inmo" : ""}</p>
            <div className="w-56"><ThemeSwitch onDark /></div>
          </div>
        </div>
      </footer>
    </div>
  );
}
