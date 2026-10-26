"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, errorText, useFetch } from "@/lib/api";
import { calculate, DEFAULT_VALUE, fmt, fromPct, PRICE_LABEL, proposalText, VALUE_LABEL, type Cur, type Op } from "@/lib/captation";
import { documentUrl, imageUrl, publicUrl } from "@/lib/images";
import { OPERATION } from "@/lib/labels";
import { useSession } from "./Shell";
import { Button, Card, ErrorNote, Field, Input, Select, Textarea } from "./ui";

export type CaptationCase = {
  id: string; operation: string; price: string; currency: string; isExclusive: boolean; commissionPct: string | null; captationEnds: string | null;
  property: { id: string; title: string; zone: string | null; city: string | null };
  owner: { fullName: string; phone?: string | null } | null; agent: { fullName: string } | null;
};
type PropDetail = {
  id: string; code: string; status: string; isPublished: boolean; type: string; operation: string; price: string; currency: string; zone: string | null;
  builtM2: number | null; areaM2: number | null; bedrooms: number | null; features: string[] | null; description: string | null; latitude: string | number | null; images: Array<{ id: string }>;
};

function Tool({ icon, title, help, tags, open, onToggle, children }: { icon: ReactNode; title: string; help: string; tags: string[]; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-ink/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-deep text-accent-lime">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-link">{title}</span>
          <span className="block text-sm text-ink/70">{help}</span>
        </span>
        <svg aria-hidden viewBox="0 0 20 20" className={`mt-1 h-4 w-4 shrink-0 text-ink/50 transition-transform ${open ? "rotate-180" : ""}`} fill="currentColor"><path d="M5 7h10l-5 6z" /></svg>
      </button>
      {open && (
        <div className="border-t border-ink/10 p-4">
          <p className="mb-3 flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink/70 ring-1 ring-ink/10">{t}</span>)}</p>
          {children}
        </div>
      )}
    </section>
  );
}

