"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDate, money, TENANT_STATUS } from "@/lib/labels";
import { TENANT_TONE } from "@/lib/tones";

type Plan = { id: string; code: string; name: string; limits: Record<string, number | null> };
type Tenant = {
  id: string; slug: string; name: string; status: string; createdAt: string; plan: Plan;
  subscription: { status: string; extraAgents: number; currentPeriodEnd: string } | null;
  usage: { agents: number; users: number; properties: number; contacts: number; leads: number };
};
type Stats = { tenants: { active: number; suspended: number; cancelled: number }; users: number; properties: number; leads: number; estimatedMrr: number };

function TenantForm({ plans, onDone, onCancel }: { plans: Array<[string, string]>; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/admin/tenants", { method: "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre de la empresa" className="sm:col-span-2"><Input name="name" required /></Field>
      <Field label="Subdominio" hint={`${slug || "empresa"}.softinmo.com`}>
        <Input name="slug" required minLength={3} maxLength={32} pattern="[a-z0-9][a-z0-9-]+[a-z0-9]" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
      </Field>
      <Field label="Plan"><Select name="planId" required options={plans} /></Field>
      <p className="text-sm font-semibold text-ink sm:col-span-2">Administrador de la empresa</p>
      <Field label="Nombre completo"><Input name="adminName" required /></Field>
      <Field label="Email"><Input name="adminEmail" type="email" required autoComplete="off" /></Field>
      <Field label="Contraseña inicial" hint="Mínimo 8 caracteres." className="sm:col-span-2"><Input name="adminPassword" type="password" required minLength={8} autoComplete="new-password" /></Field>
      <div className="sm:col-span-2">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} label="Crear empresa" />
      </div>
    </form>
  );
}

function ManageForm({ tenant, plans, onDone, onCancel }: { tenant: Tenant; plans: Array<[string, string]>; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/tenants/${tenant.id}`, { method: "PATCH", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" className="sm:col-span-2"><Input name="name" required defaultValue={tenant.name} /></Field>
      <Field label="Plan"><Select name="planId" options={plans} defaultValue={tenant.plan.id} /></Field>
      <Field label="Agentes adicionales"><Input name="extraAgents" type="number" min={0} defaultValue={tenant.subscription?.extraAgents ?? 0} /></Field>
      <Field label="Estado" hint="Una empresa suspendida no puede ingresar ni mostrar su portal." className="sm:col-span-2">
        <Select name="status" options={TENANT_STATUS} defaultValue={tenant.status} />
      </Field>
      <div className="sm:col-span-2">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} />
      </div>
    </form>
  );
}

const Use = ({ n, limit }: { n: number; limit: number | null | undefined }) => (
  <span className={limit != null && n >= limit ? "font-semibold text-danger" : ""}>{n}{limit != null ? ` / ${limit}` : ""}</span>
);

export default function SuperadminPage() {
  const stats = useFetch<Stats>("/admin/stats");
  const tenants = useFetch<Tenant[]>("/admin/tenants");
  const plans = useFetch<Plan[]>("/admin/plans");
  const [modal, setModal] = useState<{ tenant?: Tenant } | null>(null);
  const planOptions = (plans.data ?? []).map((p) => [p.id, p.name] as [string, string]);
  const reload = () => { tenants.reload(); stats.reload(); };

  return (
    <>
      <PageHeader title="Empresas" subtitle="Todas las inmobiliarias de la plataforma.">
        <Button onClick={() => setModal({})} disabled={!planOptions.length}>Nueva empresa</Button>
      </PageHeader>

      <Loader state={stats}>
        {(s) => (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              ["Empresas activas", s.tenants.active], ["Suspendidas", s.tenants.suspended], ["Usuarios activos", s.users],
              ["Propiedades", s.properties], ["Leads", s.leads], ["Ingreso mensual estimado", money(s.estimatedMrr, "BOB")],
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-2xl font-bold tabular-nums text-brand-ink">{value}</p>
                <p className="mt-1 text-sm text-ink/75">{label}</p>
              </Card>
            ))}
          </div>
        )}
      </Loader>

      <Loader state={tenants}>
        {(list) => (
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                <tr>{["Empresa", "Plan", "Agentes", "Propiedades", "Clientes", "Alta", "Estado", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {list.map((t) => {
                  const agentLimit = t.plan.limits.agents == null ? null : t.plan.limits.agents + (t.subscription?.extraAgents ?? 0);
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3"><p className="font-semibold text-ink">{t.name}</p><p className="text-xs text-ink/65">{t.slug}.softinmo.com</p></td>
                      <td className="px-4 py-3 text-ink/85">{t.plan.name}{t.subscription?.status === "TRIAL" && <span className="text-xs text-ink/60"> · prueba</span>}</td>
                      <td className="px-4 py-3 tabular-nums text-ink/85"><Use n={t.usage.agents} limit={agentLimit} /></td>
                      <td className="px-4 py-3 tabular-nums text-ink/85"><Use n={t.usage.properties} limit={t.plan.limits.properties} /></td>
                      <td className="px-4 py-3 tabular-nums text-ink/85"><Use n={t.usage.contacts} limit={t.plan.limits.contacts} /></td>
                      <td className="px-4 py-3 text-ink/65">{fmtDate(t.createdAt)}</td>
                      <td className="px-4 py-3"><Badge tone={TENANT_TONE[t.status]}>{TENANT_STATUS[t.status]}</Badge></td>
                      <td className="px-4 py-3 text-right"><Button small variant="ghost" onClick={() => setModal({ tenant: t })}>Administrar</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Loader>

      {modal && (
        <Modal title={modal.tenant ? `Administrar ${modal.tenant.name}` : "Nueva empresa"} onClose={() => setModal(null)}>
          {modal.tenant ? (
            <ManageForm tenant={modal.tenant} plans={planOptions} onCancel={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />
          ) : (
            <TenantForm plans={planOptions} onCancel={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />
          )}
        </Modal>
      )}
    </>
  );
}
