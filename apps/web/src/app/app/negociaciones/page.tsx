"use client";

import Link from "next/link";
import { Badge, Empty, Loader, PageHeader } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { fmtDate, money, OFFER_KIND, OFFER_STATUS } from "@/lib/labels";
import { OFFER_TONE } from "@/lib/tones";

type Row = {
  id: string; code: string; price: string; currency: string; property: { code: string; title: string }; agent: { fullName: string } | null;
  lastOffer: { kind: string; amount: string; status: string; createdAt: string; contact: { fullName: string } }; offerCount: number; pending: number;
  reservations: Array<{ amount: string; currency: string }>;
};

export default function NegotiationsPage() {
  const state = useFetch<Row[]>("/negotiations");
  return (
    <>
      <PageHeader title="Negociaciones" subtitle="Expedientes abiertos con ofertas en curso." />
      <Loader state={state}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty title="No hay negociaciones en curso">Registra la primera oferta desde el expediente de la propiedad. <Link href="/app/gestion" className="font-semibold text-link hover:underline">Ir a gestión comercial</Link></Empty>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                  <tr>{["Expediente", "Precio pedido", "Última oferta", "Cliente", "Ofertas", "Reserva", "Agente"].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {rows.map((r) => {
                    const diff = Math.round((Number(r.lastOffer.amount) / Number(r.price) - 1) * 100);
                    return (
                      <tr key={r.id} className="hover:bg-surface">
                        <td className="px-4 py-3"><Link href={`/app/gestion/${r.id}`} className="font-semibold text-link hover:underline">{r.code}</Link><p className="text-xs text-ink/65">{r.property.title}</p></td>
                        <td className="px-4 py-3 font-medium tabular-nums text-ink">{money(r.price, r.currency)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium tabular-nums text-ink">{money(r.lastOffer.amount, r.currency)} <span className="text-xs font-normal text-ink/65">({diff > 0 ? "+" : ""}{diff} %)</span></p>
                          <p className="text-xs text-ink/65">{OFFER_KIND[r.lastOffer.kind]} · {fmtDate(r.lastOffer.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3 text-ink/85">{r.lastOffer.contact.fullName}</td>
                        <td className="px-4 py-3"><span className="mr-2 tabular-nums text-ink/85">{r.offerCount}</span><Badge tone={OFFER_TONE[r.lastOffer.status]}>{OFFER_STATUS[r.lastOffer.status]}</Badge></td>
                        <td className="px-4 py-3 tabular-nums text-ink/85">{r.reservations[0] ? money(r.reservations[0].amount, r.reservations[0].currency) : "—"}</td>
                        <td className="px-4 py-3 text-ink/85">{r.agent?.fullName ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </Loader>
    </>
  );
}
