"use client";

import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { fmtDate, money, OFFER_KIND, OFFER_STATUS, RESERVATION_STATUS, toLocalInput } from "@/lib/labels";
import { useContacts } from "@/lib/options";
import { OFFER_TONE, RESERVATION_TONE } from "@/lib/tones";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Modal, Select, Textarea } from "./ui";

type Person = { id: string; fullName: string };
export type Offer = { id: string; kind: string; amount: string; currency: string; conditions: string | null; status: string; createdAt: string; contact: Person };
export type Reservation = { id: string; amount: string; currency: string; paidAt: string; expiresAt: string | null; status: string; notes: string | null; contact: Person };
type Props = { caseId: string; currency: string; price: unknown; open: boolean; editable: boolean; offers: Offer[]; reservations: Reservation[]; defaultContactId?: string; onChange: () => void };

function Form({ kind, caseId, currency, price, defaultContactId, onDone, onCancel }: { kind: "offer" | "reservation"; caseId: string; currency: string; price: unknown; defaultContactId?: string; onDone: () => void; onCancel: () => void }) {
  const contacts = useContacts();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [today] = useState(() => toLocalInput(new Date()).slice(0, 10));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/cases/${caseId}/${kind === "offer" ? "offers" : "reservations"}`, { method: "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Cliente" className="sm:col-span-2">
        <Select name="contactId" required options={contacts} placeholder="Elige un contacto" defaultValue={defaultContactId ?? ""} key={contacts.length} />
      </Field>
      {kind === "offer" ? (
        <>
          <Field label="Tipo"><Select name="kind" options={{ OFFER: "Oferta del cliente", COUNTER: "Contraoferta del propietario" }} /></Field>
          <Field label={`Monto (${currency})`}><Input name="amount" type="number" min={1} step="0.01" required defaultValue={Number(price) || ""} /></Field>
          <Field label="Condiciones" className="sm:col-span-2"><Textarea name="conditions" placeholder="Forma de pago, plazos, lo que incluye…" /></Field>
        </>
      ) : (
        <>
          <Field label={`Monto de la reserva (${currency})`}><Input name="amount" type="number" min={1} step="0.01" required /></Field>
          <Field label="Fecha de pago"><Input name="paidAt" type="date" required defaultValue={today} /></Field>
          <Field label="Vence el" hint="Opcional."><Input name="expiresAt" type="date" /></Field>
          <Field label="Notas" className="sm:col-span-2"><Textarea name="notes" placeholder="Comprobante, condiciones de devolución…" /></Field>
        </>
      )}
      <div className="sm:col-span-2">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} label={kind === "offer" ? "Registrar oferta" : "Registrar reserva"} />
      </div>
    </form>
  );
}

/** Paso 6 del expediente: historial de ofertas y contraofertas, y la reserva. */
export function NegotiationCard({ caseId, currency, price, open, editable, offers, reservations, defaultContactId, onChange }: Props) {
  const [modal, setModal] = useState<"offer" | "reservation" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const can = editable && open;
  const active = reservations.find((r) => r.status === "ACTIVE");

  async function act(path: string, body?: object) {
    setError(null);
    try {
      await api(path, { method: "PATCH", json: body ?? {} });
      onChange();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">Negociación</h2>
        {can && (
          <div className="flex gap-1.5">
            <Button small variant="ghost" onClick={() => setModal("offer")}>Registrar oferta</Button>
            {!active && <Button small variant="ghost" onClick={() => setModal("reservation")}>Registrar reserva</Button>}
          </div>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>

      {reservations.map((r) => (
        <div key={r.id} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-ink">Reserva de {money(r.amount, r.currency)} · {r.contact.fullName}</p>
            <p className="text-xs text-ink/65">Pagada el {fmtDate(r.paidAt)}{r.expiresAt ? ` · vence el ${fmtDate(r.expiresAt)}` : ""}{r.notes ? ` · ${r.notes}` : ""}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge tone={RESERVATION_TONE[r.status]}>{RESERVATION_STATUS[r.status]}</Badge>
            {can && r.status === "ACTIVE" && <Button small variant="ghost" onClick={() => act(`/reservations/${r.id}/cancel`)}>Cancelar reserva</Button>}
          </div>
        </div>
      ))}

      {offers.length === 0 ? <p className="text-sm text-ink/65">Aún no hay ofertas. Cada oferta y contraoferta queda guardada en este historial.</p> : (
        <ul className="divide-y divide-ink/10">
          {offers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-ink"><span className="font-semibold">{OFFER_KIND[o.kind]} · {money(o.amount, o.currency)}</span> · {o.contact.fullName}</p>
                <p className="text-xs text-ink/65">{fmtDate(o.createdAt)}{o.conditions ? ` · ${o.conditions}` : ""}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={OFFER_TONE[o.status]}>{OFFER_STATUS[o.status]}</Badge>
                {can && o.status === "PENDING" && (
                  <>
                    <Button small variant="accent" onClick={() => act(`/offers/${o.id}`, { status: "ACCEPTED" })}>Aceptar</Button>
                    <Button small variant="ghost" onClick={() => act(`/offers/${o.id}`, { status: "REJECTED" })}>Rechazar</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <Modal title={modal === "offer" ? "Registrar oferta" : "Registrar reserva"} onClose={() => setModal(null)}>
          <Form kind={modal} caseId={caseId} currency={currency} price={price} defaultContactId={defaultContactId} onCancel={() => setModal(null)} onDone={() => { setModal(null); onChange(); }} />
        </Modal>
      )}
    </Card>
  );
}
