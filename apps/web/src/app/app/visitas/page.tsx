"use client";

import { useState, type FormEvent } from "react";
import { canEdit, useSession } from "@/components/Shell";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Badge, Button, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { dayKey, fmtDay, fmtTime, toLocalInput, VISIT_STATUS } from "@/lib/labels";
import { useContacts, useProperties } from "@/lib/options";
import { VISIT_TONE } from "@/lib/tones";

type Visit = {
  id: string; scheduledAt: string; status: string; notes: string | null; result: string | null;
  property: { id: string; code: string; title: string; zone: string | null };
  contact: { id: string; fullName: string; phone: string | null }; agent: { fullName: string } | null;
};

function VisitForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const contacts = useContacts();
  const properties = useProperties();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tomorrow] = useState(() => toLocalInput(new Date(Date.now() + 864e5)));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = formData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api("/visits", { method: "POST", json: { ...raw, scheduledAt: new Date(raw.scheduledAt).toISOString() } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Propiedad"><Select name="propertyId" required options={properties} placeholder="Elige una propiedad" /></Field>
      <Field label="Cliente"><Select name="contactId" required options={contacts} placeholder="Elige un contacto" /></Field>
      <Field label="Fecha y hora"><Input name="scheduledAt" type="datetime-local" required defaultValue={tomorrow} /></Field>
      <Field label="Notas"><Textarea name="notes" placeholder="Punto de encuentro, quién asiste…" /></Field>
      <ErrorNote>{error}</ErrorNote>
      <FormActions onCancel={onCancel} saving={saving} label="Agendar visita" />
    </form>
  );
}

function ResultForm({ visit, onDone, onCancel }: { visit: Visit; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/visits/${visit.id}`, { method: "PATCH", json: { status: "DONE", result: formData(e.currentTarget).result } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <p className="text-sm text-ink/80">{visit.contact.fullName} · {visit.property.code} · {visit.property.title}</p>
      <Field label="Resultado de la visita" hint="Qué le gustó, objeciones y nivel de interés.">
        <Textarea name="result" rows={4} required />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <FormActions onCancel={onCancel} saving={saving} label="Marcar como realizada" />
    </form>
  );
}

export default function VisitsPage() {
  const user = useSession();
  const editable = canEdit(user.role);
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const state = useFetch<Visit[]>("/visits");
  const [creating, setCreating] = useState(false);
  const [finishing, setFinishing] = useState<Visit | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await api(`/visits/${id}`, { method: "PATCH", json: { status } });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="Visitas" subtitle="Agenda de visitas a los inmuebles.">
        <div className="flex rounded-lg bg-ink/5 p-0.5">
          {([["upcoming", "Pendientes"], ["past", "Historial"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === k ? "bg-white text-ink shadow-sm" : "text-ink/70"}`}>
              {label}
            </button>
          ))}
        </div>
        {editable && <Button onClick={() => setCreating(true)}>Agendar visita</Button>}
      </PageHeader>
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(all) => {
          const open = ["REQUESTED", "CONFIRMED", "RESCHEDULED"];
          const visits = all.filter((v) => (view === "upcoming" ? open.includes(v.status) : !open.includes(v.status)));
          if (view === "past") visits.reverse();
          if (visits.length === 0) return <Empty title={view === "upcoming" ? "No hay visitas pendientes" : "Aún no hay visitas en el historial"} />;
          const days = [...new Set(visits.map((v) => dayKey(v.scheduledAt)))];
          return (
            <div className="flex flex-col gap-6">
              {days.map((day) => (
                <section key={day}>
                  <h2 className="mb-2 text-sm font-semibold capitalize text-ink/75">{fmtDay(visits.find((v) => dayKey(v.scheduledAt) === day)!.scheduledAt)}</h2>
                  <ul className="flex flex-col gap-2">
                    {visits.filter((v) => dayKey(v.scheduledAt) === day).map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white p-4 ring-1 ring-ink/10">
                        <p className="w-16 text-lg font-bold tabular-nums text-brand-ink">{fmtTime(v.scheduledAt)}</p>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-ink">{v.contact.fullName} <span className="font-normal text-ink/65">· {v.contact.phone ?? "sin teléfono"}</span></p>
                          <p className="truncate text-sm text-ink/80">{v.property.code} · {v.property.title}{v.property.zone ? ` · ${v.property.zone}` : ""}</p>
                          {(v.result ?? v.notes) && <p className="mt-1 text-sm text-ink/65">{v.result ?? v.notes}</p>}
                          {v.agent && <p className="mt-1 text-xs text-ink/60">Agente: {v.agent.fullName}</p>}
                        </div>
                        <Badge tone={VISIT_TONE[v.status]}>{VISIT_STATUS[v.status]}</Badge>
                        {editable && open.includes(v.status) && (
                          <div className="flex flex-wrap gap-1.5">
                            <WhatsAppButton target={{ contact: v.contact, property: v.property, date: v.scheduledAt }} />
                            {v.status === "REQUESTED" && <Button small variant="accent" onClick={() => setStatus(v.id, "CONFIRMED")}>Confirmar</Button>}
                            {v.status !== "REQUESTED" && <Button small onClick={() => setFinishing(v)}>Realizada</Button>}
                            {v.status !== "REQUESTED" && <Button small variant="ghost" onClick={() => setStatus(v.id, "NO_SHOW")}>No asistió</Button>}
                            <Button small variant="ghost" onClick={() => setStatus(v.id, "CANCELLED")}>Cancelar</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </Loader>
      {creating && (
        <Modal title="Agendar visita" onClose={() => setCreating(false)}>
          <VisitForm onCancel={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />
        </Modal>
      )}
      {finishing && (
        <Modal title="Registrar visita realizada" onClose={() => setFinishing(null)}>
          <ResultForm visit={finishing} onCancel={() => setFinishing(null)} onDone={() => { setFinishing(null); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
