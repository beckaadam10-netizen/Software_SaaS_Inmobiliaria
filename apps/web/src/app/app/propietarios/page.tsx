"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDate } from "@/lib/labels";

type Account = { id: string; email: string; fullName: string; isActive: boolean; lastLoginAt: string | null; contactId: string | null };
type Contact = { id: string; fullName: string; type: string; email: string | null };

function AccountForm({ taken, onDone, onCancel }: { taken: string[]; onDone: () => void; onCancel: () => void }) {
  const contacts = useFetch<Contact[] | { items: Contact[] }>("/contacts?type=OWNER");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const list = (Array.isArray(contacts.data) ? contacts.data : contacts.data?.items ?? []).filter((c) => c.type === "OWNER" && !taken.includes(c.id));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/owner/accounts", { method: "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Propietario" hint="Solo contactos de tipo propietario que tengan al menos una propiedad.">
        <Select name="contactId" required options={list.map((c) => [c.id, c.fullName])} placeholder="Elige un contacto" />
      </Field>
      <Field label="Email de acceso"><Input name="email" type="email" required autoComplete="off" /></Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres. Entrégasela al propietario."><Input name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
      <div>
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} label="Dar acceso" />
      </div>
    </form>
  );
}

export default function OwnersPage() {
  const state = useFetch<Account[]>("/owner/accounts");
  const [modal, setModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(a: Account) {
    setError(null);
    try {
      await api(`/users/${a.id}`, { method: "PATCH", json: { isActive: !a.isActive } });
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="Propietarios" subtitle="Dales acceso a su portal: ven sus propiedades, vistas, visitas y ofertas. Nunca datos de los interesados.">
        <Button onClick={() => setModal(true)}>Dar acceso</Button>
      </PageHeader>
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(list) =>
          list.length === 0 ? <Empty title="Ningún propietario tiene acceso todavía">Crea el acceso y comparte con el propietario la dirección de tu sistema, su email y su contraseña.</Empty> : (
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                  <tr>{["Propietario", "Último ingreso", "Estado", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {list.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3"><p className="font-semibold text-ink">{a.fullName}</p><p className="text-xs text-ink/65">{a.email}</p></td>
                      <td className="px-4 py-3 text-ink/65">{a.lastLoginAt ? fmtDate(a.lastLoginAt) : "Nunca"}</td>
                      <td className="px-4 py-3"><Badge tone={a.isActive ? "green" : "neutral"}>{a.isActive ? "Activo" : "Sin acceso"}</Badge></td>
                      <td className="px-4 py-3 text-right"><Button small variant="ghost" onClick={() => toggle(a)}>{a.isActive ? "Quitar acceso" : "Devolver acceso"}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loader>
      {modal && (
        <Modal title="Acceso al portal del propietario" onClose={() => setModal(false)}>
          <AccountForm taken={(state.data ?? []).map((a) => a.contactId ?? "")} onCancel={() => setModal(false)} onDone={() => { setModal(false); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
