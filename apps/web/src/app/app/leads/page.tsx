"use client";

import { useState, type FormEvent } from "react";
import { canAssignAgents, canEdit, useSession } from "@/components/Shell";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Badge, Button, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDate, LEAD_PIPELINE, LEAD_SOURCE, LEAD_STATUS } from "@/lib/labels";
import { useAgents, useContacts, useProperties } from "@/lib/options";

type Lead = {
  id: string; status: string; source: string; score: number; message: string | null; createdAt: string;
  contact: { id: string; fullName: string; phone: string | null; email: string | null };
  property: { id: string; code: string; title: string } | null; agent: { id: string; fullName: string } | null;
};

function LeadForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const user = useSession();
  const contacts = useContacts();
  const properties = useProperties();
  const agents = useAgents();
  const [isNew, setIsNew] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { fullName, phone, email, contactId, ...rest } = formData(e.currentTarget);
    const body = isNew ? { ...rest, newContact: { fullName, phone, email } } : { ...rest, contactId };
    setSaving(true);
    setError(null);
    try {
      await api("/leads", { method: "POST", json: body });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div className="flex gap-2 sm:col-span-2">
        <Button small variant={isNew ? "primary" : "ghost"} onClick={() => setIsNew(true)}>Persona nueva</Button>
        <Button small variant={isNew ? "ghost" : "primary"} onClick={() => setIsNew(false)}>Contacto existente</Button>
      </div>
      {isNew ? (
        <>
          <Field label="Nombre completo" className="sm:col-span-2"><Input name="fullName" required /></Field>
          <Field label="Teléfono"><Input name="phone" type="tel" /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
        </>
      ) : (
        <Field label="Contacto" className="sm:col-span-2"><Select name="contactId" required options={contacts} placeholder="Elige un contacto" /></Field>
      )}
      <Field label="Propiedad de interés" className="sm:col-span-2"><Select name="propertyId" options={properties} placeholder="Consulta general" /></Field>
      <Field label="Fuente"><Select name="source" options={LEAD_SOURCE} defaultValue="WHATSAPP" /></Field>
      {canAssignAgents(user) && (
        <Field label="Agente" hint="Vacío: se asigna automáticamente."><Select name="agentId" options={agents} placeholder="Automático" /></Field>
      )}
      <Field label="Mensaje o consulta" className="sm:col-span-2"><Textarea name="message" /></Field>
      <div className="sm:col-span-2">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} label="Registrar lead" />
      </div>
    </form>
  );
}

export default function LeadsPage() {
  const user = useSession();
  const editable = canEdit(user.role);
  const state = useFetch<Lead[]>("/leads");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(id: string, status: string) {
    setError(null);
    try {
      await api(`/leads/${id}`, { method: "PATCH", json: { status } });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="Leads" subtitle="Embudo de interesados, de nuevo a cerrado.">
        {editable && <Button onClick={() => setCreating(true)}>Nuevo lead</Button>}
      </PageHeader>
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(leads) => (
          <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
            <div className="flex gap-3">
              {LEAD_PIPELINE.map((status) => {
                const items = leads.filter((l) => l.status === status);
                return (
                  <section key={status} className="flex w-64 shrink-0 flex-col rounded-2xl bg-ink/5 p-2">
                    <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold text-ink">
                      {LEAD_STATUS[status]} <span className="text-ink/60">{items.length}</span>
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {items.map((l) => (
                        <li key={l.id} className="rounded-xl bg-white p-3 ring-1 ring-ink/10">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-ink">{l.contact.fullName}</p>
                            <Badge tone={l.score >= 70 ? "lime" : "neutral"}>{l.score}</Badge>
                          </div>
                          <p className="text-xs text-ink/70">{l.contact.phone ?? l.contact.email ?? "Sin datos de contacto"}</p>
                          <p className="mt-1.5 truncate text-xs text-ink/85">{l.property ? `${l.property.code} · ${l.property.title}` : "Consulta general"}</p>
                          {l.message && <p className="mt-1 line-clamp-2 text-xs text-ink/65">“{l.message}”</p>}
                          <p className="mt-1.5 text-xs text-ink/60">{LEAD_SOURCE[l.source]} · {fmtDate(l.createdAt)}{l.agent ? ` · ${l.agent.fullName}` : ""}</p>
                          <div className="mt-2"><WhatsAppButton target={{ contact: l.contact, leadId: l.id, property: l.property }} onSent={state.reload} /></div>
                          {editable && (
                            <Select
                              aria-label={`Mover a ${l.contact.fullName}`}
                              options={LEAD_STATUS}
                              value={l.status}
                              onChange={(e) => move(l.id, e.target.value)}
                              className="mt-2 h-8 text-xs"
                            />
                          )}
                        </li>
                      ))}
                      {items.length === 0 && <li className="px-2 py-3 text-xs text-ink/50">Sin leads</li>}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </Loader>
      {creating && (
        <Modal title="Nuevo lead" onClose={() => setCreating(false)}>
          <LeadForm onCancel={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
