"use client";

import { use, useState, type FormEvent } from "react";
import { PublicChrome, type Site } from "@/components/PublicChrome";
import { Badge, Button, Card, ErrorNote, Field, Input, Loader, Loading } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";
import { signDocumentUrl } from "@/lib/images";
import { fmtDate, fmtDateTime } from "@/lib/labels";

type SignView = { status: "PENDING" | "SIGNED" | "CANCELLED" | "EXPIRED"; signerName: string; signerRole: string; document: { name: string; mimeType: string } | null; company: string; caseCode: string; propertyTitle: string; expiresAt: string; signedAt: string | null };

/** Página pública de firma: la persona revisa el documento, escribe su nombre y acepta. */
export default function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const site = useFetch<Site>("/public/site");
  const state = useFetch<SignView>(`/public/sign/${encodeURIComponent(token)}`);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fullName = String(new FormData(e.currentTarget).get("fullName") ?? "");
    setSaving(true); setError(null);
    try {
      await api(`/public/sign/${encodeURIComponent(token)}`, { method: "POST", json: { fullName, accept: accepted } });
      state.reload();
    } catch (err) {
      setError(errorText(err));
    }
    setSaving(false);
  }

  if (!site.data) return site.error ? <main className="p-8"><ErrorNote>{site.error}</ErrorNote></main> : <Loading />;
  return (
    <PublicChrome site={site.data}>
      <div className="mx-auto max-w-xl">
        <Loader state={state}>
          {(s) => (
            <Card>
              <p className="text-sm text-ink/65">{s.company} · {s.caseCode} · {s.propertyTitle}</p>
              <h1 className="mt-1 text-2xl font-bold text-ink">Firma de documento</h1>
              {s.document && <p className="mt-1 text-ink/80"><span className="font-semibold text-ink">{s.document.name}</span> · firma de {s.signerName} como {s.signerRole.toLowerCase()}</p>}
              {s.status === "SIGNED" ? (
                <div className="mt-5 rounded-xl bg-success-soft p-4 text-success ring-1 ring-success/30" role="status">
                  <p className="font-semibold">Documento firmado</p>
                  <p className="text-sm">Firmado el {fmtDateTime(s.signedAt!)}. La inmobiliaria ya fue avisada.</p>
                </div>
              ) : s.status !== "PENDING" ? (
                <div className="mt-5"><Badge tone="neutral">{s.status === "EXPIRED" ? "El enlace venció" : "Esta solicitud fue cancelada"}</Badge><p className="mt-2 text-sm text-ink/75">Pide un enlace nuevo a la inmobiliaria.</p></div>
              ) : (
                <>
                  <ol className="mt-5 flex flex-col gap-4 text-sm text-ink">
                    <li>
                      <p className="font-semibold">1. Revisa el documento</p>
                      <a href={signDocumentUrl(token)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-10 items-center rounded-lg border border-ink/25 bg-white px-4 font-semibold text-ink hover:bg-ink/5">Abrir el documento</a>
                    </li>
                    <li>
                      <p className="font-semibold">2. Firma</p>
                      <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
                        <Field label="Escribe tu nombre completo" hint={`Debe coincidir con: ${s.signerName}`}><Input name="fullName" required autoComplete="name" maxLength={150} /></Field>
                        <label className="flex items-start gap-2.5">
                          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-teal" />
                          <span>Leí el documento y acepto su contenido. Entiendo que esta aceptación queda registrada con la fecha, mi dirección IP y la huella del archivo.</span>
                        </label>
                        <ErrorNote>{error}</ErrorNote>
                        <Button type="submit" disabled={saving || !accepted}>{saving ? "Firmando…" : "Firmar documento"}</Button>
                      </form>
                    </li>
                  </ol>
                  <p className="mt-5 text-xs text-ink/60">Enlace válido hasta el {fmtDate(s.expiresAt)}.</p>
                </>
              )}
            </Card>
          )}
        </Loader>
      </div>
    </PublicChrome>
  );
}
