"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSession } from "@/components/Shell";
import { Badge, Button, Card, Empty, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { CAMPAIGN_STATUS, CHANNEL, fmtDate, LEAD_SOURCE, money, toLocalInput, TRAFFIC } from "@/lib/labels";
import { CAMPAIGN_TONE } from "@/lib/tones";

type Overview = {
  leadsBySource: Record<string, number>; viewsBySource: Record<string, number>; activePublications: number; favorites: number;
  topProperties: Array<{ id: string; code: string; title: string; viewCount: number; _count: { leads: number; favorites: number } }>;
};
type Campaign = { id: string; name: string; channel: string; budget: string | null; currency: string; startsAt: string | null; endsAt: string | null; status: string; notes: string | null };
type Template = { id: string; name: string; body: string };

function Breakdown({ title, data, labels, empty }: { title: string; data: Record<string, number>; labels: Record<string, string>; empty: string }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((s, [, n]) => s + n, 0);
  return (
    <Card>
      <h2 className="font-semibold text-ink">{title}</h2>
      <p className="mb-3 text-xs text-ink/65">Últimos 30 días · total {total}</p>
      {rows.length === 0 ? <p className="text-sm text-ink/65">{empty}</p> : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-ink/10">
            {rows.map(([k, n]) => (
              <tr key={k}>
                <th scope="row" className="py-1.5 text-left font-normal text-ink/80">{labels[k] ?? k}</th>
                <td className="py-1.5 text-right font-semibold tabular-nums text-ink">{n}</td>
                <td className="w-14 py-1.5 text-right tabular-nums text-ink/65">{Math.round((n / total) * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function CampaignForm({ initial, onDone, onCancel }: { initial?: Campaign; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const date = (d?: string | null) => (d ? toLocalInput(d).slice(0, 10) : "");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(initial ? `/campaigns/${initial.id}` : "/campaigns", { method: initial ? "PATCH" : "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre" className="sm:col-span-2"><Input name="name" required defaultValue={initial?.name} placeholder="Feria inmobiliaria de octubre" /></Field>
      <Field label="Canal"><Select name="channel" options={CHANNEL} defaultValue={initial?.channel ?? "FACEBOOK"} /></Field>
      <Field label="Estado"><Select name="status" options={CAMPAIGN_STATUS} defaultValue={initial?.status ?? "PLANNED"} /></Field>
      <Field label="Presupuesto"><Input name="budget" type="number" min={0} step="0.01" defaultValue={initial?.budget ? Number(initial.budget) : ""} /></Field>
      <Field label="Moneda"><Select name="currency" options={{ BOB: "Bolivianos (Bs)", USD: "Dólares (USD)" }} defaultValue={initial?.currency ?? "BOB"} /></Field>
      <Field label="Inicio"><Input name="startsAt" type="date" defaultValue={date(initial?.startsAt)} /></Field>
      <Field label="Fin"><Input name="endsAt" type="date" defaultValue={date(initial?.endsAt)} /></Field>
      <Field label="Notas" className="sm:col-span-2"><Textarea name="notes" defaultValue={initial?.notes ?? ""} /></Field>
      <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={onCancel} saving={saving} /></div>
    </form>
  );
}

function TemplateForm({ initial, onDone, onCancel }: { initial?: Template; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(initial ? `/whatsapp/templates/${initial.id}` : "/whatsapp/templates", { method: initial ? "PATCH" : "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Nombre"><Input name="name" required maxLength={80} defaultValue={initial?.name} /></Field>
      <Field label="Mensaje" hint="Variables: {cliente} {agente} {empresa} {propiedad} {precio} {enlace} {fecha}">
        <Textarea name="body" rows={6} required maxLength={1500} defaultValue={initial?.body} />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <FormActions onCancel={onCancel} saving={saving} />
    </form>
  );
}

export default function MarketingPage() {
  const user = useSession();
  const admin = user.role === "ADMIN";
  const overview = useFetch<Overview>("/marketing/overview");
  const campaigns = useFetch<Campaign[]>("/campaigns");
  const templates = useFetch<Template[]>("/whatsapp/templates");
  const [campaign, setCampaign] = useState<{ item?: Campaign } | null>(null);
  const [template, setTemplate] = useState<{ item?: Template } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function removeTemplate(id: string) {
    await api(`/whatsapp/templates/${id}`, { method: "DELETE" }).catch(() => null);
    setRemoving(null);
    templates.reload();
  }

  return (
    <>
      <PageHeader title="Marketing" subtitle="De dónde llegan las vistas y los interesados, campañas y plantillas de mensaje." />
      <Loader state={overview}>
        {(o) => (
          <div className="mb-6 flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Breakdown title="Vistas del portal por fuente" data={o.viewsBySource} labels={TRAFFIC} empty="Aún no hay vistas registradas." />
              <Breakdown title="Leads por fuente" data={o.leadsBySource} labels={LEAD_SOURCE} empty="Aún no hay leads en este periodo." />
            </div>
            <Card>
              <h2 className="font-semibold text-ink">Propiedades publicadas más vistas</h2>
              <p className="mb-3 text-xs text-ink/65">{o.activePublications} publicaciones activas en redes y portales · {o.favorites} veces guardadas en favoritos</p>
              {o.topProperties.length === 0 ? <p className="text-sm text-ink/65">No hay propiedades publicadas.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                      <tr><th className="py-2 font-semibold">Propiedad</th><th className="py-2 text-right font-semibold">Vistas</th><th className="py-2 text-right font-semibold">Interesados</th><th className="py-2 text-right font-semibold">Favoritos</th></tr>
                    </thead>
                    <tbody className="divide-y divide-ink/10">
                      {o.topProperties.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2"><Link href={`/app/propiedades/${p.id}`} className="font-semibold text-link hover:underline">{p.code}</Link> <span className="text-ink/85">{p.title}</span></td>
                          <td className="py-2 text-right tabular-nums text-ink">{p.viewCount}</td>
                          <td className="py-2 text-right tabular-nums text-ink">{p._count.leads}</td>
                          <td className="py-2 text-right tabular-nums text-ink">{p._count.favorites}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </Loader>

      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-ink">Campañas</h2>
        {admin && <Button small onClick={() => setCampaign({})}>Nueva campaña</Button>}
      </div>
      <Loader state={campaigns}>
        {(list) =>
          list.length === 0 ? <Empty title="Aún no hay campañas">Registra tus campañas para llevar el presupuesto y las fechas de cada una.</Empty> : (
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
                  <tr>{["Campaña", "Canal", "Presupuesto", "Fechas", "Estado", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3"><p className="font-semibold text-ink">{c.name}</p>{c.notes && <p className="text-xs text-ink/65">{c.notes}</p>}</td>
                      <td className="px-4 py-3 text-ink/85">{CHANNEL[c.channel]}</td>
                      <td className="px-4 py-3 tabular-nums text-ink/85">{c.budget ? money(c.budget, c.currency) : "—"}</td>
                      <td className="px-4 py-3 text-ink/85">{c.startsAt ? fmtDate(c.startsAt) : "—"}{c.endsAt ? ` a ${fmtDate(c.endsAt)}` : ""}</td>
                      <td className="px-4 py-3"><Badge tone={CAMPAIGN_TONE[c.status]}>{CAMPAIGN_STATUS[c.status]}</Badge></td>
                      <td className="px-4 py-3 text-right">{admin && <Button small variant="ghost" onClick={() => setCampaign({ item: c })}>Editar</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Loader>

      <div className="mb-3 mt-8 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-ink">Plantillas de WhatsApp</h2>
          <p className="text-sm text-ink/70">Mensajes listos para usar desde leads, visitas y contactos.</p>
        </div>
        {admin && <Button small onClick={() => setTemplate({})}>Nueva plantilla</Button>}
      </div>
      <Loader state={templates}>
        {(list) => (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((t) => (
              <li key={t.id}>
                <Card className="flex h-full flex-col">
                  <h3 className="font-semibold text-ink">{t.name}</h3>
                  <p className="mt-1 flex-1 whitespace-pre-line text-sm text-ink/80">{t.body}</p>
                  {admin && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <Button small variant="ghost" onClick={() => setTemplate({ item: t })}>Editar</Button>
                      {removing === t.id ? (
                        <span className="flex items-center gap-1.5 text-xs text-ink/80">¿Eliminar?
                          <Button small variant="danger" onClick={() => removeTemplate(t.id)}>Sí</Button>
                          <Button small variant="ghost" onClick={() => setRemoving(null)}>No</Button>
                        </span>
                      ) : <Button small variant="ghost" onClick={() => setRemoving(t.id)}>Eliminar</Button>}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Loader>

      {campaign && (
        <Modal title={campaign.item ? "Editar campaña" : "Nueva campaña"} onClose={() => setCampaign(null)}>
          <CampaignForm initial={campaign.item} onCancel={() => setCampaign(null)} onDone={() => { setCampaign(null); campaigns.reload(); }} />
        </Modal>
      )}
      {template && (
        <Modal title={template.item ? "Editar plantilla" : "Nueva plantilla"} onClose={() => setTemplate(null)}>
          <TemplateForm initial={template.item} onCancel={() => setTemplate(null)} onDone={() => { setTemplate(null); templates.reload(); }} />
        </Modal>
      )}
    </>
  );
}
