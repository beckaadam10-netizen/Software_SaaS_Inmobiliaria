"use client";

import Link from "next/link";
import { ApiError, useFetch } from "@/lib/api";
import { CONTACT_TYPE, money, OPERATION } from "@/lib/labels";
import { Badge, Loading } from "./ui";
import { WhatsAppButton } from "./WhatsAppButton";

type Match = { score: number; reasons: string[]; misses: string[] };
type ContactMatch = Match & { id: string; fullName: string; phone: string | null; type: string };
type PropertyMatch = Match & { id: string; code: string; title: string; operation: string; price: string; currency: string; zone: string | null; isPublished: boolean; agent: { fullName: string } | null };
type PropRef = { code: string; title: string; price?: unknown; currency?: string };

const Why = ({ m }: { m: Match }) => (
  <p className="text-xs text-ink/65">Coincide en: {m.reasons.join(", ").toLowerCase() || "—"}{m.misses.length ? ` · No coincide: ${m.misses.join(", ").toLowerCase()}` : ""}</p>
);
const Score = ({ n }: { n: number }) => <Badge tone={n === 100 ? "lime" : "teal"}>{n} %</Badge>;

function State({ state, empty, children }: { state: { data: unknown; error: string | null }; empty: string; children: React.ReactNode }) {
  if (state.error) return <p className="text-sm text-ink/65">{state.error}</p>;
  if (!state.data) return <Loading />;
  if (Array.isArray(state.data) && state.data.length === 0) return <p className="text-sm text-ink/65">{empty}</p>;
  return <>{children}</>;
}

/** Clientes cuyas preferencias coinciden con una propiedad. */
export function MatchingContacts({ propertyId, property }: { propertyId: string; property: PropRef & { isPublished: boolean } }) {
  const state = useFetch<ContactMatch[]>(`/matching/properties/${propertyId}`);
  return (
    <State state={state} empty="Ningún cliente registrado busca algo así por ahora.">
      <p className="mb-2 text-sm font-semibold text-ink">{state.data?.length} cliente(s) compatible(s)</p>
      <ul className="divide-y divide-ink/10">
        {state.data?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{c.fullName} <span className="font-normal text-ink/65">· {CONTACT_TYPE[c.type]}</span></p>
              <Why m={c} />
            </div>
            <div className="flex items-center gap-1.5">
              <Score n={c.score} />
              <WhatsAppButton label="Ofrecer" target={{ contact: c, property: property.isPublished ? property : null }} />
            </div>
          </li>
        ))}
      </ul>
    </State>
  );
}

/** Propiedades en oferta compatibles con lo que busca un cliente. */
export function MatchingProperties({ contact }: { contact: { id: string; fullName: string; phone: string | null } }) {
  const state = useFetch<PropertyMatch[]>(`/matching/contacts/${contact.id}`);
  return (
    <State state={state} empty="No hay propiedades en oferta que coincidan con lo que busca. Revisa sus preferencias.">
      <ul className="divide-y divide-ink/10">
        {state.data?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <Link href={`/app/propiedades/${p.id}`} className="text-sm font-semibold text-link hover:underline">{p.code} · {p.title}</Link>
              <p className="text-sm text-ink/85">{OPERATION[p.operation]} · {money(p.price, p.currency)}{p.zone ? ` · ${p.zone}` : ""}</p>
              <Why m={p} />
            </div>
            <div className="flex items-center gap-1.5">
              <Score n={p.score} />
              {p.isPublished && <WhatsAppButton label="Compartir" target={{ contact, property: p }} />}
            </div>
          </li>
        ))}
      </ul>
    </State>
  );
}
void ApiError;