const I = (d: ReactNode) => <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
const ICON = {
  calc: I(<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11v6M8 15h2M12 15h2" /></>),
  text: I(<><path d="M5 4h10l4 4v12H5z" /><path d="M14 4v5h5M8 13h8M8 17h5" /></>),
  pdf: I(<><path d="M5 4h10l4 4v12H5z" /><path d="M14 4v5h5" /><path d="m9 15 2 2 4-4" /></>),
  web: I(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>),
};

/** Herramientas del paso 1: calculadora de comisión, propuesta al propietario y acuerdo de trabajo en PDF. */
export function CaptationTools({ c, editable, onChange }: { c: CaptationCase; editable: boolean; onChange: () => void }) {
  const user = useSession();
  const caseOp = c.operation as Op;
  const [op, setOp] = useState<Op>(caseOp);
  const [price, setPrice] = useState(String(Number(c.price)));
  const [currency, setCurrency] = useState<Cur>(c.currency === "BOB" ? "BOB" : "USD");
  const [value, setValue] = useState(String(c.commissionPct != null ? fromPct(caseOp, Number(c.commissionPct)) : DEFAULT_VALUE[caseOp]));
  const [rate, setRate] = useState("6.96");
  const [open, setOpen] = useState<string | null>("calc");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState("");
  const [copied, setCopied] = useState(false);
  const [pdf, setPdf] = useState<{ id: string; name: string; applied: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const rateInfo = useFetch<{ rate: number | null; date: string | null }>("/captation/rate");
  const prop = useFetch<PropDetail>(`/properties/${c.property.id}`);
  const all = useFetch<PropDetail[]>(open === "proposal" ? `/properties?operation=${op}` : null);

  useEffect(() => {
    if (rateInfo.data?.rate) queueMicrotask(() => setRate(String(rateInfo.data!.rate)));
  }, [rateInfo.data]);

  function changeOp(next: Op) {
    setOp(next);
    setMsg(null);
    // Al cambiar de operación se propone la comisión habitual de esa operación.
    setValue(String(next === caseOp && c.commissionPct != null ? fromPct(caseOp, Number(c.commissionPct)) : DEFAULT_VALUE[next]));
    if (next === caseOp) setPrice(String(Number(c.price)));
  }
  const calc = calculate(op, Number(price), currency, Number(value), Number(rate));
  const sameOp = op === caseOp;

  async function saveCommission() {
    setError(null); setMsg(null);
    try {
      await api(`/cases/${c.id}`, { method: "PATCH", json: { commissionPct: calc.pct } });
      setMsg("Comisión guardada en el expediente.");
      onChange();
    } catch (e) {
      setError(errorText(e));
    }
  }

  function makeProposal() {
    const p = prop.data;
    const m2 = (x: PropDetail) => x.builtM2 ?? x.areaM2;
    const similar = (all.data ?? []).filter((x) => p && x.id !== p.id && x.type === p.type && x.currency === currency && x.zone && x.zone === p.zone && m2(x));
    const perM2 = similar.map((x) => Number(x.price) / Number(m2(x)));
    setProposal(proposalText({
      op, price: Number(price), currency, value: Number(value), calc, rate: Number(rate),
      owner: c.owner?.fullName ?? null, agent: c.agent?.fullName ?? user.fullName, company: user.tenant?.name ?? "la inmobiliaria",
      property: { title: c.property.title, zone: c.property.zone, city: c.property.city, builtM2: p?.builtM2 ?? null, areaM2: p?.areaM2 ?? null, bedrooms: p?.bedrooms ?? null, features: p?.features ?? [] },
      comparables: { count: perM2.length, avgPerM2: perM2.length ? perM2.reduce((a, b) => a + b, 0) / perM2.length : null, min: perM2.length ? Math.min(...perM2) : null, max: perM2.length ? Math.max(...perM2) : null },
    }));
    setCopied(false);
  }

  async function makePdf(form: HTMLFormElement) {
    const f = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    setSaving(true); setError(null); setPdf(null);
    try {
      const r = await api<{ documentId: string; name: string; applied: boolean }>(`/cases/${c.id}/agreement`, {
        method: "POST",
        json: {
          ownerName: f.ownerName, ownerDocId: f.ownerDocId, city: f.city, extra: f.extra, operation: op, price: Number(price), currency, value: Number(value),
          isExclusive: f.isExclusive === "on", ...(f.term === "date" ? { endsAt: f.endsAt } : { days: Number(f.term) }), apply: f.apply === "on",
        },
      });
      setPdf({ id: r.documentId, name: r.name, applied: r.applied });
      onChange();
    } catch (e) {
      setError(errorText(e));
    }
    setSaving(false);
  }

  const phone = c.owner?.phone?.replace(/\D/g, "");
  const wa = `https://wa.me/${phone ? (phone.length === 8 ? `591${phone}` : phone) : ""}?text=${encodeURIComponent(proposal)}`;
  const [term, setTerm] = useState("90");

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Herramientas de captación</h2>
          <p className="text-sm text-ink/70">Para la reunión con el propietario. Elige la operación: los cálculos y textos se adaptan.</p>
        </div>
        <div role="radiogroup" aria-label="Operación" className="flex rounded-xl bg-surface p-1 ring-1 ring-ink/10">
          {(Object.keys(OPERATION) as Op[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={op === k} onClick={() => changeOp(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${op === k ? "bg-accent-lime text-on-accent shadow-sm" : "text-ink/75 hover:text-ink"}`}>
              {OPERATION[k]}
            </button>
          ))}
        </div>
      </div>
      {!sameOp && <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning ring-1 ring-warning/30" role="status">Estás simulando {OPERATION[op].toLowerCase()}; el expediente es de {OPERATION[caseOp].toLowerCase()}. Los cálculos no se guardan en el expediente.</p>}

      <div className="flex flex-col gap-3">
        <Tool icon={ICON.calc} title="Calculadora de comisión" help="Calcula tu comisión en USD y Bs para mostrarle al propietario cuánto te corresponde." tags={["Calculadora", "Etapa 1 · Captación"]} open={open === "calc"} onToggle={() => setOpen(open === "calc" ? null : "calc")}>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label={`${PRICE_LABEL[op]}`} className="sm:col-span-2">
              <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                <Input aria-label={PRICE_LABEL[op]} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                <Select aria-label="Moneda" options={{ USD: "USD", BOB: "Bs" }} value={currency} onChange={(e) => setCurrency(e.target.value as Cur)} />
              </div>
            </Field>
            <Field label={VALUE_LABEL[op]}><Input aria-label={VALUE_LABEL[op]} type="number" min={0} max={op === "RENT" ? 12 : 100} step={op === "RENT" ? "0.5" : "0.1"} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
            <Field label="Tipo de cambio (Bs por USD)" hint={rateInfo.data?.rate ? "El último registrado en Finanzas." : "Oficial de referencia."}><Input aria-label="Tipo de cambio" type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          </div>
          {calc.error ? <div className="mt-3"><ErrorNote>{calc.error}</ErrorNote></div> : (
            <dl className="mt-4 grid gap-2 sm:grid-cols-3" aria-live="polite">
              <div className="rounded-xl bg-brand-deep p-3 text-on-brand"><dt className="text-xs text-on-brand/75">Tu comisión en USD</dt><dd className="text-xl font-extrabold tabular-nums">USD {calc.usd.toLocaleString("es-BO")}</dd></div>
              <div className="rounded-xl bg-brand-deep p-3 text-on-brand"><dt className="text-xs text-on-brand/75">Tu comisión en Bs</dt><dd className="text-xl font-extrabold tabular-nums">Bs {calc.bob.toLocaleString("es-BO")}</dd></div>
              <div className="rounded-xl bg-lime-soft p-3 text-ink"><dt className="text-xs text-ink/75">{calc.ownerNetLabel}</dt><dd className="text-xl font-extrabold tabular-nums">{fmt(calc.ownerNet, currency)}</dd></div>
            </dl>
          )}
          {editable && sameOp && !calc.error && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button small variant="accent" onClick={saveCommission}>Guardar como comisión acordada</Button>
              {msg && <span className="text-sm font-medium text-success" role="status">{msg}</span>}
            </div>
          )}
        </Tool>

        <Tool icon={ICON.text} title="Propuesta al propietario" help="Genera un texto claro para presentarle al propietario: por qué ese precio y por qué tu comisión vale la pena." tags={["Texto", "Etapa 1 · Captación"]} open={open === "proposal"} onToggle={() => setOpen(open === "proposal" ? null : "proposal")}>
          {calc.error ? <ErrorNote>Completa la calculadora para armar la propuesta: {calc.error.toLowerCase()}</ErrorNote> : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button small onClick={makeProposal} disabled={!prop.data || (open === "proposal" && all.loading)}>{proposal ? "Volver a generar" : "Generar propuesta"}</Button>
                {proposal && <Button small variant="ghost" onClick={() => navigator.clipboard.writeText(proposal).then(() => setCopied(true)).catch(() => null)}>{copied ? "Copiada" : "Copiar"}</Button>}
                {proposal && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg bg-accent-lime px-3 text-sm font-bold text-on-accent hover:brightness-95">Enviar por WhatsApp</a>}
              </div>
              {proposal && <Textarea aria-label="Propuesta" value={proposal} onChange={(e) => setProposal(e.target.value)} rows={16} className="mt-3 font-[inherit] text-sm leading-relaxed" />}
              {proposal && <p className="mt-1 text-xs text-ink/65">Puedes editar el texto antes de enviarlo. Compara con propiedades parecidas de la misma zona.</p>}
            </>
          )}
        </Tool>

        <Tool icon={ICON.pdf} title="Acuerdo de trabajo" help="Completa los datos y genera un acuerdo en PDF con tu marca. No es un contrato legal vinculante: es un compromiso de palabra puesto en papel." tags={["PDF", "Etapa 1 · Captación"]} open={open === "pdf"} onToggle={() => setOpen(open === "pdf" ? null : "pdf")}>
          {!editable ? <p className="text-sm text-ink/70">Solo el administrador y los agentes generan acuerdos.</p> : calc.error ? <ErrorNote>Completa la calculadora primero: {calc.error.toLowerCase()}</ErrorNote> : (
            <form onSubmit={(e) => { e.preventDefault(); void makePdf(e.currentTarget); }} className="grid gap-3 sm:grid-cols-6">
              <Field label="Propietario" className="sm:col-span-3"><Input name="ownerName" required maxLength={150} defaultValue={c.owner?.fullName ?? ""} /></Field>
              <Field label="Carnet de identidad (opcional)" className="sm:col-span-3"><Input name="ownerDocId" maxLength={40} placeholder="1234567 SC" /></Field>
              <Field label="Ciudad" className="sm:col-span-2"><Input name="city" maxLength={80} defaultValue={c.property.city ?? ""} /></Field>
              <Field label="Vigencia" className="sm:col-span-2">
                <Select name="term" value={term} onChange={(e) => setTerm(e.target.value)} options={{ "30": "30 días", "60": "60 días", "90": "90 días", "180": "180 días", date: "Hasta una fecha" }} />
              </Field>
              {term === "date" ? <Field label="Hasta" className="sm:col-span-2"><Input name="endsAt" type="date" required defaultValue={c.captationEnds?.slice(0, 10) ?? ""} /></Field> : <div className="hidden sm:col-span-2 sm:block" />}
              <p className="text-sm text-ink/80 sm:col-span-6">
                {OPERATION[op]} por <strong>{fmt(Number(price), currency)}</strong>{op === "RENT" ? " al mes" : ""} · comisión <strong>{fmt(calc.commission, currency)}</strong> (tomado de la calculadora).
              </p>
              <Field label="Acuerdos adicionales (opcional)" className="sm:col-span-6"><Textarea name="extra" maxLength={1500} rows={3} placeholder="Horarios de visita, entrega de llaves, gastos de publicidad…" /></Field>
              <label className="flex items-center gap-2 text-sm font-medium text-ink sm:col-span-3"><input type="checkbox" name="isExclusive" defaultChecked={c.isExclusive} className="h-4 w-4 accent-brand-teal" /> Captación exclusiva</label>
              <label className={`flex items-center gap-2 text-sm font-medium sm:col-span-3 ${sameOp ? "text-ink" : "text-ink/50"}`}><input type="checkbox" name="apply" defaultChecked={sameOp} disabled={!sameOp} className="h-4 w-4 accent-brand-teal" /> Guardar comisión, exclusividad y vigencia en el expediente</label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
                <Button type="submit" disabled={saving}>{saving ? "Generando…" : "Generar PDF"}</Button>
                {pdf && (
                  <span className="flex flex-wrap items-center gap-2 text-sm text-success" role="status">
                    Listo: se guardó en los documentos del expediente{pdf.applied ? " y se actualizaron sus condiciones" : ""}.
                    <a href={documentUrl(pdf.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-link underline">Descargar PDF</a>
                  </span>
                )}
              </div>
            </form>
          )}
        </Tool>
        <Tool icon={ICON.web} title="Publicar en el portal" help="Carga las fotos y la descripción, y publica el inmueble en tu portal para empezar a recibir interesados." tags={["Portal", "Etapa 1 · Captación"]} open={open === "web"} onToggle={() => setOpen(open === "web" ? null : "web")}>
          {prop.data ? <PublishPanel p={prop.data} editable={editable} onChange={() => { prop.reload(); onChange(); }} /> : <p className="text-sm text-ink/65">Cargando…</p>}
        </Tool>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Card>
  );
}

/** Publicación en el portal desde la captación: fotos, descripción, revisión y botón de publicar. */
function PublishPanel({ p, editable, onChange }: { p: PropDetail; editable: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desc, setDesc] = useState(p.description ?? "");
  const [copied, setCopied] = useState(false);
  const onOffer = ["AVAILABLE", "RESERVED", "NEGOTIATING"].includes(p.status);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onChange(); } catch (e) { setError(errorText(e)); }
    setBusy(false);
  }
  const upload = (files: FileList | null) => act(async () => {
    for (const file of Array.from(files ?? [])) {
      const form = new FormData();
      form.append("file", file);
      await api(`/properties/${p.id}/images`, { method: "POST", body: form });
    }
  });
  const checks: Array<[boolean, string, string]> = [
    [p.images.length > 0, `${p.images.length} ${p.images.length === 1 ? "foto" : "fotos"}`, "Sin fotos: las propiedades con fotos reciben muchas más visitas"],
    [!!p.description?.trim(), "Descripción lista", "Falta la descripción"],
    [p.latitude != null, "Ubicación marcada en el mapa", "Sin ubicación en el mapa (opcional, se marca en la ficha de la propiedad)"],
    [Number(p.price) > 0, "Precio cargado", "Falta el precio"],
  ];
  const url = publicUrl(p.code);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${p.isPublished ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{p.isPublished ? "Publicada en el portal" : "Todavía no está publicada"}</span>
        {!onOffer && <span className="text-sm text-ink/70">Solo se publican propiedades disponibles, reservadas o en negociación.</span>}
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Revisión antes de publicar">
        {checks.map(([ok, good, bad]) => (
          <li key={good} className="flex items-start gap-2 text-sm">
            <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{ok ? "✓" : "!"}</span>
            <span className={ok ? "text-ink" : "text-ink/80"}>{ok ? good : bad}</span>
          </li>
        ))}
      </ul>
      {p.images.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto" aria-label="Fotos">
          {p.images.slice(0, 6).map((img) => (
            <li key={img.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(img.id)} alt="" className="h-16 w-24 rounded-lg object-cover ring-1 ring-ink/10" />
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <>
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-ink ring-1 ring-ink/20 hover:bg-ink/5">
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-label="Agregar fotos" disabled={busy} onChange={(e) => void upload(e.target.files)} />
            {busy ? "Subiendo…" : "Agregar fotos"}
          </label>
          <Field label="Descripción para el portal">
            <Textarea aria-label="Descripción para el portal" value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={10000} placeholder="Lo que hace especial al inmueble: ambientes, luz, entorno, cercanías…" />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            {desc !== (p.description ?? "") && <Button small variant="ghost" disabled={busy} onClick={() => void act(() => api(`/properties/${p.id}`, { method: "PATCH", json: { description: desc } }))}>Guardar descripción</Button>}
            {p.isPublished ? (
              <>
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-lg bg-accent-lime px-4 text-sm font-bold text-on-accent hover:brightness-95">Ver en el portal</a>
                <Button variant="ghost" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => null)}>{copied ? "Enlace copiado" : "Copiar enlace"}</Button>
                <Button variant="ghost" disabled={busy} onClick={() => void act(() => api(`/properties/${p.id}`, { method: "PATCH", json: { isPublished: false } }))}>Quitar del portal</Button>
              </>
            ) : (
              <Button disabled={busy || !onOffer} onClick={() => void act(() => api(`/properties/${p.id}`, { method: "PATCH", json: { isPublished: true, ...(desc !== (p.description ?? "") ? { description: desc } : {}) } }))}>Publicar en el portal</Button>
            )}
          </div>
        </>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
