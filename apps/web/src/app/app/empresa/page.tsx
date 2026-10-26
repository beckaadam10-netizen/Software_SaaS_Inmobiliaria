"use client";

import { useRef, useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, formData, Input, Loader, PageHeader, Textarea } from "@/components/ui";
import { api, errorText, useFetch, type Brand } from "@/lib/api";

type Domain = { id: string; domain: string; verified: boolean; record: { type: string; name: string; value: string } };
type Company = Brand & { legalName: string | null; taxId: string | null; wantsHideBrand: boolean; can: { whiteLabel: boolean; customDomain: boolean }; domains: Domain[] };

const DEFAULTS = { primaryColor: "#0b3c49", buttonColor: "#0f766e" };

function CompanyForm({ company, onSaved }: { company: Company; onSaved: (c: Company) => void }) {
  const [colors, setColors] = useState({ primaryColor: company.primaryColor ?? DEFAULTS.primaryColor, buttonColor: company.buttonColor ?? DEFAULTS.buttonColor });
  const [hide, setHide] = useState(company.wantsHideBrand);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function run(fn: () => Promise<Company>) {
    setSaving(true); setError(null); setSaved(false);
    try {
      onSaved(await fn());
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    }
    setSaving(false);
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = formData(e.currentTarget);
    // Los colores iguales a los de Soft_Inmo se guardan vacíos: así la empresa sigue el tema original.
    const color = (k: keyof typeof DEFAULTS) => (colors[k].toLowerCase() === DEFAULTS[k] ? "" : colors[k]);
    void run(() => api<Company>("/company", { method: "PATCH", json: { ...data, primaryColor: color("primaryColor"), buttonColor: color("buttonColor"), hideBrand: hide } }));
  }
  function upload(f?: File) {
    if (!f) return;
    const body = new FormData();
    body.append("file", f);
    void run(() => api<Company>("/company/logo", { method: "POST", body }));
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 font-semibold text-ink">Datos de la empresa</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre comercial" className="sm:col-span-2"><Input name="name" required defaultValue={company.name} /></Field>
          <Field label="Teléfono"><Input name="phone" type="tel" defaultValue={company.phone ?? ""} /></Field>
          <Field label="WhatsApp" hint="Con código de país: 59170000000"><Input name="whatsapp" type="tel" defaultValue={company.whatsapp ?? ""} /></Field>
          <Field label="Email" className="sm:col-span-2"><Input name="email" type="email" defaultValue={company.email ?? ""} /></Field>
          <Field label="Dirección" className="sm:col-span-2"><Input name="address" defaultValue={company.address ?? ""} /></Field>
          <Field label="Horario de atención" className="sm:col-span-2"><Input name="schedule" placeholder="Lunes a viernes de 9:00 a 18:00" defaultValue={company.schedule ?? ""} /></Field>
          <Field label="Descripción" hint="Se muestra en la portada de tu portal." className="sm:col-span-2"><Textarea name="about" maxLength={2000} defaultValue={company.about ?? ""} /></Field>
        </div>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="mb-1 font-semibold text-ink">Marca</h2>
          <p className="mb-4 text-sm text-ink/70">Tu logo y tus colores se aplican al portal público, al panel y al portal del propietario.</p>
          <div className="flex flex-wrap items-center gap-4">
            {company.logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={company.logo} alt="Logo actual" className="h-16 w-auto max-w-[12rem] rounded-lg object-contain ring-1 ring-ink/15" />
              : <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed border-ink/25 text-xs text-ink/60">Sin logo</div>}
            <div className="flex gap-2">
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Archivo del logo" onChange={(e) => upload(e.target.files?.[0])} />
              <Button variant="ghost" onClick={() => file.current?.click()} disabled={saving}>{company.logo ? "Cambiar logo" : "Subir logo"}</Button>
              {company.logo && <Button variant="ghost" disabled={saving} onClick={() => run(() => api<Company>("/company/logo", { method: "DELETE" }))}>Quitar</Button>}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink/65">PNG, JPG o WebP de hasta 1 MB.</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {([["primaryColor", "Color principal", "Menú y encabezados"], ["buttonColor", "Color de botones", "Botones y enlaces"]] as const).map(([key, label, hint]) => (
              <Field key={key} label={label} hint={hint}>
                <span className="flex items-center gap-2">
                  <input type="color" aria-label={label} value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-ink/25 bg-white p-1" />
                  <Input value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} pattern="#[0-9a-fA-F]{6}" aria-label={`${label} en hexadecimal`} />
                </span>
              </Field>
            ))}
          </div>
          <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-ink/15" aria-label="Vista previa">
            <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-on-brand" style={{ background: colors.primaryColor }}>
              <span>{company.name}</span><span className="rounded-md border border-on-brand/40 px-2 py-1 text-xs font-medium">Ingresar</span>
            </div>
            <div className="flex items-center gap-3 bg-surface px-4 py-3">
              <span className="rounded-lg px-3 py-1.5 text-sm font-semibold text-on-brand" style={{ background: colors.buttonColor }}>Me interesa</span>
              <span className="text-sm font-semibold" style={{ color: colors.buttonColor }}>Ver propiedad</span>
            </div>
          </div>
          <button type="button" onClick={() => setColors(DEFAULTS)} className="mt-2 text-sm font-medium text-link hover:underline">Volver a los colores originales</button>

          <label className={`mt-5 flex items-start gap-3 text-sm ${company.can.whiteLabel ? "text-ink" : "text-ink/60"}`}>
            <input type="checkbox" checked={hide && company.can.whiteLabel} disabled={!company.can.whiteLabel} onChange={(e) => setHide(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-teal" />
            <span><span className="font-semibold">Quitar la marca Soft_Inmo</span><span className="block text-ink/70">{company.can.whiteLabel ? "Oculta “Funciona con Soft_Inmo” y muestra solo tu marca." : "Disponible desde el plan Empresa."}</span></span>
          </label>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold text-ink">Redes y datos legales</h2>
          <p className="mb-4 text-sm text-ink/70">La razón social y el NIT se usan en tus facturas; no se publican.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sitio web"><Input name="website" type="url" placeholder="https://" defaultValue={company.website ?? ""} /></Field>
            <Field label="Facebook"><Input name="facebook" type="url" placeholder="https://" defaultValue={company.facebook ?? ""} /></Field>
            <Field label="Instagram"><Input name="instagram" type="url" placeholder="https://" defaultValue={company.instagram ?? ""} /></Field>
            <Field label="TikTok"><Input name="tiktok" type="url" placeholder="https://" defaultValue={company.tiktok ?? ""} /></Field>
            <Field label="Razón social"><Input name="legalName" defaultValue={company.legalName ?? ""} /></Field>
            <Field label="NIT"><Input name="taxId" defaultValue={company.taxId ?? ""} /></Field>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 lg:col-span-2">
        <div className="mr-auto"><ErrorNote>{error}</ErrorNote></div>
        {saved && <span role="status" className="text-sm font-semibold text-success">Cambios guardados</span>}
        <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
      </div>
    </form>
  );
}

