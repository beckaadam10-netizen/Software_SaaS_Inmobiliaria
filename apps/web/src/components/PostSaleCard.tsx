"use client";

import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { fmtDate, REFERRAL_STATUS, toLocalInput } from "@/lib/labels";
import { REFERRAL_TONE } from "@/lib/tones";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Modal, Select, Textarea } from "./ui";

export type PostSale = { deliveredAt: string | null; satisfaction: number | null; testimonial: string | null; testimonialPublic: boolean; notes: string | null };
export type Referral = { id: string; fullName: string; phone: string | null; status: string; createdAt: string };

/** Paso 8 del expediente: entrega, satisfacción, testimonio y referidos. */
export function PostSaleCard({ caseId, editable, postSale, referrals, onChange }: { caseId: string; editable: boolean; postSale: PostSale | null; referrals: Referral[]; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = formData(e.currentTarget);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api(`/cases/${caseId}/post-sale`, { method: "PUT", json: { ...f, testimonialPublic: f.testimonialPublic === "on" } });
      setSaved(true);
      onChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  async function refer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/cases/${caseId}/referrals`, { method: "POST", json: formData(e.currentTarget) });
      setAdding(false);
      onChange();
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function setStatus(id: string, status: string) {
    await api(`/referrals/${id}`, { method: "PATCH", json: { status } }).catch((e) => setError(errorText(e)));
    onChange();
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-ink">Postventa</h2>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha de entrega"><Input name="deliveredAt" type="date" disabled={!editable} defaultValue={postSale?.deliveredAt ? toLocalInput(postSale.deliveredAt).slice(0, 10) : ""} /></Field>
        <Field label="Satisfacción del cliente">
          <Select name="satisfaction" disabled={!editable} placeholder="Sin registrar" defaultValue={postSale?.satisfaction ?? ""} options={{ 5: "5 · Muy satisfecho", 4: "4 · Satisfecho", 3: "3 · Neutral", 2: "2 · Insatisfecho", 1: "1 · Muy insatisfecho" }} />
        </Field>
        <Field label="Testimonio" className="sm:col-span-2"><Textarea name="testimonial" disabled={!editable} defaultValue={postSale?.testimonial ?? ""} placeholder="Lo que dijo el cliente, con sus palabras." /></Field>
        <label className="flex items-start gap-2 text-sm font-medium text-ink sm:col-span-2">
          <input type="checkbox" name="testimonialPublic" disabled={!editable} defaultChecked={postSale?.testimonialPublic} className="mt-0.5 h-4 w-4 accent-brand-teal" />
          <span>El cliente autorizó publicarlo en el portal<span className="block text-xs font-normal text-ink/65">Se muestra solo con su nombre de pila.</span></span>
        </label>
        <Field label="Notas internas" className="sm:col-span-2"><Textarea name="notes" disabled={!editable} defaultValue={postSale?.notes ?? ""} /></Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          {editable && <Button type="submit" small disabled={saving}>{saving ? "Guardando…" : "Guardar postventa"}</Button>}
          {saved && <span role="status" className="text-sm text-link">Guardado</span>}
        </div>
      </form>
      <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-ink/10 pt-4">
        <h3 className="text-sm font-semibold text-ink">Referidos ({referrals.length})</h3>
        {editable && <Button small variant="ghost" onClick={() => setAdding(true)}>Agregar referido</Button>}
      </div>
      {referrals.length === 0 ? <p className="mt-2 text-sm text-ink/65">Pide al cliente que te recomiende. Cada referido entra directo a tus leads.</p> : (
        <ul className="mt-1 divide-y divide-ink/10">
          {referrals.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div><p className="text-sm font-medium text-ink">{r.fullName}</p><p className="text-xs text-ink/65">{r.phone ?? "sin teléfono"} · {fmtDate(r.createdAt)}</p></div>
              {editable ? <Select aria-label={`Estado de ${r.fullName}`} options={REFERRAL_STATUS} value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="h-8 w-36 text-xs" /> : <Badge tone={REFERRAL_TONE[r.status]}>{REFERRAL_STATUS[r.status]}</Badge>}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <Modal title="Agregar referido" onClose={() => setAdding(false)}>
          <form onSubmit={refer} className="grid gap-4">
            <Field label="Nombre completo"><Input name="fullName" required maxLength={120} /></Field>
            <Field label="Teléfono"><Input name="phone" type="tel" /></Field>
            <Field label="Qué busca"><Textarea name="notes" /></Field>
            <ErrorNote>{error}</ErrorNote>
            <FormActions onCancel={() => setAdding(false)} saving={false} label="Agregar y crear lead" />
          </form>
        </Modal>
      )}
    </Card>
  );
}
