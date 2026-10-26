"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stars } from "@/components/Avatar";
import { useSession } from "@/components/Shell";
import { Badge, Button, Empty, ErrorNote, Loader, Modal, PageHeader } from "@/components/ui";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDate, money, OPERATION } from "@/lib/labels";

type Row = {
  id: string; code: string; operation: string; closedAt: string; closedPrice: string; currency: string;
  property: { code: string; title: string }; client: { id: string; fullName: string; phone: string | null } | null; agent: { fullName: string } | null;
  postSale: {
    deliveredAt: string | null; satisfaction: number | null; testimonial: string | null; testimonialPublic: boolean;
    reviewToken: string | null; reviewedAt: string | null; reviewHidden: boolean;
  } | null; _count: { referrals: number };
};
type ReviewLinkData = { link: string; message: string; phone: string | null };

/** Enlace de reseña para el cliente: se copia o se envía directo por WhatsApp. */
function ReviewLink({ row, onClose }: { row: Row; onClose: () => void }) {
  const [data, setData] = useState<ReviewLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    api<ReviewLinkData>(`/cases/${row.id}/review-link`, { method: "POST" }).then((d) => alive && setData(d), (e) => alive && setError(errorText(e)));
    return () => { alive = false; };
  }, [row.id]);
  const url = data ? `${window.location.origin}${data.link}` : "";
  const phone = data?.phone?.replace(/\D/g, "");
  const wa = data ? `https://wa.me/${phone ? (phone.length === 8 ? `591${phone}` : phone) : ""}?text=${encodeURIComponent(`${data.message}${url}`)}` : "";
  return (
    <Modal title={`Pedir reseña a ${row.client?.fullName ?? "el cliente"}`} onClose={onClose}>
      <ErrorNote>{error}</ErrorNote>
      {data && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink/80">Envía este enlace al cliente. Al abrirlo califica con estrellas y deja su comentario; si lo autoriza, la reseña se publica sola en el portal y en tu ficha de agente.</p>
          <input readOnly value={url} aria-label="Enlace de reseña" onFocus={(e) => e.currentTarget.select()} className="h-11 w-full rounded-lg border border-ink/20 bg-surface px-3 text-sm text-ink" />
          <div className="flex flex-wrap gap-2">
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-lg bg-accent-lime px-4 text-sm font-bold text-on-accent hover:brightness-95">Enviar por WhatsApp</a>
            <Button variant="ghost" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => null)}>{copied ? "Copiado" : "Copiar enlace"}</Button>
            <Link href={data.link} target="_blank" className="inline-flex h-10 items-center px-2 text-sm font-semibold text-link hover:underline">Ver como cliente</Link>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function PostSalePage() {
  const user = useSession();
  const state = useFetch<Row[]>("/post-sale");
  const [asking, setAsking] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function toggleHidden(r: Row) {
    setError(null);
    try {
      await api(`/cases/${r.id}/review`, { method: "PATCH", json: { hidden: !r.postSale?.reviewHidden } });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <PageHeader title="Postventa" subtitle="Operaciones cerradas: entrega, satisfacción, reseñas y referidos." />
      <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(rows) =>
          rows.length === 0 ? <Empty title="Aún no hay operaciones cerradas">Cuando cierres una operación como ganada aparecerá aquí para su seguimiento.</Empty> : (
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                  <tr>{["Operación", "Cliente", "Cierre", "Entrega", "Reseña", "Referidos", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3"><Link href={`/app/gestion/${r.id}`} className="font-semibold text-link hover:underline">{r.code}</Link><p className="text-xs text-ink/65">{r.property.title}</p></td>
                      <td className="px-4 py-3 text-ink/85">{r.client?.fullName ?? "—"}</td>
                      <td className="px-4 py-3 text-ink/85"><p className="tabular-nums">{money(r.closedPrice, r.currency)}</p><p className="text-xs text-ink/65">{OPERATION[r.operation]} · {fmtDate(r.closedAt)}</p></td>
                      <td className="px-4 py-3">{r.postSale?.deliveredAt ? <span className="text-ink/85">{fmtDate(r.postSale.deliveredAt)}</span> : <Badge tone="amber">Pendiente</Badge>}</td>
                      <td className="px-4 py-3">
                        {r.postSale?.reviewedAt || r.postSale?.testimonial ? (
                          <div className="flex flex-col items-start gap-1">
                            {r.postSale.satisfaction ? <Stars value={r.postSale.satisfaction} size="text-sm" /> : null}
                            {r.postSale.reviewHidden ? <Badge tone="neutral">Oculta del portal</Badge> : r.postSale.testimonialPublic ? <Badge tone="green">Publicada</Badge> : <Badge>Solo interna</Badge>}
                            {user.role === "ADMIN" && r.postSale.testimonial && <button type="button" onClick={() => toggleHidden(r)} className="text-xs font-semibold text-link hover:underline">{r.postSale.reviewHidden ? "Mostrar en el portal" : "Ocultar del portal"}</button>}
                          </div>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            {r.postSale?.reviewToken ? <Badge tone="amber">Enlace enviado</Badge> : <Badge>Sin pedir</Badge>}
                            {user.role !== "ACCOUNTANT" && <Button small className="whitespace-nowrap" variant={r.postSale?.reviewToken ? "ghost" : "accent"} onClick={() => setAsking(r)}>{r.postSale?.reviewToken ? "Ver enlace" : "Pedir reseña"}</Button>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink/85">{r._count.referrals}</td>
                      <td className="px-4 py-3 text-right">{r.client && <WhatsAppButton target={{ contact: r.client, property: r.property }} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loader>
      {asking && <ReviewLink row={asking} onClose={() => { setAsking(null); state.reload(); }} />}
    </>
  );
}
