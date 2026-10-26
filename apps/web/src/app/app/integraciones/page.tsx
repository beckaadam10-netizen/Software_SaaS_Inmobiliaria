"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, ErrorNote, Field, formData, Input, Loader, PageHeader } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDateTime, WEBHOOK_EVENT } from "@/lib/labels";

type Key = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type Delivery = { event: string; ok: boolean; status: number | null; error: string | null; createdAt: string };
type Hook = { id: string; url: string; events: string[]; isActive: boolean; deliveries: Delivery[] };
type Data = { keys: Key[]; webhooks: Hook[]; events: string[] };

/** Muestra una sola vez un secreto recién creado. */
function Secret({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="mb-4 rounded-xl bg-warning-soft p-4 ring-1 ring-warning/40">
      <p className="text-sm font-semibold text-warning">{label}</p>
      <p className="mt-1 text-sm text-warning">Cópiala ahora: por seguridad no se vuelve a mostrar.</p>
      <code className="mt-2 block break-all rounded-lg bg-white p-3 text-sm text-ink ring-1 ring-warning/40">{value}</code>
      <div className="mt-3 flex gap-2">
        <Button small onClick={async () => { await navigator.clipboard?.writeText(value).catch(() => null); setCopied(true); }}>{copied ? "Copiada" : "Copiar"}</Button>
        <Button small variant="ghost" onClick={onClose}>Ya la guardé</Button>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const state = useFetch<Data>("/integrations");
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [events, setEvents] = useState<string[]>(["lead.created"]);
  const [tested, setTested] = useState<Record<string, string>>({});

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  function createKey(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    void act(async () => {
      const k = await api<{ key: string }>("/integrations/keys", { method: "POST", json: formData(form) });
      setSecret({ label: "Tu nueva clave de API", value: k.key });
      form.reset();
    });
  }
  function createHook(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    void act(async () => {
      const h = await api<{ secret: string }>("/integrations/webhooks", { method: "POST", json: { ...formData(form), events } });
      setSecret({ label: "Secreto del webhook (para verificar la firma)", value: h.secret });
      form.reset();
    });
  }
  async function test(id: string) {
    const r = await api<{ ok: boolean; status: number | null; error: string | null }>(`/integrations/webhooks/${id}/test`, { method: "POST" }).catch((e) => ({ ok: false, status: null, error: errorText(e) }));
    setTested((t) => ({ ...t, [id]: r.ok ? `Entregado (respuesta ${r.status})` : `No se entregó: ${r.error}` }));
    state.reload();
  }

  return (
    <>
      <PageHeader title="Integraciones" subtitle="Conecta Soft_Inmo con tu sitio web y tus otros sistemas." />
      {secret && <Secret {...secret} onClose={() => setSecret(null)} />}
      <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>
      <Loader state={state}>
        {(d) => (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <h2 className="font-semibold text-ink">Claves de API</h2>
              <p className="mb-4 text-sm text-ink/70">Con una clave, tu sitio web puede leer tus propiedades publicadas y registrar interesados.</p>
              <form onSubmit={createKey} className="flex flex-wrap items-end gap-2">
                <Field label="Nombre de la clave" className="min-w-0 flex-1"><Input name="name" required maxLength={80} placeholder="Sitio web" /></Field>
                <Button type="submit">Crear clave</Button>
              </form>
              <ul className="mt-4 divide-y divide-ink/10">
                {d.keys.length === 0 && <li className="py-3 text-sm text-ink/65">Aún no tienes claves.</li>}
                {d.keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{k.name} <code className="font-normal text-ink/65">{k.prefix}…</code></p>
                      <p className="text-xs text-ink/65">{k.lastUsedAt ? `Último uso: ${fmtDateTime(k.lastUsedAt)}` : "Sin uso todavía"}</p>
                    </div>
                    <Button small variant="danger" onClick={() => act(() => api(`/integrations/keys/${k.id}`, { method: "DELETE" }))}>Revocar</Button>
                  </li>
                ))}
              </ul>
              <h3 className="mt-5 text-sm font-semibold text-ink">Cómo se usa</h3>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-brand-deep p-3 text-xs leading-relaxed text-on-brand">{`GET  /api/v1/properties
GET  /api/v1/properties/DEM-0001
POST /api/v1/leads
     { "fullName": "...", "phone": "...", "propertyCode": "DEM-0001" }

Cabecera en cada llamada:
Authorization: Bearer si_live_...`}</pre>
              <p className="mt-2 text-xs text-ink/65">Límite: 120 llamadas por minuto por clave.</p>
            </Card>

            <Card>
              <h2 className="font-semibold text-ink">Webhooks</h2>
              <p className="mb-4 text-sm text-ink/70">Soft_Inmo avisa a tu sistema en el momento en que algo ocurre. Cada aviso va firmado.</p>
              <form onSubmit={createHook} className="flex flex-col gap-3">
                <Field label="Dirección que recibe los avisos"><Input name="url" type="url" required placeholder="https://tusistema.com/avisos" /></Field>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-medium text-ink">Eventos</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {d.events.map((ev) => (
                      <label key={ev} className="flex items-center gap-2 text-sm text-ink">
                        <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} className="h-4 w-4 accent-brand-teal" />
                        {WEBHOOK_EVENT[ev] ?? ev}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div><Button type="submit">Crear webhook</Button></div>
              </form>
              <ul className="mt-4 flex flex-col gap-3">
                {d.webhooks.length === 0 && <li className="text-sm text-ink/65">Aún no tienes webhooks.</li>}
                {d.webhooks.map((h) => (
                  <li key={h.id} className="rounded-xl p-3 ring-1 ring-ink/10">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 break-all text-sm font-semibold text-ink">{h.url}</p>
                      <Badge tone={h.isActive ? "green" : "neutral"}>{h.isActive ? "Activo" : "En pausa"}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink/65">{h.events.map((e) => WEBHOOK_EVENT[e] ?? e).join(" · ")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button small variant="ghost" onClick={() => test(h.id)}>Enviar prueba</Button>
                      <Button small variant="ghost" onClick={() => act(() => api(`/integrations/webhooks/${h.id}`, { method: "PATCH", json: { isActive: !h.isActive } }))}>{h.isActive ? "Pausar" : "Reanudar"}</Button>
                      <Button small variant="danger" onClick={() => act(() => api(`/integrations/webhooks/${h.id}`, { method: "DELETE" }))}>Eliminar</Button>
                    </div>
                    {tested[h.id] && <p role="status" className="mt-2 text-sm text-ink">{tested[h.id]}</p>}
                    {h.deliveries.length > 0 && (
                      <ul className="mt-2 border-t border-ink/10 pt-2 text-xs text-ink/75">
                        {h.deliveries.map((x, i) => (
                          <li key={i} className="flex justify-between gap-2 py-0.5">
                            <span>{WEBHOOK_EVENT[x.event] ?? x.event} · {fmtDateTime(x.createdAt)}</span>
                            <span className={x.ok ? "font-semibold text-success" : "font-semibold text-danger"}>{x.ok ? "Entregado" : (x.error ?? "Falló")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink/65">Verifica cada aviso: la cabecera <code>x-softinmo-signature</code> es <code>sha256=</code> más el HMAC-SHA256 del cuerpo con el secreto del webhook.</p>
            </Card>
          </div>
        )}
      </Loader>
    </>
  );
}
