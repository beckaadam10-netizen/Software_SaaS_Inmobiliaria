"use client";

import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorText, useFetch } from "@/lib/api";
import { publicUrl } from "@/lib/images";
import { CHANNEL, fmtDate, money, OPERATION, TRAFFIC } from "@/lib/labels";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Loader, Modal, Select } from "./ui";

type Stats = { views: number; favorites: number; leads: number; visits: number; qrScans: number; sources: Record<string, number>; daily: Array<{ day: string; views: number }> };
type Publication = { id: string; channel: string; url: string | null; notes: string | null; publishedAt: string; isActive: boolean };
type Prop = { id: string; code: string; title: string; operation: string; price: unknown; currency: string; zone: string | null; city: string | null; bedrooms: number | null; isPublished: boolean };

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button small variant="ghost" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => null)}>
      {done ? "Copiado" : label}
    </Button>
  );
}

/** Difusión de una propiedad: enlace, código QR, texto para redes, estadísticas reales y publicaciones. */
export function ShareCard({ property: p, editable }: { property: Prop; editable: boolean }) {
  const stats = useFetch<Stats>(`/properties/${p.id}/stats`);
  const pubs = useFetch<Publication[]>(`/properties/${p.id}/publications`);
  const [qr, setQr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = publicUrl(p.code);
  const qrLink = publicUrl(p.code, "qr");
  const post = [
    `${p.title}`,
    `${OPERATION[p.operation]} · ${money(p.price, p.currency)}`,
    [p.zone, p.city].filter(Boolean).join(", "),
    p.bedrooms ? `${p.bedrooms} habitaciones` : "",
    `Más fotos y detalles: ${publicUrl(p.code, "instagram")}`,
  ].filter(Boolean).join("\n");

  useEffect(() => {
    QRCode.toDataURL(qrLink, { margin: 1, width: 320, color: { dark: "#0b3c49", light: "#ffffff" } }).then(setQr).catch(() => setQr(null));
  }, [qrLink]);

  async function addPublication(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/properties/${p.id}/publications`, { method: "POST", json: formData(e.currentTarget) });
      setAdding(false);
      pubs.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function toggle(pub: Publication) {
    await api(`/publications/${pub.id}`, { method: "PATCH", json: { isActive: !pub.isActive } }).catch(() => null);
    pubs.reload();
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-ink">Difusión</h2>
      {!p.isPublished ? <p className="text-sm text-ink/65">Publica la propiedad en el portal para obtener su enlace y su código QR.</p> : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`Código QR de ${p.code}`} className="h-28 w-28 shrink-0 rounded-lg ring-1 ring-ink/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-all text-xs text-ink/75">{link}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Copy text={link} label="Copiar enlace" />
                <Copy text={post} label="Copiar texto" />
                {qr && <a href={qr} download={`qr-${p.code}.png`} className="inline-flex h-8 items-center rounded-lg border border-ink/20 bg-white px-3 text-sm font-semibold text-ink hover:bg-ink/5">Descargar QR</a>}
              </div>
              <p className="mt-2 text-xs text-ink/65">Imprime el QR en letreros y volantes: cada escaneo se cuenta aparte.</p>
            </div>
          </div>

          <Loader state={stats}>
            {(s) => (
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-ink">De dónde llegan las vistas</h3>
                {s.views === 0 ? <p className="text-sm text-ink/65">Todavía no hay vistas registradas.</p> : (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {Object.entries(s.sources).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                      <div key={k} className="flex justify-between gap-2"><dt className="text-ink/70">{TRAFFIC[k] ?? k}</dt><dd className="font-semibold tabular-nums text-ink">{n}</dd></div>
                    ))}
                    <div className="flex justify-between gap-2"><dt className="text-ink/70">Guardada en favoritos</dt><dd className="font-semibold tabular-nums text-ink">{s.favorites}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink/70">Últimos 14 días</dt><dd className="font-semibold tabular-nums text-ink">{s.daily.reduce((a, d) => a + d.views, 0)}</dd></div>
                  </dl>
                )}
              </div>
            )}
          </Loader>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink/10 pt-4">
        <h3 className="text-sm font-semibold text-ink">Dónde está publicada</h3>
        {editable && <Button small variant="ghost" onClick={() => setAdding(true)}>Registrar</Button>}
      </div>
      <Loader state={pubs}>
        {(list) =>
          list.length === 0 ? <p className="mt-2 text-sm text-ink/65">Anota aquí cada red o portal donde la publiques.</p> : (
            <ul className="mt-1 divide-y divide-ink/10">
              {list.map((pub) => (
                <li key={pub.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{CHANNEL[pub.channel]} <span className="font-normal text-ink/65">· {fmtDate(pub.publishedAt)}</span></p>
                    {pub.url && <a href={pub.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-link hover:underline">{pub.url}</a>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={pub.isActive ? "green" : "neutral"}>{pub.isActive ? "Activa" : "Retirada"}</Badge>
                    {editable && <Button small variant="ghost" onClick={() => toggle(pub)}>{pub.isActive ? "Retirar" : "Reactivar"}</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Loader>
      {adding && (
        <Modal title="Registrar publicación" onClose={() => setAdding(false)}>
          <form onSubmit={addPublication} className="grid gap-4">
            <Field label="Canal"><Select name="channel" options={CHANNEL} defaultValue="FACEBOOK" /></Field>
            <Field label="Enlace del anuncio" hint="Opcional."><Input name="url" type="url" placeholder="https://" /></Field>
            <Field label="Notas"><Input name="notes" /></Field>
            <ErrorNote>{error}</ErrorNote>
            <FormActions onCancel={() => setAdding(false)} saving={false} label="Registrar" />
          </form>
        </Modal>
      )}
    </Card>
  );
}