function Domains({ company, onChange }: { company: Company; onChange: (c: Company) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<Company>) {
    setBusy(true); setError(null);
    try {
      onChange(await fn());
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    void run(() => api<Company>("/company/domains", { method: "POST", json: formData(form) }).then((c) => { form.reset(); return c; }));
  }
  return (
    <Card className="mt-6">
      <h2 className="mb-1 font-semibold text-ink">Dominio propio</h2>
      <p className="mb-4 text-sm text-ink/70">Usa tu dirección (www.tuinmobiliaria.com) en lugar del subdominio de Soft_Inmo.</p>
      {!company.can.customDomain ? <p className="text-sm text-ink/70">Disponible desde el plan Empresa.</p> : (
        <>
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input name="domain" required placeholder="www.tuinmobiliaria.com" aria-label="Dominio" className="max-w-sm" />
            <Button type="submit" disabled={busy}>Agregar dominio</Button>
          </form>
          <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
          <ul className="mt-2 flex flex-col gap-3">
            {company.domains.map((d) => (
              <li key={d.id} className="rounded-xl p-4 ring-1 ring-ink/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{d.domain} <Badge tone={d.verified ? "green" : "amber"}>{d.verified ? "Verificado" : "Pendiente de verificar"}</Badge></p>
                  <div className="flex gap-1.5">
                    {!d.verified && <Button small disabled={busy} onClick={() => run(() => api<Company>(`/company/domains/${d.id}/verify`, { method: "POST" }))}>Verificar</Button>}
                    <Button small variant="danger" disabled={busy} onClick={() => run(() => api<Company>(`/company/domains/${d.id}`, { method: "DELETE" }))}>Quitar</Button>
                  </div>
                </div>
                {!d.verified && (
                  <div className="mt-3 text-sm text-ink/80">
                    <p>1. En el panel donde compraste el dominio, crea este registro DNS para demostrar que es tuyo:</p>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-lg bg-surface p-3 font-mono text-xs sm:grid-cols-[4rem_1fr]">
                      <dt className="text-ink/65">Tipo</dt><dd>{d.record.type}</dd>
                      <dt className="text-ink/65">Nombre</dt><dd className="break-all">{d.record.name}</dd>
                      <dt className="text-ink/65">Valor</dt><dd className="break-all">{d.record.value}</dd>
                    </dl>
                    <p className="mt-2">2. Apunta el dominio al servidor de Soft_Inmo (te damos la dirección al contratar el hosting) y pulsa Verificar. Los cambios de DNS pueden tardar hasta 24 horas.</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export default function CompanyPage() {
  const state = useFetch<Company>("/company");
  const [fresh, setFresh] = useState<Company | null>(null);
  return (
    <>
      <PageHeader title="Mi empresa" subtitle="Datos, marca y dominio de tu inmobiliaria." />
      <Loader state={state}>
        {(loaded) => {
          const company = fresh ?? loaded;
          return (
            <>
              <CompanyForm company={company} onSaved={setFresh} />
              <Domains company={company} onChange={setFresh} />
              <p className="mt-4 text-xs text-ink/65">Los cambios de marca se ven en el menú al recargar la página.</p>
            </>
          );
        }}
      </Loader>
    </>
  );
}
