"use client";

import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/Avatar";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useSession } from "@/components/Shell";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDate, ROLE } from "@/lib/labels";

type User = { id: string; email: string; fullName: string; role: string; phone: string | null; isActive: boolean; lastLoginAt: string | null; permissions: string[]; branch: { id: string; name: string } | null; avatar?: string | null };
type Permission = { key: string; role: string; label: string; help: string; default: boolean };
type Branches = { enabled: boolean; items: Array<{ id: string; name: string }> };
type Usage = { plan: { name: string }; limits: Record<string, number | null>; usage: Record<string, number> };
const ROLES = { ADMIN: "Administrador", AGENT: "Agente", ACCOUNTANT: "Contador" };
const LIMIT_LABEL: Record<string, string> = { agents: "Agentes", properties: "Propiedades activas", contacts: "Clientes y leads" };

function UserForm({ initial, branches, onDone, onCancel }: { initial?: User; branches: Branches | null; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { password, ...rest } = formData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api(initial ? `/users/${initial.id}` : "/users", { method: initial ? "PATCH" : "POST", json: { ...rest, ...(password ? { password } : {}) } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {initial && initial.role !== "ACCOUNTANT" && (
        <div className="sm:col-span-2"><AvatarUpload name={initial.fullName} src={initial.avatar ?? null} path={`/users/${initial.id}/avatar`} onChange={() => undefined} /></div>
      )}
      <Field label="Nombre completo" className="sm:col-span-2"><Input name="fullName" required defaultValue={initial?.fullName} /></Field>
      {!initial && <Field label="Email" className="sm:col-span-2"><Input name="email" type="email" required autoComplete="off" /></Field>}
      <Field label="Rol"><Select name="role" options={ROLES} defaultValue={initial?.role ?? "AGENT"} /></Field>
      <Field label="Teléfono"><Input name="phone" type="tel" defaultValue={initial?.phone ?? ""} /></Field>
      {branches?.enabled && branches.items.length > 0 && (
        <Field label="Sucursal" className="sm:col-span-2"><Select name="branchId" options={branches.items.map((b) => [b.id, b.name])} placeholder="Sin sucursal" defaultValue={initial?.branch?.id ?? ""} /></Field>
      )}
      <Field label={initial ? "Nueva contraseña" : "Contraseña"} hint={initial ? "Déjala vacía para no cambiarla." : "Mínimo 8 caracteres."} className="sm:col-span-2">
        <Input name="password" type="password" minLength={8} required={!initial} autoComplete="new-password" />
      </Field>
      <div className="sm:col-span-2">
        <ErrorNote>{error}</ErrorNote>
        <FormActions onCancel={onCancel} saving={saving} />
      </div>
    </form>
  );
}

/** Permisos puntuales de una persona: parten de su rol y el administrador los ajusta. */
function PermissionsForm({ user, catalog, onDone, onCancel }: { user: User; catalog: Permission[]; onDone: () => void; onCancel: () => void }) {
  const list = catalog.filter((p) => p.role === user.role);
  const [on, setOn] = useState<string[]>(user.permissions);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api(`/users/${user.id}`, { method: "PATCH", json: { permissions: Object.fromEntries(list.map((p) => [p.key, on.includes(p.key)])) } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="mb-4 text-sm text-ink/70">Parten de lo que permite el rol de {ROLE[user.role].toLowerCase()}. Los cambios se aplican en el momento.</p>
      <ul className="flex flex-col gap-3">
        {list.map((p) => (
          <li key={p.key}>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={on.includes(p.key)} onChange={(e) => setOn(e.target.checked ? [...on, p.key] : on.filter((k) => k !== p.key))} className="mt-0.5 h-4 w-4 accent-brand-teal" />
              <span className="text-sm"><span className="font-semibold text-ink">{p.label}</span>{p.default && <span className="ml-1.5 text-xs text-ink/60">(incluido en el rol)</span>}<span className="block text-ink/70">{p.help}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <ErrorNote>{error}</ErrorNote>
      <FormActions onCancel={onCancel} saving={saving} label="Guardar permisos" />
    </form>
  );
}

export default function TeamPage() {
  const me = useSession();
  const users = useFetch<User[]>("/users");
  const usage = useFetch<Usage>("/users/usage");
  const [modal, setModal] = useState<{ user?: User } | null>(null);
  const [permsFor, setPermsFor] = useState<User | null>(null);
  const branches = useFetch<Branches>("/branches");
  const catalog = useFetch<Permission[]>("/users/permissions");
  const [error, setError] = useState<string | null>(null);
  const reload = () => { users.reload(); usage.reload(); };

  async function toggle(u: User) {
    setError(null);
    try {
      await api(`/users/${u.id}`, { method: "PATCH", json: { isActive: !u.isActive } });
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="Equipo y plan" subtitle="Usuarios de tu empresa y uso de tu plan.">
        <Button onClick={() => setModal({})}>Nuevo usuario</Button>
      </PageHeader>

      <Loader state={usage}>
        {(u) => (
          <Card className="mb-6">
            <h2 className="mb-3 font-semibold text-ink">Plan {u.plan.name}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {Object.keys(LIMIT_LABEL).map((k) => {
                const limit = u.limits[k];
                const pct = limit ? Math.min(100, Math.round((u.usage[k] / limit) * 100)) : 0;
                return (
                  <div key={k}>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink/75">{LIMIT_LABEL[k]}</span>
                      <span className="font-semibold tabular-nums text-ink">{u.usage[k]} de {limit ?? "sin límite"}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/10">
                      <div className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-brand-teal"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </Loader>

      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={users}>
        {(list) => (
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                <tr>{["Nombre", "Rol", ...(branches.data?.enabled ? ["Sucursal"] : []), "Teléfono", "Último ingreso", "Estado", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {list.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={u.fullName} src={u.avatar} size={36} className="!ring-ink/10" /><div className="min-w-0"><p className="font-semibold text-ink">{u.fullName}</p><p className="text-xs text-ink/65">{u.email}</p></div></div></td>
                    <td className="px-4 py-3 text-ink/85">{ROLE[u.role]}{u.role !== "ADMIN" && catalog.data && u.permissions.join() !== catalog.data.filter((p) => p.role === u.role && p.default).map((p) => p.key).join() && <span className="block text-xs text-link">Permisos ajustados</span>}</td>
                    {branches.data?.enabled && <td className="px-4 py-3 text-ink/85">{u.branch?.name ?? "—"}</td>}
                    <td className="px-4 py-3 text-ink/85">{u.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-ink/65">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Nunca"}</td>
                    <td className="px-4 py-3"><Badge tone={u.isActive ? "green" : "neutral"}>{u.isActive ? "Activo" : "Inactivo"}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button small variant="ghost" onClick={() => setModal({ user: u })}>Editar</Button>
                        {u.role !== "ADMIN" && <Button small variant="ghost" onClick={() => setPermsFor(u)}>Permisos</Button>}
                        {u.id !== me.id && <Button small variant="ghost" onClick={() => toggle(u)}>{u.isActive ? "Desactivar" : "Activar"}</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loader>
      {permsFor && catalog.data && (
        <Modal title={`Permisos de ${permsFor.fullName}`} onClose={() => setPermsFor(null)}>
          <PermissionsForm user={permsFor} catalog={catalog.data} onCancel={() => setPermsFor(null)} onDone={() => { setPermsFor(null); users.reload(); }} />
        </Modal>
      )}
      {modal && (
        <Modal title={modal.user ? "Editar usuario" : "Nuevo usuario"} onClose={() => { setModal(null); users.reload(); }}>
          <UserForm initial={modal.user} branches={branches.data} onCancel={() => { setModal(null); users.reload(); }} onDone={() => { setModal(null); reload(); }} />
        </Modal>
      )}
    </>
  );
}
