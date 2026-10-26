"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Textarea } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { money } from "@/lib/labels";

type Plan = {
  id: string; code: string; name: string; priceMonthly: string; isActive: boolean; sortOrder: number;
  limits: { agents: number | null; properties: number | null; contacts: number | null }; features: string[]; _count: { tenants: number };
};

function PlanForm({ initial, onDone, onCancel }: { initial?: Plan; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = formData(e.currentTarget);
    const body = {
      ...(initial ? {} : { code: f.code }),
      name: f.name,
      priceMonthly: f.priceMonthly,
      sortOrder: f.sortOrder || 0,
      isActive: f.isActive === "on",
      limits: { agents: f.agents, properties: f.properties, contacts: f.contacts },
      features: f.features.split(/[\n,]/).map((x) => x.trim()).filter(Boolean),
    };
    setSaving(true);
    setError(null);
    try {
      await api(initial ? `/admin/plans/${initial.id}` : "/admin/plans", { method: initial ? "PATCH" : "POST", json: body });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  const lim = (k: keyof Plan["limits"]) => initial?.limits[k] ?? "";
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
      <Field label="Nombre" className="sm:col-span-3"><Input name="name" required defaultValue={initial?.name} /></Field>
      {!initial && <Field label="Código" hint="Minúsculas, sin espacios." className="sm:col-span-3"><Input name="code" required pattern="[a-z0-9_-]{2,30}" /></Field>}
      <Field label="Precio mensual (Bs)" className="sm:col-span-3"><Input name="priceMonthly" type="number" min={0} step="0.01" required defaultValue={initial ? Number(initial.priceMonthly) : ""} /></Field>
      <Field label="Orden" className="sm:col-span-3"><Input name="sortOrder" type="number" min={0} defaultValue={initial?.sortOrder ?? 0} /></Field>
      <p className="text-sm font-semibold text-ink sm:col-span-6">Límites <span className="font-normal text-ink/65">(vacío = sin límite)</span></p>
      <Field label="Agentes" className="sm:col-span-2"><Input name="agents" type="number" min={0} defaultValue={lim("agents")} /></Field>
      <Field label="Propiedades" className="sm:col-span-2"><Input name="properties" type="number" min={0} defaultValue={lim("properties")} /></Field>
      <Field label="Clientes y leads" className="sm:col-span-2"><Input name="contacts" type="number" min={0} defaultValue={lim("contacts")} /></Field>
      <Field label="Módulos y funciones" hint="Uno por línea o separados por coma." className="sm:col-span-6">
        <Textarea name="features" rows={4} defaultValue={initial?.features.join(", ")} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-medium text-ink sm:col-span-6">
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 accent-brand-teal" />
        Disponible para nuevas empresas
      </label>
      <div className="sm:col-span-6">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} />
      </div>
    </form>
  );
}

export default function PlansPage() {
  const state = useFetch<Plan[]>("/admin/plans");
  const [modal, setModal] = useState<{ plan?: Plan } | null>(null);
  return (
    <>
      <PageHeader title="Planes" subtitle="Precios, límites y módulos. Los cambios aplican de inmediato a las empresas del plan.">
        <Button onClick={() => setModal({})}>Nuevo plan</Button>
      </PageHeader>
      <Loader state={state}>
        {(plans) => (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((p) => (
              <li key={p.id}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold text-ink">{p.name}</h2>
                    {!p.isActive && <Badge>Inactivo</Badge>}
                  </div>
                  <p className="mt-1 text-2xl font-bold text-brand-ink">{money(p.priceMonthly, "BOB")}<span className="text-sm font-medium text-ink/65"> /mes</span></p>
                  <dl className="mt-4 flex flex-col gap-1.5 text-sm">
                    {([["Agentes", p.limits.agents], ["Propiedades", p.limits.properties], ["Clientes y leads", p.limits.contacts]] as const).map(([l, v]) => (
                      <div key={l} className="flex justify-between"><dt className="text-ink/70">{l}</dt><dd className="font-semibold text-ink">{v ?? "Sin límite"}</dd></div>
                    ))}
                    <div className="flex justify-between"><dt className="text-ink/70">Funciones</dt><dd className="font-semibold text-ink">{p.features.length}</dd></div>
                    <div className="flex justify-between"><dt className="text-ink/70">Empresas</dt><dd className="font-semibold text-ink">{p._count.tenants}</dd></div>
                  </dl>
                  <Button variant="ghost" className="mt-5 w-full" onClick={() => setModal({ plan: p })}>Editar</Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Loader>
      {modal && (
        <Modal title={modal.plan ? `Editar plan ${modal.plan.name}` : "Nuevo plan"} wide onClose={() => setModal(null)}>
          <PlanForm initial={modal.plan} onCancel={() => setModal(null)} onDone={() => { setModal(null); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
