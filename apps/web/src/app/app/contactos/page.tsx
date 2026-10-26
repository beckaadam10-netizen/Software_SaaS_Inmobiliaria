"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MatchingProperties } from "@/components/MatchList";
import { canAssignAgents, canEdit, useSession } from "@/components/Shell";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Badge, Button, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { useQueryParam } from "@/lib/query";
import { CONTACT_TYPE, money, OPERATION, PROPERTY_TYPE } from "@/lib/labels";
import { useAgents } from "@/lib/options";

type Contact = {
  id: string; type: string; fullName: string; email: string | null; phone: string | null; notes: string | null;
  prefOperation: string | null; prefType: string | null; prefZone: string | null; prefBudgetMax: string | null; prefCurrency: string | null; prefBedrooms: number | null;
  assignedAgentId: string | null; assignedAgent: { fullName: string } | null; _count: { leads: number; ownedProperties: number };
};

function ContactForm({ initial, onDone, onCancel }: { initial?: Contact; onDone: () => void; onCancel: () => void }) {
  const user = useSession();
  const agents = useAgents();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const v = (k: keyof Contact) => (initial?.[k] == null ? "" : String(initial[k]));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = formData(e.currentTarget);
    const body = { ...raw, prefOperation: raw.prefOperation || null, prefType: raw.prefType || null, prefCurrency: raw.prefCurrency || null };
    setSaving(true);
    setError(null);
    try {
      await api(initial ? `/contacts/${initial.id}` : "/contacts", { method: initial ? "PATCH" : "POST", json: body });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
      <Field label="Nombre completo" className="sm:col-span-4"><Input name="fullName" required defaultValue={v("fullName")} /></Field>
      <Field label="Tipo" className="sm:col-span-2"><Select name="type" options={CONTACT_TYPE} defaultValue={v("type") || "PROSPECT"} /></Field>
      <Field label="Teléfono" className="sm:col-span-3"><Input name="phone" type="tel" defaultValue={v("phone")} /></Field>
      <Field label="Email" className="sm:col-span-3"><Input name="email" type="email" defaultValue={v("email")} /></Field>
      {canAssignAgents(user) && (
        <Field label="Agente responsable" className="sm:col-span-6">
          <Select name="assignedAgentId" options={agents} placeholder="Sin asignar" defaultValue={v("assignedAgentId")} key={agents.length} />
        </Field>
      )}
      <p className="text-sm font-semibold text-ink sm:col-span-6">Qué busca</p>
      <Field label="Operación" className="sm:col-span-2"><Select name="prefOperation" options={OPERATION} placeholder="Cualquiera" defaultValue={v("prefOperation")} /></Field>
      <Field label="Tipo de propiedad" className="sm:col-span-2"><Select name="prefType" options={PROPERTY_TYPE} placeholder="Cualquiera" defaultValue={v("prefType")} /></Field>
      <Field label="Habitaciones" className="sm:col-span-2"><Input name="prefBedrooms" type="number" min={0} defaultValue={v("prefBedrooms")} /></Field>
      <Field label="Zona" className="sm:col-span-2"><Input name="prefZone" defaultValue={v("prefZone")} /></Field>
      <Field label="Presupuesto máximo" className="sm:col-span-2"><Input name="prefBudgetMax" type="number" min={0} step="0.01" defaultValue={v("prefBudgetMax")} /></Field>
      <Field label="Moneda" className="sm:col-span-2"><Select name="prefCurrency" options={{ USD: "USD", BOB: "Bs" }} placeholder="—" defaultValue={v("prefCurrency")} /></Field>
      <Field label="Notas" className="sm:col-span-6"><Textarea name="notes" defaultValue={v("notes")} /></Field>
      <div className="sm:col-span-6">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} />
      </div>
    </form>
  );
}

export default function ContactsPage() {
  const user = useSession();
  const [q, setQ] = useState("");
  // Al llegar desde el buscador global, la lista se abre ya filtrada.
  const fromSearch = useQueryParam("q");
  useEffect(() => {
    if (fromSearch) queueMicrotask(() => setQ(fromSearch));
  }, [fromSearch]);
  const [type, setType] = useState("");
  const [modal, setModal] = useState<{ contact?: Contact } | null>(null);
  const [matching, setMatching] = useState<Contact | null>(null);
  const params = new URLSearchParams({ ...(q && { q }), ...(type && { type }) });
  const state = useFetch<Contact[]>(`/contacts?${params}`);
  const editable = canEdit(user.role);

  return (
    <>
      <PageHeader title="Contactos" subtitle="Compradores, arrendatarios, propietarios e inversionistas.">
        {editable && <Button onClick={() => setModal({})}>Nuevo contacto</Button>}
      </PageHeader>
      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_200px]">
        <Input type="search" placeholder="Buscar por nombre, teléfono o email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
        <Select options={CONTACT_TYPE} placeholder="Todos los tipos" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo" />
      </div>
      <Loader state={state}>
        {(items) =>
          items.length === 0 ? (
            <Empty title="No hay contactos">{q || type ? "Prueba con otros filtros." : "Registra a tus clientes y propietarios."}</Empty>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nombre</th>
                    <th className="px-4 py-3 font-semibold">Contacto</th>
                    <th className="px-4 py-3 font-semibold">Busca</th>
                    <th className="px-4 py-3 font-semibold">Agente</th>
                    <th className="px-4 py-3 font-semibold">Actividad</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {items.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{c.fullName}</p>
                        <Badge tone={c.type === "OWNER" ? "teal" : "neutral"}>{CONTACT_TYPE[c.type]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-ink/85">
                        <p>{c.phone ?? "—"}</p>
                        <p className="text-xs text-ink/65">{c.email}</p>
                      </td>
                      <td className="px-4 py-3 text-ink/85">
                        {[c.prefType && PROPERTY_TYPE[c.prefType], c.prefOperation && OPERATION[c.prefOperation], c.prefZone, c.prefBudgetMax && `hasta ${money(c.prefBudgetMax, c.prefCurrency ?? "USD")}`]
                          .filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-ink/85">{c.assignedAgent?.fullName ?? "—"}</td>
                      <td className="px-4 py-3 text-ink/85">{c._count.leads} leads · {c._count.ownedProperties} propiedades</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {c.type !== "OWNER" && <Button small variant="ghost" onClick={() => setMatching(c)}>Compatibles</Button>}
                          <WhatsAppButton target={{ contact: c }} />
                          {editable && <Button small variant="ghost" onClick={() => setModal({ contact: c })}>Editar</Button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loader>
      {matching && (
        <Modal title={`Propiedades para ${matching.fullName}`} wide onClose={() => setMatching(null)}>
          <MatchingProperties contact={matching} />
        </Modal>
      )}
      {modal && (
        <Modal title={modal.contact ? "Editar contacto" : "Nuevo contacto"} wide onClose={() => setModal(null)}>
          <ContactForm initial={modal.contact} onCancel={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
