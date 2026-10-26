"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFetch } from "@/lib/api";
import { publicUrl } from "@/lib/images";
import { OPERATION } from "@/lib/labels";
import { Avatar, Stars } from "./Avatar";
import { savedFavorites } from "./FavoriteButton";

type Testimonial = { text: string; satisfaction: number | null; operation: string; author: string; date?: string; agent?: { fullName: string; avatar: string | null } | null };

/** Reseñas que los clientes autorizaron publicar (escritas por enlace o registradas en la postventa). */
export function Testimonials() {
  const { data } = useFetch<Testimonial[]>("/public/testimonials");
  if (!data?.length) return null;
  return (
    <section className="mt-14" aria-labelledby="resenas">
      <p className="text-sm font-semibold uppercase tracking-wide text-link">Reseñas verificadas</p>
      <h2 id="resenas" className="mt-1 text-2xl font-bold tracking-tight text-ink">Lo que dicen nuestros clientes</h2>
      <ul className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.map((t, i) => (
          <li key={i} className="flex flex-col rounded-2xl bg-white p-5 ring-1 ring-ink/10">
            {t.satisfaction ? <Stars value={t.satisfaction} /> : null}
            <blockquote className="mt-2 flex-1 leading-relaxed text-ink/85">“{t.text}”</blockquote>
            <p className="mt-3 text-sm font-semibold text-ink">{t.author} <span className="font-normal text-ink/65">· {OPERATION[t.operation]}</span></p>
            {t.agent && (
              <p className="mt-3 flex items-center gap-2 border-t border-ink/10 pt-3 text-xs text-ink/70">
                <Avatar name={t.agent.fullName} src={t.agent.avatar} size={28} /> Atendido por <span className="font-semibold text-ink">{t.agent.fullName}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Acceso rápido a las propiedades que el visitante guardó en este navegador. */
export function SavedLinks() {
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    const saved = savedFavorites();
    if (saved.length) queueMicrotask(() => setCodes(saved));
  }, []);
  if (!codes.length) return null;
  return (
    <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink/80">
      <span className="font-semibold text-ink">Tus guardadas:</span>
      {codes.map((c) => <Link key={c} href={`/p/${c}`} className="rounded-full bg-brand-teal/12 px-3 py-1 font-medium text-brand-ink hover:bg-brand-teal/20">{c}</Link>)}
      {codes.length >= 2 && <Link href={`/comparar?codes=${codes.slice(0, 4).join(",")}`} className="rounded-full bg-brand-deep px-3 py-1 font-semibold text-on-brand hover:bg-brand-teal">Comparar {Math.min(codes.length, 4)}</Link>}
    </p>
  );
}

/** Compartir la ficha: copia el enlace o abre WhatsApp con el enlace etiquetado. */
export function ShareLinks({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<{ plain: string; wa: string } | null>(null);
  useEffect(() => {
    const next = { plain: publicUrl(code), wa: `https://wa.me/?text=${encodeURIComponent(`${title}: ${publicUrl(code, "whatsapp")}`)}` };
    queueMicrotask(() => setLinks(next));
  }, [code, title]);
  if (!links) return null;
  const btn = "inline-flex h-10 items-center rounded-lg border border-ink/25 bg-white px-4 text-sm font-semibold text-ink hover:bg-ink/5";
  return (
    <>
      <a href={links.wa} target="_blank" rel="noreferrer" className={btn}>Compartir por WhatsApp</a>
      <button type="button" className={btn} onClick={() => navigator.clipboard.writeText(links.plain).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => null)}>
        {copied ? "Enlace copiado" : "Copiar enlace"}
      </button>
    </>
  );
}
