"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DataTable, Td } from "@/components/finance";
import { useSession } from "@/components/Shell";
import { Badge, Button, Card, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { COMMISSION_STATUS, fmtDate, money, OPERATION } from "@/lib/labels";
import { useAgents } from "@/lib/options";
import { COMMISSION_TONE } from "@/lib/tones";

type Commission = {
  id: string; baseAmount: string; companyAmount: string; agentAmount: string; agentSharePct: string; currency: string; status: string; ruleName: string | null;
  case: { id: string; code: string; operation: string; closedAt: string | null; property: { code: string; title: string } };
  agent: { fullName: string } | null; settlement: { id: string; code: string } | null;
};
type Rule = { id: string; name: string; operation: string | null; agentId: string | null; basis: string; companyValue: string; agentSharePct: string; isActive: boolean; agent: { fullName: string } | null; tiers?: Tier[] | null; tierPeriod?: string | null };
type Tier = { from: number; agentSharePct: number };
const PERIOD: Record<string, string> = { MONTH: "en el mes", YEAR: "en el año" };

function RuleForm({ initial, onDone, onCancel }: { initial?: Rule; onDone: () => void; onCancel: () => void }) {
  const agents = useAgents();
  const [basis, setBasis] = useState(initial?.basis ?? "PERCENT");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState<{ from: string; pct: string }[]>(() => (initial?.tiers ?? []).map((t) => ({ from: String(t.from), pct: String(t.agentSharePct) })));
  const [period, setPeriod] = useState(initial?.tierPeriod ?? "MONTH");
  const setTier = (i: number, k: "from" | "pct", v: string) => setTiers((list) => list.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = formData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api(initial ? `/finance/rules/${initial.id}` : "/finance/rules", { method: initial ? "PATCH" : "POST", json: {
        ...f, isActive: f.isActive === "on",
        tiers: tiers.map((t) => ({ from: Number(t.from || 0), agentSharePct: Number(t.pct || 0) })),
        tierPeriod: tiers.length ? period : null,
      } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre de la regla" className="sm:col-span-2"><Input name="name" required defaultValue={initial?.name} placeholder="Venta: 3 % del precio" /></Field>
      <Field label="Aplica a la operación"><Select name="operation" options={OPERATION} placeholder="Todas" defaultValue={initial?.operation ?? ""} /></Field>
      <Field label="Aplica al agente"><Select name="agentId" options={agents} placeholder="Todos" defaultValue={initial?.agentId ?? ""} key={agents.length} /></Field>
      <Field label="La empresa cobra"><Select name="basis" options={{ PERCENT: "Un porcentaje del precio", FIXED: "Un monto fijo" }} value={basis} onChange={(e) => setBasis(e.target.value)} /></Field>
      <Field label={basis === "PERCENT" ? "Porcentaje (%)" : "Monto fijo"}><Input name="companyValue" type="number" min={0} max={basis === "PERCENT" ? 100 : undefined} step="0.01" required defaultValue={initial ? Number(initial.companyValue) : ""} /></Field>
      <Field label="Parte del agente (%)" hint="Porcentaje de la comisión de la empresa que recibe el agente." className="sm:col-span-2">
        <Input name="agentSharePct" type="number" min={0} max={100} step="0.01" required defaultValue={initial ? Number(initial.agentSharePct) : 50} />
      </Field>
      <fieldset className="rounded-lg border border-ink/15 p-3 sm:col-span-2" aria-label="Comisión por nivel">
        <legend className="px-1 text-sm font-semibold text-ink">Comisión por nivel (opcional)</legend>
        <p className="mb-2 text-xs text-ink/70">Si el agente vende más, recibe una parte mayor. Se suma lo cerrado por el agente en la misma moneda, incluida la operación actual. El primer nivel empieza en 0.</p>
        {tiers.length > 0 && (
          <>
            <Field label="Contar ventas" className="mb-2"><Select aria-label="Periodo de los niveles" options={{ MONTH: "Del mes", YEAR: "Del año" }} value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
            <ul className="flex flex-col gap-2">
              {tiers.map((t, i) => (
                <li key={i} className="flex flex-wrap items-end gap-2">
                  <span className="w-16 pb-2 text-sm font-medium text-ink">Nivel {i + 1}</span>
                  <Field label="Desde (monto vendido)" className="min-w-0 flex-1"><Input aria-label={`Nivel ${i + 1} desde`} type="number" min={0} step="0.01" required value={t.from} onChange={(e) => setTier(i, "from", e.target.value)} /></Field>
                  <Field label="Parte del agente (%)" className="w-36"><Input aria-label={`Nivel ${i + 1} porcentaje`} type="number" min={0} max={100} step="0.01" required value={t.pct} onChange={(e) => setTier(i, "pct", e.target.value)} /></Field>
                  <Button small variant="ghost" type="button" onClick={() => setTiers((list) => list.filter((_, j) => j !== i))}>Quitar</Button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tiers.length < 6 && (
          <Button small variant="ghost" type="button" className="mt-2" onClick={() => setTiers((list) => [...list, { from: list.length ? "" : "0", pct: "" }])}>Agregar nivel</Button>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-medium text-ink sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 accent-brand-teal" /> Regla activa
      </label>
      <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={onCancel} saving={saving} /></div>
    </form>
  );
}

export default function CommissionsPage() {
  const user = useSession();
  const commissions = useFetch<Commission[]>("/finance/commissions");
  const rules = useFetch<Rule[]>("/finance/rules");
  const [rule, setRule] = useState<{ item?: Rule } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      await api(`/finance/commissions/${id}`, { method: "PATCH", json: { status } });
      commissions.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <PageHeader title="Comisiones" subtitle="Se generan solas al cerrar cada operación. Apruébalas para poder liquidarlas." />
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={commissions}>
        {(rows) =>
          rows.length === 0 ? <Empty title="Aún no hay comisiones">Aparecerán aquí cuando cierres una operación como ganada.</Empty> : (
            <DataTable head={["Operación", "Agente", { label: "Precio de cierre", num: true }, { label: "Comisión empresa", num: true }, { label: "Comisión agente", num: true }, "Estado", ""]} minWidth={980}>
              {rows.map((c) => (
                <tr key={c.id}>
                  <Td><Link href={`/app/gestion/${c.case.id}`} className="font-semibold text-link hover:underline">{c.case.code}</Link><span className="block text-xs text-ink/65">{c.case.property.title}{c.case.closedAt ? ` · ${fmtDate(c.case.closedAt)}` : ""}</span></Td>
                  <Td>{c.agent?.fullName ?? "—"}</Td>
                  <Td num>{money(c.baseAmount, c.currency)}</Td>
                  <Td num>{money(c.companyAmount, c.currency)}<span className="block text-xs text-ink/65">{c.ruleName}</span></Td>
                  <Td num strong>{money(c.agentAmount, c.currency)}<span className="block text-xs font-normal text-ink/65">{Number(c.agentSharePct)} % de la comisión</span></Td>
                  <Td><Badge tone={COMMISSION_TONE[c.status]}>{COMMISSION_STATUS[c.status]}</Badge>{c.settlement && <span className="mt-1 block text-xs text-ink/65">{c.settlement.code}</span>}</Td>
                  <Td>
                    {!c.settlement && (c.status === "GENERATED" || c.status === "PENDING") && (
                      <div className="flex justify-end gap-1.5">
                        <Button small variant="accent" onClick={() => setStatus(c.id, "APPROVED")}>Aprobar</Button>
                        <Button small variant="ghost" onClick={() => setStatus(c.id, "CANCELLED")}>Cancelar</Button>
                      </div>
                    )}
                    {!c.settlement && c.status === "APPROVED" && <span className="block text-right text-xs text-ink/65">Lista para liquidar</span>}
                  </Td>
                </tr>
              ))}
            </DataTable>
          )
        }
      </Loader>

      <div className="mb-3 mt-8 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-ink">Reglas de comisión</h2>
          <p className="text-sm text-ink/70">Se aplica la más específica: agente y operación, luego agente, luego operación, luego la general. Si en la captación se acordó un porcentaje, ese manda.</p>
        </div>
        {user.role === "ADMIN" && <Button small className="shrink-0 whitespace-nowrap" onClick={() => setRule({})}>Nueva regla</Button>}
      </div>
      <Loader state={rules}>
        {(list) => (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((r) => (
              <li key={r.id}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-ink">{r.name}</h3>{!r.isActive && <Badge>Inactiva</Badge>}</div>
                  <dl className="mt-2 flex flex-1 flex-col gap-1 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-ink/70">Operación</dt><dd className="font-medium text-ink">{r.operation ? OPERATION[r.operation] : "Todas"}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink/70">Agente</dt><dd className="font-medium text-ink">{r.agent?.fullName ?? "Todos"}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink/70">La empresa cobra</dt><dd className="font-medium text-ink">{r.basis === "PERCENT" ? `${Number(r.companyValue)} % del precio` : `Monto fijo de ${Number(r.companyValue).toLocaleString("es-BO")}`}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink/70">Parte del agente</dt><dd className="font-medium text-ink">{r.tiers?.length ? "Por nivel" : `${Number(r.agentSharePct)} %`}</dd></div>
                    {r.tiers?.length ? (
                      <div className="mt-1 rounded-md bg-surface p-2">
                        <p className="text-xs font-semibold text-ink/70">Según lo vendido {PERIOD[r.tierPeriod ?? "MONTH"]}</p>
                        <ul className="mt-1 text-xs text-ink">
                          {r.tiers.map((t, i) => <li key={i} className="flex justify-between gap-2"><span>Nivel {i + 1} · desde {Number(t.from).toLocaleString("es-BO")}</span><strong>{Number(t.agentSharePct)} %</strong></li>)}
                        </ul>
                      </div>
                    ) : null}
                  </dl>
                  {user.role === "ADMIN" && <Button small variant="ghost" className="mt-3 self-start" onClick={() => setRule({ item: r })}>Editar</Button>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Loader>
      {rule && (
        <Modal title={rule.item ? "Editar regla" : "Nueva regla de comisión"} onClose={() => setRule(null)}>
          <RuleForm initial={rule.item} onCancel={() => setRule(null)} onDone={() => { setRule(null); rules.reload(); }} />
        </Modal>
      )}
    </>
  );
}
