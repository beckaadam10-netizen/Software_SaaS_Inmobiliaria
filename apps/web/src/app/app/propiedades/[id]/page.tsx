"use client";

import Link from "next/link";
import { use, useRef, useState } from "react";
import { ContentCard } from "@/components/ContentCard";
import { DocumentsCard } from "@/components/DocumentsCard";
import { MapView } from "@/components/MapView";
import { MatchingContacts } from "@/components/MatchList";
import { PropertyForm } from "@/components/PropertyForm";
import { ShareCard } from "@/components/ShareCard";
import { canEdit, useSession } from "@/components/Shell";
import { Timeline, type TimelineItem } from "@/components/Timeline";
import { Badge, Button, Card, ErrorNote, Loader, Modal, PageHeader, Select } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { CASE_STATUS, fmtDate, money, OPERATION, PROPERTY_STATUS, PROPERTY_TYPE, STAGE } from "@/lib/labels";
import { PROPERTY_TONE as STATUS_TONE } from "@/lib/tones";
import { imageUrl } from "@/lib/images";

type Detail = {
  id: string; code: string; title: string; type: string; operation: string; status: string; isPublished: boolean; price: string; currency: string;
  address: string | null; zone: string | null; city: string | null; areaM2: number | null; builtM2: number | null; bedrooms: number | null;
  bathrooms: number | null; parking: number | null; yearBuilt: number | null; description: string | null; features: string[] | null; viewCount: number;
  ownerId: string | null; agentId: string | null; latitude: number | null; longitude: number | null;
  owner: { id: string; fullName: string; phone: string | null } | null; agent: { fullName: string } | null;
  images: Array<{ id: string }>; priceHistory: Array<{ id: string; price: string; currency: string; createdAt: string }>;
  cases: Array<{ id: string; code: string; status: string; currentStage: string }>; _count: { leads: number; visits: number };
  timeline: TimelineItem[];
};

const Fact = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <dt className="text-xs text-ink/65">{label}</dt>
    <dd className="text-sm font-medium text-ink">{value ?? "—"}</dd>
  </div>
);

