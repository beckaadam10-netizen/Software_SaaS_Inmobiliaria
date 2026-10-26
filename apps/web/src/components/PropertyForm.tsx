"use client";

import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { OPERATION, PROPERTY_TYPE } from "@/lib/labels";
import { useAgents, useContacts } from "@/lib/options";
import { MapView } from "./MapView";
import { canAssignAgents, useSession } from "./Shell";
import { ErrorNote, Field, formData, FormActions, Input, Select, Textarea } from "./ui";

export type PropertyValues = Record<string, unknown> & { id?: string; features?: string[] | null };

/** Formulario de alta y edición de propiedades. */
export function PropertyForm({ initial, onSaved, onCancel }: { initial?: PropertyValues; onSaved: (p: { id: string }) => void; onCancel: () => void }) {
  const user = useSession();
  const agents = useAgents();
  const contacts = useContacts();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const v = (k: string) => (initial?.[k] == null ? "" : String(initial[k]));
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(initial?.latitude != null && initial?.longitude != null ? { lat: Number(initial.latitude), lng: Number(initial.longitude) } : null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { features, ...rest } = formData(e.currentTarget);
    const body = { ...rest, features: features.split(",").map((f) => f.trim()).filter(Boolean) };
    setSaving(true);
    setError(null);
    try {
      const saved = initial?.id
        ? await api<{ id: string }>(`/properties/${initial.id}`, { method: "PATCH", json: body })
        : await api<{ id: string }>("/properties", { method: "POST", json: body });
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
      <Field label="Título" className="sm:col-span-6">
        <Input name="title" required maxLength={191} defaultValue={v("title")} placeholder="Casa en Equipetrol con jardín" />
      </Field>
      <Field label="Tipo" className="sm:col-span-2">
        <Select name="type" required options={PROPERTY_TYPE} defaultValue={v("type") || "HOUSE"} />
      </Field>
      <Field label="Operación" className="sm:col-span-2">
        <Select name="operation" required options={OPERATION} defaultValue={v("operation") || "SALE"} />
      </Field>
      <Field label="Moneda" className="sm:col-span-2">
        <Select name="currency" options={{ USD: "Dólares (USD)", BOB: "Bolivianos (Bs)" }} defaultValue={v("currency") || "USD"} />
      </Field>
      <Field label="Precio" className="sm:col-span-2">
        <Input name="price" type="number" required min={1} step="0.01" defaultValue={v("price")} />
      </Field>
      <Field label="Zona" className="sm:col-span-2">
        <Input name="zone" defaultValue={v("zone")} placeholder="Equipetrol" />
      </Field>
      <Field label="Ciudad" className="sm:col-span-2">
        <Input name="city" defaultValue={v("city")} placeholder="Santa Cruz" />
      </Field>
      <Field label="Dirección" hint="Solo uso interno; no se muestra en el portal." className="sm:col-span-6">
        <Input name="address" defaultValue={v("address")} />
      </Field>
      <div className="sm:col-span-6">
        <p className="mb-1.5 text-sm font-medium text-ink">Ubicación en el mapa</p>
        <input type="hidden" name="latitude" value={spot?.lat ?? ""} />
        <input type="hidden" name="longitude" value={spot?.lng ?? ""} />
        <MapView points={[]} picked={spot} onPick={(lat, lng) => setSpot({ lat, lng })} height={260} label="Elegir la ubicación" />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/65">
          <span>{spot ? `Ubicación marcada (${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}). En el portal se muestra aproximada.` : "Haz clic en el mapa para marcar dónde está la propiedad."}</span>
          {spot && <button type="button" onClick={() => setSpot(null)} className="font-semibold text-link hover:underline">Quitar ubicación</button>}
        </div>
      </div>
      <Field label="Terreno (m²)" className="sm:col-span-2">
        <Input name="areaM2" type="number" min={0} step="0.01" defaultValue={v("areaM2")} />
      </Field>
      <Field label="Construcción (m²)" className="sm:col-span-2">
        <Input name="builtM2" type="number" min={0} step="0.01" defaultValue={v("builtM2")} />
      </Field>
      <Field label="Año de construcción" className="sm:col-span-2">
        <Input name="yearBuilt" type="number" min={1800} max={2100} defaultValue={v("yearBuilt")} />
      </Field>
      <Field label="Habitaciones" className="sm:col-span-2">
        <Input name="bedrooms" type="number" min={0} defaultValue={v("bedrooms")} />
      </Field>
      <Field label="Baños" className="sm:col-span-2">
        <Input name="bathrooms" type="number" min={0} defaultValue={v("bathrooms")} />
      </Field>
      <Field label="Parqueos" className="sm:col-span-2">
        <Input name="parking" type="number" min={0} defaultValue={v("parking")} />
      </Field>
      <Field label="Propietario" className="sm:col-span-3">
        <Select name="ownerId" options={contacts} placeholder="Sin asignar" defaultValue={v("ownerId")} key={`o${contacts.length}`} />
      </Field>
      {canAssignAgents(user) && (
        <Field label="Agente responsable" className="sm:col-span-3">
          <Select name="agentId" options={agents} placeholder="Yo" defaultValue={v("agentId")} key={`a${agents.length}`} />
        </Field>
      )}
      <Field label="Características" hint="Separadas por coma: Jardín, Piscina, Churrasquera" className="sm:col-span-6">
        <Input name="features" defaultValue={(initial?.features ?? []).join(", ")} />
      </Field>
      <Field label="Descripción" className="sm:col-span-6">
        <Textarea name="description" rows={4} defaultValue={v("description")} />
      </Field>
      <div className="sm:col-span-6">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} label={initial?.id ? "Guardar cambios" : "Registrar propiedad"} />
      </div>
    </form>
  );
}
