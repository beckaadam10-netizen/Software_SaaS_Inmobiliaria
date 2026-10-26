"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";

type Branch = { id: string; name: string; city: string | null; address: string | null; phone: string | null; agents: number; properties: number };

export default function BranchesPage() {
  const state = useFetch<{ enabled: boolean; items: Branch[] }>("/branches");
  const [modal, setModal] = useState<{ branch?: Branch } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api(modal?.branch ? `/branches/${modal.branch.id}` : "/branches", { method: modal?.branch ? "PATCH" : "POST", json: formData(e.currentTarget) });
      setModal(null); state.reload();
    } catch (err) {
      setError(errorText(err));
    }
    setSaving(false);
  }
  async function remove(b: Branch) {
    setError(null);
    try {
      await api(`/branches/${b.id}`, { method: "DELETE" });
      state.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <PageHeader title="Sucursales" subtitle="Cada agente pertenece a una sucursal; sus propiedades, clientes y operaciones también. Arriba eliges ver toda la empresa o una sucursal.">
        <Button onClick={() => { setError(null); setModal({}); }}>Nueva sucursal</Button>
      </PageHeader>
      <div className="mb-4"><ErrorNote>{!modal && error}</ErrorNote></div>
      <Loader state={state}>
        {(d) => d.items.length === 0 ? <Empty title="Aún no hay sucursales">Créalas y luego asigna a cada persona su sucursal en Equipo y plan.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {d.items.map((b) => (
              <Card key={b.id}>
                <h2 className="text-lg font-bold text-ink">{b.name}</h2>
                <p className="text-sm text-ink/70">{[b.city, b.address, b.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
                <dl className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-surface px-3 py-2"><dt className="text-xs text-ink/65">Agentes</dt><dd className="text-xl font-bold tabular-nums text-ink">{b.agents}</dd></div>
                  <div className="rounded-xl bg-surface px-3 py-2"><dt className="text-xs text-ink/65">Propiedades en oferta</dt><dd className="text-xl font-bold tabular-nums text-ink">{b.properties}</dd></div>
                </dl>
                <div className="mt-4 flex gap-2">
                  <Button small variant="ghost" onClick={() => { setError(null); setModal({ branch: b }); }}>Editar</Button>
                  <Button small variant="danger" onClick={() => remove(b)}>Eliminar</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Loader>
      {modal && (
        <Modal title={modal.branch ? "Editar sucursal" : "Nueva sucursal"} onClose={() => setModal(null)}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" className="sm:col-span-2"><Input name="name" required maxLength={80} defaultValue={modal.branch?.name} placeholder="La Paz" /></Field>
            <Field label="Ciudad"><Input name="city" maxLength={80} defaultValue={modal.branch?.city ?? ""} /></Field>
            <Field label="Teléfono"><Input name="phone" type="tel" defaultValue={modal.branch?.phone ?? ""} /></Field>
            <Field label="Dirección" className="sm:col-span-2"><Input name="address" defaultValue={modal.branch?.address ?? ""} /></Field>
            <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={() => setModal(null)} saving={saving} /></div>
          </form>
        </Modal>
      )}
    </>
  );
}
