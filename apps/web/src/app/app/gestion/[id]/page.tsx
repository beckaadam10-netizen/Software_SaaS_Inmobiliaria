"use client";

import Link from "next/link";
import { use, useState, type FormEvent } from "react";
import { CaptationTools } from "@/components/CaptationTools";
import { DocumentsCard } from "@/components/DocumentsCard";
import { LegalCard } from "@/components/LegalCard";
import { NegotiationCard, type Offer, type Reservation } from "@/components/NegotiationCard";
import { PostSaleCard, type PostSale, type Referral } from "@/components/PostSaleCard";
import { canEdit, useSession } from "@/components/Shell";
import { Timeline, type TimelineItem } from "@/components/Timeline";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { CASE_STATUS, COMMISSION_STATUS, fmtDate, fmtDateTime, LEAD_STATUS, money, OPERATION, STAGE, STAGE_HELP, STAGE_STATUS, STAGES, VISIT_STATUS } from "@/lib/labels";
import { useContacts } from "@/lib/options";
import { CASE_TONE, COMMISSION_TONE, STAGE_TONE, VISIT_TONE } from "@/lib/tones";
import { imageUrl } from "@/lib/images";

type Person = { id: string; fullName: string; phone?: string | null; email?: string | null };
type Stage = { stage: string; status: string; notes: string | null; completedAt: string | null };
type CaseDetail = {
  id: string; code: string; operation: string; price: string; currency: string; currentStage: string; status: string;
  isExclusive: boolean; commissionPct: string | null; captationEnds: string | null; closedPrice: string | null; lostReason: string | null; closedAt: string | null;
  property: { id: string; code: string; title: string; zone: string | null; city: string | null; isPublished: boolean; images: Array<{ id: string }> };
  owner: Person | null; client: Person | null; agent: { fullName: string } | null; stages: Stage[];
  leads: Array<{ id: string; status: string; score: number; createdAt: string; contact: Person }>;
  visits: Array<{ id: string; status: string; scheduledAt: string; result: string | null; contact: Person }>;
  offers: Offer[]; reservations: Reservation[]; referrals: Referral[]; postSale: PostSale | null;
  commission: { companyAmount: string; agentAmount: string; agentSharePct: string; currency: string; status: string; ruleName: string | null } | null;
  timeline: TimelineItem[];
};