export default function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const user = useSession();
  const editable = canEdit(user.role);
  const state = useFetch<Detail>(`/properties/${id}`);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      state.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const patch = (body: object) => act(() => api(`/properties/${id}`, { method: "PATCH", json: body }));
  const upload = (files: FileList | null) =>
    act(async () => {
      for (const file of Array.from(files ?? [])) {
        const form = new FormData();
        form.append("file", file);
        await api(`/properties/${id}/images`, { method: "POST", body: form });
      }
      if (fileRef.current) fileRef.current.value = "";
    });

  return (
    <Loader state={state}>
      {(p) => {
        const onOffer = ["AVAILABLE", "RESERVED", "NEGOTIATING"].includes(p.status);
        const openCase = p.cases.find((c) => c.status === "OPEN");
        return (
          <>
            <Link href="/app/propiedades" className="text-sm font-medium text-link hover:underline">← Propiedades</Link>
            <PageHeader title={p.title} subtitle={`${p.code} · ${PROPERTY_TYPE[p.type]} en ${OPERATION[p.operation].toLowerCase()}`}>
              <Badge tone={STATUS_TONE[p.status]}>{PROPERTY_STATUS[p.status]}</Badge>
              {p.isPublished && <Badge tone="lime">Publicada</Badge>}
              {editable && <Button variant="ghost" onClick={() => setEditing(true)}>Editar</Button>}
            </PageHeader>
            <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="flex flex-col gap-4 xl:col-span-2">
                <Card>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-ink">Fotos ({p.images.length})</h2>
                    {editable && (
                      <>
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
                        <Button small variant="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>Subir fotos</Button>
                      </>
                    )}
                  </div>
                  {p.images.length === 0 ? (
                    <p className="text-sm text-ink/65">Aún no hay fotos. Admite JPG, PNG o WebP de hasta 5 MB.</p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {p.images.map((img) => (
                        <li key={img.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-ink/5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imageUrl(img.id)} alt="" className="h-full w-full object-cover" />
                          {editable && (
                            <button
                              onClick={() => act(() => api(`/properties/${id}/images/${img.id}`, { method: "DELETE" }))}
                              className="absolute right-1.5 top-1.5 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-white hover:bg-black/85"
                            >
                              Quitar
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Datos</h2>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                    <Fact label="Precio" value={money(p.price, p.currency)} />
                    <Fact label="Zona" value={[p.zone, p.city].filter(Boolean).join(", ") || null} />
                    <Fact label="Terreno" value={p.areaM2 != null ? `${p.areaM2} m²` : null} />
                    <Fact label="Construcción" value={p.builtM2 != null ? `${p.builtM2} m²` : null} />
                    <Fact label="Habitaciones" value={p.bedrooms} />
                    <Fact label="Baños" value={p.bathrooms} />
                    <Fact label="Parqueos" value={p.parking} />
                    <Fact label="Año" value={p.yearBuilt} />
                    <Fact label="Propietario" value={p.owner ? `${p.owner.fullName}${p.owner.phone ? ` · ${p.owner.phone}` : ""}` : null} />
                    <Fact label="Agente" value={p.agent?.fullName} />
                    <Fact label="Dirección (interna)" value={p.address} />
                    <Fact label="Precio por m²" value={p.builtM2 ? money(Number(p.price) / p.builtM2, p.currency) : null} />
                  </dl>
                  {p.features && p.features.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">{p.features.map((f) => <Badge key={f} tone="teal">{f}</Badge>)}</div>
                  )}
                  {p.description && <p className="mt-4 whitespace-pre-line text-sm text-ink/85">{p.description}</p>}
                </Card>

                {onOffer && (
                  <Card>
                    <h2 className="mb-3 font-semibold text-ink">Clientes compatibles</h2>
                    <MatchingContacts propertyId={id} property={p} />
                  </Card>
                )}
                {editable && <ContentCard propertyId={id} />}
                <DocumentsCard entityType="property" entityId={id} onChange={state.reload} />
                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Historial</h2>
                  <Timeline items={p.timeline} />
                </Card>
              </div>

              <div className="flex flex-col gap-4">
                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Publicación</h2>
                  <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
                    {[["Vistas", p.viewCount], ["Interesados", p._count.leads], ["Visitas", p._count.visits]].map(([l, n]) => (
                      <div key={l} className="rounded-xl bg-surface py-2">
                        <dd className="text-xl font-bold tabular-nums text-brand-ink">{n}</dd>
                        <dt className="text-xs text-ink/70">{l}</dt>
                      </div>
                    ))}
                  </dl>
                  {p.isPublished && (
                    <a href={`/p/${p.code}`} target="_blank" rel="noreferrer" className="mb-3 block truncate text-sm font-semibold text-link hover:underline">
                      Ver en el portal: /p/{p.code}
                    </a>
                  )}
                  {editable && onOffer && (
                    <Button variant={p.isPublished ? "ghost" : "accent"} className="w-full" disabled={busy} onClick={() => patch({ isPublished: !p.isPublished })}>
                      {p.isPublished ? "Retirar del portal" : "Publicar en el portal"}
                    </Button>
                  )}
                  {!onOffer && <p className="text-sm text-ink/65">Una propiedad {PROPERTY_STATUS[p.status].toLowerCase()} no se publica.</p>}
                  {editable && (
                    <label className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-ink">
                      Estado
                      <Select options={PROPERTY_STATUS} value={p.status} disabled={busy} onChange={(e) => patch({ status: e.target.value })} />
                    </label>
                  )}
                </Card>

                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Ubicación</h2>
                  {p.latitude != null && p.longitude != null
                    ? <MapView height={220} label={`Ubicación de ${p.code}`} points={[{ id: p.id, lat: p.latitude, lng: p.longitude, label: p.code, detail: [p.address, p.zone].filter(Boolean).join(" · ") }]} />
                    : <p className="text-sm text-ink/65">Sin ubicación en el mapa.{editable ? " Márcala con Editar." : ""}</p>}
                </Card>
                <ShareCard key={String(p.isPublished)} property={p} editable={editable} />

                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Expediente comercial</h2>
                  {p.cases.length === 0 && <p className="mb-3 text-sm text-ink/65">Esta propiedad no tiene expediente.</p>}
                  <ul className="flex flex-col gap-2">
                    {p.cases.map((c) => (
                      <li key={c.id}>
                        <Link href={`/app/gestion/${c.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 hover:ring-1 hover:ring-brand-teal">
                          <span className="text-sm font-semibold text-ink">{c.code}</span>
                          <span className="text-xs text-ink/75">{c.status === "OPEN" ? STAGE[c.currentStage] : CASE_STATUS[c.status]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {editable && !openCase && onOffer && (
                    <Button variant="ghost" className="mt-3 w-full" disabled={busy} onClick={() => act(() => api("/cases", { method: "POST", json: { propertyId: id } }))}>
                      Abrir expediente
                    </Button>
                  )}
                </Card>

                <Card>
                  <h2 className="mb-3 font-semibold text-ink">Historial de precios</h2>
                  <ul className="divide-y divide-ink/10">
                    {p.priceHistory.map((h) => (
                      <li key={h.id} className="flex justify-between py-1.5 text-sm">
                        <span className="font-medium text-ink">{money(h.price, h.currency)}</span>
                        <span className="text-ink/65">{fmtDate(h.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>

            {editing && (
              <Modal title="Editar propiedad" wide onClose={() => setEditing(false)}>
                <PropertyForm initial={p} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload(); }} />
              </Modal>
            )}
          </>
        );
      }}
    </Loader>
  );
}
