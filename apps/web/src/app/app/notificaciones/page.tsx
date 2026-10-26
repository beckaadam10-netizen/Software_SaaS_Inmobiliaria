"use client";

import { useRouter } from "next/navigation";
import { Button, Empty, Loader, PageHeader } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/labels";

type Notice = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };
const TYPE: Record<string, string> = { lead: "Lead", visit: "Visita", offer: "Oferta", reservation: "Reserva", document: "Documento", referral: "Referido", case: "Expediente", task: "Tarea", automation: "Automatización", finance: "Finanzas" };

export default function NotificationsPage() {
  const router = useRouter();
  const state = useFetch<{ items: Notice[]; unread: number }>("/notifications");

  async function open(n: Notice) {
    if (!n.readAt) await api("/notifications/read", { method: "POST", json: { ids: [n.id] } }).catch(() => null);
    if (n.link) router.push(n.link);
    else state.reload();
  }
  async function readAll() {
    await api("/notifications/read", { method: "POST", json: {} }).catch(() => null);
    state.reload();
  }

  return (
    <>
      <PageHeader title="Notificaciones" subtitle="Avisos de leads, visitas, ofertas, documentos y referidos.">
        {(state.data?.unread ?? 0) > 0 && <Button variant="ghost" onClick={readAll}>Marcar todas como leídas</Button>}
      </PageHeader>
      <Loader state={state}>
        {({ items }) =>
          items.length === 0 ? <Empty title="No tienes notificaciones">Aquí verás los avisos cuando te asignen un lead, pidan una visita o llegue una oferta.</Empty> : (
            <ul className="flex flex-col gap-2">
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => open(n)} className={`flex w-full items-start gap-3 rounded-2xl p-4 text-left ring-1 transition hover:ring-brand-teal ${n.readAt ? "bg-white/60 ring-ink/10" : "bg-white ring-ink/15"}`}>
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? "bg-ink/15" : "bg-accent-lime ring-2 ring-brand-teal"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm text-ink ${n.readAt ? "" : "font-semibold"}`}>{n.title}{!n.readAt && <span className="sr-only"> (sin leer)</span>}</span>
                      {n.body && <span className="block text-sm text-ink/70">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-ink/60">{TYPE[n.type] ?? n.type} · {fmtDateTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Loader>
    </>
  );
}
