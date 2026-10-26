"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorText, useFetch } from "@/lib/api";
import { OPERATION, PROPERTY_TYPE } from "@/lib/labels";
import { useAgents } from "@/lib/options";
import { canAssignAgents, hasPermission, useSession } from "./Shell";
import { Button, ErrorNote, Field, formData, Input, Modal, Select } from "./ui";

type Contact = { id: string; fullName: string; phone: string | null; type: string };
type Prop = { id: string; code: string; title: string; status: string; operation: string; cases?: Array<{ id: string; code: string }> };

const section = "rounded-xl border border-ink/10 p-4";
const legend = "px-1 text-sm font-bold text-ink";
const num = (v: string) => (v === "" ? undefined : Number(v));

/**
 * Nueva captación: abre un expediente en el paso 1. Con una propiedad nueva registra también el inmueble
 * (y el propietario si no existe); con una ya registrada abre otra gestión para ella.
 */
export function NewCaptation({ onClose }: { onClose: () => void }) {
  const user = useSession();
  const router = useRouter();
  const canCreate = user.role === "ADMIN" || hasPermission(user, "create_properties");
  const [mode, setMode] = useState<"new" | "existing">(canCreate ? "new" : "existing");
  const [ownerMode, setOwnerMode] = useState<"pick" | "new">("pick");
  // Si el propietario nuevo ya se creó y luego falló otro paso, no se vuelve a crear al reintentar.
  const [createdOwner, setCreatedOwner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const contacts = useFetch<Contact[]>(mode === "new" ? "/contacts" : null);
  const props = useFetch<Prop[]>(mode === "existing" ? "/properties" : null);
  const agents = useAgents();
  const owners = (contacts.data ?? []).slice().sort((a, b) => Number(b.type === "OWNER") - Number(a.type === "OWNER") || a.fullName.localeCompare(b.fullName));
  const free = (props.data ?? []).filter((p) => !p.cases?.length && p.status !== "INACTIVE");

  const terms = (f: Record<string, string>) => ({ isExclusive: f.isExclusive === "on", commissionPct: num(f.commissionPct) ?? null, captationEnds: f.captationEnds || null });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = formData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      let caseId: string | null;
      if (mode === "new") {
        let ownerId: string | null = f.ownerId || null;
        if (ownerMode === "new") {
          ownerId = createdOwner;
          if (!ownerId) {
            const owner = await api<{ id: string }>("/contacts", { method: "POST", json: { fullName: f.ownerName, phone: f.ownerPhone, email: f.ownerEmail, type: "OWNER" } });
            ownerId = owner.id;
            setCreatedOwner(owner.id);
          }
        }
        const created = await api<{ caseId: string | null }>("/properties", {
          method: "POST",
          json: {
            title: f.title, type: f.type, operation: f.operation, price: f.price, currency: f.currency, zone: f.zone, city: f.city, address: f.address,
            bedrooms: num(f.bedrooms), bathrooms: num(f.bathrooms), builtM2: num(f.builtM2), areaM2: num(f.areaM2),
            ownerId, agentId: f.agentId || undefined, captation: terms(f),
          },
        });
        caseId = created.caseId;
      } else {
        const opened = await api<{ id: string }>("/cases", { method: "POST", json: { propertyId: f.propertyId, ...terms(f) } });
        caseId = opened.id;
      }
      onClose();
      router.push(caseId ? `/app/gestion/${caseId}` : "/app/gestion");
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <Modal wide title="Nueva captación" onClose={onClose}>
      <p className="-mt-2 mb-4 text-sm text-ink/70">Abre un expediente en el paso 1, Captación. Después lo completas con las fotos, la autorización y el resto de los pasos.</p>
      <div role="radiogroup" aria-label="Qué se capta" className="mb-4 grid gap-2 sm:grid-cols-2">
        {([["new", "Propiedad nueva", "Registra el inmueble y su propietario."], ["existing", "Propiedad ya registrada", "Abre una nueva gestión para un inmueble que ya está en el sistema."]] as const)
          .filter(([k]) => k === "existing" || canCreate)
          .map(([k, label, help]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => { setMode(k); setError(null); }}
              className={`rounded-xl p-3 text-left ring-1 transition ${mode === k ? "bg-brand-deep text-on-brand ring-brand-deep" : "bg-white text-ink ring-ink/15 hover:bg-ink/5"}`}>
              <span className="block font-semibold">{label}</span>
              <span className={`block text-xs ${mode === k ? "text-on-brand/80" : "text-ink/65"}`}>{help}</span>
            </button>
          ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === "new" ? (
          <>
            <fieldset className={section}>
              <legend className={legend}>1. Propietario</legend>
              <div className="mb-3 flex gap-4 text-sm">
                {([["pick", "Ya está registrado"], ["new", "Es nuevo"]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 font-medium text-ink">
                    <input type="radio" name="ownerMode" checked={ownerMode === k} onChange={() => setOwnerMode(k)} className="h-4 w-4 accent-brand-teal" /> {label}
                  </label>
                ))}
              </div>
              {ownerMode === "pick" ? (
                <Field label="Propietario">
                  <Select name="ownerId" required options={owners.map((c) => [c.id, `${c.fullName}${c.phone ? ` · ${c.phone}` : ""}${c.type === "OWNER" ? "" : " (cliente)"}`])} placeholder={contacts.data ? "Elige al propietario" : "Cargando…"} key={owners.length} />
                </Field>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Nombre completo"><Input name="ownerName" required maxLength={120} placeholder="María Suárez" /></Field>
                  <Field label="Teléfono o WhatsApp"><Input name="ownerPhone" type="tel" required minLength={6} maxLength={30} /></Field>
                  <Field label="Email (opcional)"><Input name="ownerEmail" type="email" maxLength={190} /></Field>
                </div>
              )}
            </fieldset>

            <fieldset className={section}>
              <legend className={legend}>2. Inmueble</legend>
              <div className="grid gap-3 sm:grid-cols-6">
                <Field label="Título" className="sm:col-span-6"><Input name="title" required maxLength={191} placeholder="Casa en Equipetrol con jardín" /></Field>
                <Field label="Tipo" className="sm:col-span-2"><Select name="type" options={PROPERTY_TYPE} defaultValue="HOUSE" /></Field>
                <Field label="Operación" className="sm:col-span-2"><Select name="operation" options={OPERATION} defaultValue="SALE" /></Field>
                <Field label="Moneda" className="sm:col-span-2"><Select name="currency" options={{ USD: "Dólares (USD)", BOB: "Bolivianos (Bs)" }} defaultValue="USD" /></Field>
                <Field label="Precio" className="sm:col-span-2"><Input name="price" type="number" required min={1} step="0.01" /></Field>
                <Field label="Zona" className="sm:col-span-2"><Input name="zone" maxLength={120} placeholder="Equipetrol" /></Field>
                <Field label="Ciudad" className="sm:col-span-2"><Input name="city" maxLength={120} defaultValue="Santa Cruz" /></Field>
                <Field label="Dirección (interna)" className="sm:col-span-6"><Input name="address" maxLength={190} placeholder="No se publica en el portal" /></Field>
                <Field label="Habitaciones" className="sm:col-span-1"><Input name="bedrooms" type="number" min={0} max={100} /></Field>
                <Field label="Baños" className="sm:col-span-1"><Input name="bathrooms" type="number" min={0} max={100} /></Field>
                <Field label="Construidos (m²)" className="sm:col-span-2"><Input name="builtM2" type="number" min={0} step="0.01" /></Field>
                <Field label="Terreno (m²)" className="sm:col-span-2"><Input name="areaM2" type="number" min={0} step="0.01" /></Field>
              </div>
            </fieldset>
          </>
        ) : (
          <fieldset className={section}>
            <legend className={legend}>1. Propiedad</legend>
            <Field label="Propiedad sin gestión abierta" hint="Las que ya tienen un expediente abierto no aparecen.">
              <Select name="propertyId" required options={free.map((p) => [p.id, `${p.code} · ${p.title} · ${OPERATION[p.operation]}`])} placeholder={props.data ? (free.length ? "Elige la propiedad" : "Todas tienen una gestión abierta") : "Cargando…"} key={free.length} />
            </Field>
          </fieldset>
        )}

        <fieldset className={section}>
          <legend className={legend}>{mode === "new" ? "3" : "2"}. Condiciones de la captación</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {mode === "new" && canAssignAgents(user) && (
              <Field label="Agente a cargo"><Select name="agentId" options={agents} placeholder="Yo" key={agents.length} /></Field>
            )}
            <Field label="Comisión acordada (%)" hint="Si la dejas vacía se usa la regla de comisión."><Input name="commissionPct" type="number" min={0} max={100} step="0.01" placeholder="3" /></Field>
            <Field label="La autorización vence"><Input name="captationEnds" type="date" /></Field>
            <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium text-ink">
              <input type="checkbox" name="isExclusive" className="h-4 w-4 accent-brand-teal" /> Captación exclusiva
            </label>
          </div>
        </fieldset>

        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={saving || (mode === "existing" && !free.length)}>{saving ? "Abriendo…" : "Abrir expediente"}</Button>
        </div>
      </form>
    </Modal>
  );
}