function CloseForm({ c, onDone, onCancel }: { c: CaseDetail; onDone: () => void; onCancel: () => void }) {
  const contacts = useContacts();
  const [result, setResult] = useState<"WON" | "LOST">("WON");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/cases/${c.id}/close`, { method: "POST", json: { result, ...formData(e.currentTarget) } });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="flex gap-2">
        <Button small variant={result === "WON" ? "primary" : "ghost"} onClick={() => setResult("WON")}>Ganada</Button>
        <Button small variant={result === "LOST" ? "primary" : "ghost"} onClick={() => setResult("LOST")}>Perdida</Button>
      </div>
      {result === "WON" ? (
        <>
          <Field label="Cliente con quien se cerró">
            <Select name="clientId" required options={contacts} placeholder="Elige un contacto" defaultValue={c.client?.id ?? c.leads[0]?.contact.id ?? ""} key={contacts.length} />
          </Field>
          <Field label={`Precio de cierre (${c.currency})`}><Input name="closedPrice" type="number" min={1} step="0.01" required defaultValue={Number(c.offers.find((o) => o.status === "ACCEPTED")?.amount ?? c.price)} /></Field>
          <p className="text-sm text-ink/70">La propiedad quedará como {c.operation === "SALE" ? "vendida" : "alquilada"} y saldrá del portal.</p>
        </>
      ) : (
        <Field label="Motivo"><Input name="lostReason" required placeholder="El propietario retiró el inmueble" /></Field>
      )}
      <ErrorNote>{error}</ErrorNote>
      <FormActions onCancel={onCancel} saving={saving} label="Cerrar operación" />
    </form>
  );
}

function StagePanel({ caseId, stage, index, editable, onChange }: { caseId: string; stage: Stage; index: number; editable: boolean; onChange: () => void }) {
  const [notes, setNotes] = useState(stage.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(body: object) {
    setBusy(true);
    setError(null);
    try {
      await api(`/cases/${caseId}/stages/${stage.stage}`, { method: "PATCH", json: body });
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">Paso {index + 1}: {STAGE[stage.stage]}</h2>
        <Badge tone={STAGE_TONE[stage.status]}>{STAGE_STATUS[stage.status]}</Badge>
      </div>
      <p className="mt-1 text-sm text-ink/70">{STAGE_HELP[stage.stage]}</p>
      {stage.completedAt && <p className="mt-1 text-xs text-ink/60">Completado el {fmtDate(stage.completedAt)}</p>}
      <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-ink">
        Notas del paso
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} placeholder="Acuerdos, pendientes, observaciones…" />
      </label>
      <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>
      {editable && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button small variant="ghost" disabled={busy || notes === (stage.notes ?? "")} onClick={() => save({ notes })}>Guardar notas</Button>
          {stage.status === "PENDING" && <Button small variant="ghost" disabled={busy} onClick={() => save({ status: "IN_PROGRESS", notes })}>Iniciar paso</Button>}
          {stage.status !== "DONE" && <Button small variant="accent" disabled={busy} onClick={() => save({ status: "DONE", notes })}>Completar paso</Button>}
          {stage.status === "DONE" && <Button small variant="ghost" disabled={busy} onClick={() => save({ status: "IN_PROGRESS", notes })}>Reabrir</Button>}
        </div>
      )}
    </Card>
  );
}

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useSession();
  const editable = canEdit(user.role);
  const state = useFetch<CaseDetail>(`/cases/${id}`);
  const [selected, setSelected] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [docsKey, setDocsKey] = useState(0);

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await api(`/cases/${id}/notes`, { method: "POST", json: { note } }).catch(() => null);
    setNote("");
    state.reload();
  }

  return (
    <Loader state={state}>
      {(c) => {
        const current = selected ?? c.currentStage;
        const index = STAGES.indexOf(current);
        const stage = c.stages[index];
        return (
          <>
            <Link href="/app/gestion" className="text-sm font-medium text-link hover:underline">← Gestión comercial</Link>
            <PageHeader title={c.property.title} subtitle={`Expediente ${c.code} · ${OPERATION[c.operation]} · ${money(c.price, c.currency)}`}>
              <Badge tone={CASE_TONE[c.status]}>{CASE_STATUS[c.status]}</Badge>
              {editable && c.status === "OPEN" && <Button onClick={() => setClosing(true)}>Cerrar operación</Button>}
            </PageHeader>

            {c.status !== "OPEN" && (
              <p className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${c.status === "WON" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                {c.status === "WON"
                  ? `Operación ganada el ${fmtDate(c.closedAt!)} por ${money(c.closedPrice, c.currency)}. Continúa con el proceso legal y la postventa.`
                  : `Operación perdida el ${fmtDate(c.closedAt!)}${c.lostReason ? `: ${c.lostReason}` : ""}.`}
              </p>
            )}

            <ol className="mb-4 grid grid-cols-4 gap-1.5 lg:grid-cols-8">
              {c.stages.map((s, i) => (
                <li key={s.stage}>
                  <button
                    onClick={() => setSelected(s.stage)}
                    aria-current={s.stage === current ? "step" : undefined}
                    className={`flex h-full w-full flex-col items-start rounded-xl px-2.5 py-2 text-left ring-1 transition ${
                      s.stage === current ? "bg-brand-deep text-on-brand ring-brand-deep" : "bg-white text-ink ring-ink/10 hover:ring-brand-teal"
                    }`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      s.status === "DONE" ? "bg-brand-teal text-on-brand" : s.status === "IN_PROGRESS" ? "bg-accent-lime text-on-accent" : "bg-ink/15 text-ink"
                    }`}>
                      {s.status === "DONE" ? "✓" : i + 1}
                    </span>
                    <span className="mt-1.5 text-xs font-semibold leading-tight">{STAGE[s.stage]}</span>
                  </button>
                </li>
              ))}
            </ol>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="flex flex-col gap-4 xl:col-span-2">
                <StagePanel key={`${stage.stage}-${stage.status}-${stage.notes}`} caseId={id} stage={stage} index={index} editable={editable} onChange={state.reload} />
                {current === "CAPTATION" && c.status === "OPEN" && <CaptationTools c={c} editable={editable} onChange={() => { state.reload(); setDocsKey((k) => k + 1); }} />}

                {(c.offers.length > 0 || c.reservations.length > 0 || STAGES.indexOf(c.currentStage) >= 2) && (
                  <NegotiationCard caseId={id} currency={c.currency} price={c.price} open={c.status === "OPEN"} editable={editable} offers={c.offers} reservations={c.reservations}
                    defaultContactId={c.client?.id ?? c.leads[0]?.contact.id} onChange={state.reload} />
                )}
                {c.status === "WON" && <PostSaleCard caseId={id} editable={editable} postSale={c.postSale} referrals={c.referrals} onChange={state.reload} />}
                {/* El proceso legal y las firmas se trabajan en el paso 7 (Legal) y siguen visibles en la postventa. */}
                {(current === "LEGAL" || current === "POST_SALE") && <LegalCard caseId={id} editable={editable} />}
                {/* En Captación solo se ven el paso y sus herramientas; documentos, interesados y visitas aparecen desde el paso 2. */}
                {current !== "CAPTATION" && (
                  <>
                <DocumentsCard key={docsKey} entityType="case" entityId={id} onChange={state.reload} />

                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Interesados ({c.leads.length})</h2>
                  {c.leads.length === 0 ? <p className="text-sm text-ink/65">Todavía no hay interesados en esta propiedad.</p> : (
                    <ul className="divide-y divide-ink/10">
                      {c.leads.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                          <div><p className="text-sm font-medium text-ink">{l.contact.fullName}</p><p className="text-xs text-ink/65">{l.contact.phone ?? "sin teléfono"} · {fmtDate(l.createdAt)}</p></div>
                          <Badge>{LEAD_STATUS[l.status]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Visitas ({c.visits.length})</h2>
                  {c.visits.length === 0 ? <p className="text-sm text-ink/65">Aún no se agendaron visitas.</p> : (
                    <ul className="divide-y divide-ink/10">
                      {c.visits.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                          <div><p className="text-sm font-medium text-ink">{v.contact.fullName} · {fmtDateTime(v.scheduledAt)}</p>{v.result && <p className="text-xs text-ink/65">{v.result}</p>}</div>
                          <Badge tone={VISIT_TONE[v.status]}>{VISIT_STATUS[v.status]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Expediente</h2>
                  {c.property.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(c.property.images[0].id)} alt="" className="mb-3 aspect-[16/10] w-full rounded-xl object-cover" />
                  )}
                  <dl className="flex flex-col gap-2 text-sm">
                    {[
                      ["Propiedad", <Link key="p" href={`/app/propiedades/${c.property.id}`} className="font-semibold text-link hover:underline">{c.property.code}</Link>],
                      ["Ubicación", [c.property.zone, c.property.city].filter(Boolean).join(", ") || "—"],
                      ["Propietario", c.owner ? `${c.owner.fullName}${c.owner.phone ? ` · ${c.owner.phone}` : ""}` : "—"],
                      ["Cliente", c.client ? `${c.client.fullName}${c.client.phone ? ` · ${c.client.phone}` : ""}` : "—"],
                      ["Agente", c.agent?.fullName ?? "—"],
                      ["Exclusividad", c.isExclusive ? "Exclusiva" : "No exclusiva"],
                      ["Comisión acordada", c.commissionPct ? `${Number(c.commissionPct)} %` : "—"],
                      ["En el portal", c.property.isPublished ? "Publicada" : "No publicada"],
                    ].map(([label, value]) => (
                      <div key={label as string} className="flex justify-between gap-3">
                        <dt className="text-ink/65">{label}</dt>
                        <dd className="text-right font-medium text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
                {c.commission && (
                  <Card>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="font-semibold text-ink">Comisión</h2>
                      <Badge tone={COMMISSION_TONE[c.commission.status]}>{COMMISSION_STATUS[c.commission.status]}</Badge>
                    </div>
                    <dl className="flex flex-col gap-2 text-sm">
                      <div className="flex justify-between gap-3"><dt className="text-ink/65">Comisión de la empresa</dt><dd className="font-medium tabular-nums text-ink">{money(c.commission.companyAmount, c.commission.currency)}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-ink/65">Parte del agente ({Number(c.commission.agentSharePct)} %)</dt><dd className="font-bold tabular-nums text-brand-ink">{money(c.commission.agentAmount, c.commission.currency)}</dd></div>
                    </dl>
                    {c.commission.ruleName && <p className="mt-2 text-xs text-ink/65">Regla aplicada: {c.commission.ruleName}</p>}
                  </Card>
                )}
                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Timeline</h2>
                  {editable && (
                    <form onSubmit={addNote} className="mb-4 flex gap-2">
                      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Agregar una nota…" maxLength={500} aria-label="Nota" />
                      <Button type="submit" variant="ghost">Anotar</Button>
                    </form>
                  )}
                  <Timeline items={c.timeline} />
                </Card>
              </div>
            </div>

            {closing && (
              <Modal title="Cerrar operación" onClose={() => setClosing(false)}>
                <CloseForm c={c} onCancel={() => setClosing(false)} onDone={() => { setClosing(false); setSelected(null); state.reload(); }} />
              </Modal>
            )}
          </>
        );
      }}
    </Loader>
  );
}
