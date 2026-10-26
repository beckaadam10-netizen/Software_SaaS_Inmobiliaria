import { OPERATION } from "@/lib/labels";
import { Avatar, Stars } from "./Avatar";

export type PublicAgent = {
  fullName: string; phone: string | null; avatar: string | null; rating: { average: number | null; count: number };
  reviews: Array<{ text: string; rating: number; author: string; operation: string; date: string }>;
};

/** Tarjeta del agente en la ficha pública: foto, calificación, WhatsApp y sus últimas reseñas. */
export function AgentCard({ agent, whatsapp }: { agent: PublicAgent; whatsapp: string | null }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-brand-deep text-on-brand" aria-label="Agente a cargo">
      <div className="flex items-center gap-4 p-5">
        <Avatar name={agent.fullName} src={agent.avatar} size={72} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-brand/70">Agente a cargo</p>
          <p className="truncate text-lg font-bold">{agent.fullName}</p>
          {agent.rating.count > 0 ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm"><Stars value={agent.rating.average ?? 0} /> <span className="font-semibold">{agent.rating.average?.toLocaleString("es-BO")}</span> <span className="text-on-brand/75">· {agent.rating.count} {agent.rating.count === 1 ? "reseña" : "reseñas"}</span></p>
          ) : <p className="mt-0.5 text-sm text-on-brand/75">Aún sin reseñas</p>}
        </div>
      </div>
      {whatsapp && (
        <div className="px-5 pb-5">
          <a href={whatsapp} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-lg bg-accent-lime px-4 text-sm font-bold text-on-accent transition hover:brightness-95">
            Escribir por WhatsApp
          </a>
        </div>
      )}
      {agent.reviews.length > 0 && (
        <ul className="flex flex-col gap-3 border-t border-on-brand/15 bg-black/10 p-5">
          {agent.reviews.map((r, i) => (
            <li key={i}>
              <Stars value={r.rating} size="text-sm" />
              <p className="mt-1 text-sm leading-relaxed text-on-brand/90">“{r.text}”</p>
              <p className="mt-1 text-xs text-on-brand/65">{r.author} · {OPERATION[r.operation]?.toLowerCase()}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
