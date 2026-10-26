"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { api, errorText, useFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/labels";
import { Badge, Button, Card, ErrorNote, Field, formData, FormActions, Input, Loading, Modal, Select, type Tone } from "./ui";

type Item = { id: string; label: string; doneAt: string | null };
type Signature = { id: string; documentName: string; signerName: string; signerRole: string; status: "PENDING" | "SIGNED" | "CANCELLED" | "EXPIRED"; link: string; expiresAt: string; signedAt: string | null; signedIp: string | null; documentHash: string | null };
type Legal = { items: Item[]; signatures: Signature[]; signaturesEnabled: boolean };
const ROLE: Record<string, string> = { OWNER: "Propietario", CLIENT: "Cliente", AGENT: "Agente", WITNESS: "Testigo", OTHER: "Otro" };
const STATUS: Record<Signature["status"], [string, Tone]> = { PENDING: ["Esperando firma", "amber"], SIGNED: ["Firmado", "green"], CANCELLED: ["Cancelada", "neutral"], EXPIRED: ["Enlace vencido", "neutral"] };

/** Copia el enlace de firma o lo envía por WhatsApp. */
function LinkActions({ link, signer }: { link: string; signer: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? link : `${window.location.origin}${link}`;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Button small variant="ghost" onClick={async () => { await navigator.clipboard?.writeText(url).catch(() => null); setCopied(true); }}>{copied ? "Enlace copiado" : "Copiar enlace"}</Button>
      <a href={`https://wa.me/?text=${encodeURIComponent(`Hola ${signer.split(" ")[0]}, te comparto el documento para que lo revises y firmes: ${url}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg border border-ink/20 bg-white px-3 text-sm font-semibold text-ink hover:bg-ink/5">Enviar por WhatsApp</a>
    </span>
  );
}

function SignatureForm({ caseId, onDone, onCancel }: { caseId: string; onDone: () => void; onCancel: () => void }) {
  const docs = useFetch<Array<{ id: string; name: string }>>(`/documents?entityType=case&entityId=${caseId}`);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await api(`/cases/${caseId}/signatures`, { method: "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  if (!docs.data) return <Loading />;
  if (!docs.data.length) return <p className="text-sm text-ink/75">Primero sube el documento (contrato, minuta) en la tarjeta Documentos de este expediente.</p>;
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Documento"><Select name="documentId" required options={docs.data.map((d) => [d.id, d.name])} /></Field>
      <Field label="Nombre completo de quien firma" hint="Para firmar, la persona debe escribir este mismo nombre."><Input name="signerName" required maxLength={150} /></Field>
      <Field label="Firma como"><Select name="signerRole" options={ROLE} defaultValue="CLIENT" /></Field>
      <div><ErrorNote>{error}</ErrorNote><FormActions onCancel={onCancel} saving={saving} label="Crear enlace de firma" /></div>
    </form>
  );
}

/** Proceso legal: checklist de trámites y firmas de documentos por enlace. */
export function LegalCard({ caseId, editable }: { caseId: string; editable: boolean }) {
  const state = useFetch<Legal>(`/cases/${caseId}/legal`);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [signing, setSigning] = useState(false);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      state.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  if (!state.data) return <Card><h2 className="font-semibold text-ink">Proceso legal</h2>{state.error ? <ErrorNote>{state.error}</ErrorNote> : <Loading />}</Card>;
  const { items, signatures, signaturesEnabled } = state.data;
  const done = items.filter((i) => i.doneAt).length;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink">Proceso legal</h2>
        <p className="text-sm text-ink/70">{done} de {items.length} trámites</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10" aria-hidden><div className="h-full rounded-full bg-brand-teal" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></div>
      <ul className="mt-3 flex flex-col gap-1">
        {items.map((i) => (
          <li key={i.id} className="group flex items-center gap-2.5">
            <input type="checkbox" checked={!!i.doneAt} disabled={!editable} aria-label={i.label} onChange={() => act(() => api(`/legal/items/${i.id}`, { method: "PATCH", json: { done: !i.doneAt } }))} className="h-4 w-4 shrink-0 accent-brand-teal" />
            <span className={`flex-1 text-sm ${i.doneAt ? "text-ink/55 line-through" : "text-ink"}`}>{i.label}</span>
            {editable && <button onClick={() => act(() => api(`/legal/items/${i.id}`, { method: "DELETE" }))} aria-label={`Quitar ${i.label}`} className="rounded px-1.5 text-lg leading-none text-ink/40 opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100">×</button>}
          </li>
        ))}
      </ul>
      {editable && (
        <form onSubmit={(e) => { e.preventDefault(); if (adding.trim()) void act(() => api(`/cases/${caseId}/legal/items`, { method: "POST", json: { label: adding } })).then(() => setAdding("")); }} className="mt-3 flex gap-2">
          <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Agregar un trámite" aria-label="Nuevo trámite" maxLength={190} />
          <Button type="submit" variant="ghost">Agregar</Button>
        </form>
      )}

      <div className="mt-5 border-t border-ink/10 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Firmas</h3>
          {editable && signaturesEnabled && <Button small onClick={() => setSigning(true)}>Pedir firma</Button>}
        </div>
        {!signaturesEnabled ? <p className="mt-1 text-sm text-ink/65">La firma de documentos por enlace está disponible desde el plan Empresa.</p>
          : signatures.length === 0 ? <p className="mt-1 text-sm text-ink/65">Envía un enlace para que el cliente o el propietario revise y firme un documento sin crear una cuenta.</p> : (
          <ul className="mt-2 flex flex-col gap-2">
            {signatures.map((s) => (
              <li key={s.id} className="rounded-xl p-3 ring-1 ring-ink/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm"><span className="font-semibold text-ink">{s.signerName}</span> <span className="text-ink/65">· {ROLE[s.signerRole]} · {s.documentName}</span></p>
                  <Badge tone={STATUS[s.status][1]}>{STATUS[s.status][0]}</Badge>
                </div>
                {s.status === "SIGNED" && (
                  <p className="mt-1 break-all text-xs text-ink/65">Firmado el {fmtDateTime(s.signedAt!)} desde {s.signedIp} · huella del archivo {s.documentHash?.slice(0, 16)}…</p>
                )}
                {s.status === "PENDING" && editable && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <LinkActions link={s.link} signer={s.signerName} />
                    <Link href={s.link} className="inline-flex h-8 items-center rounded-lg px-2 text-sm font-semibold text-link hover:underline">Ver como firmante</Link>
                    <Button small variant="danger" onClick={() => act(() => api(`/signatures/${s.id}/cancel`, { method: "POST" }))}>Cancelar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink/60">Es una aceptación electrónica: queda registrada la fecha, la IP y la huella del archivo. No reemplaza la firma digital con certificado ni la firma ante notario.</p>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {signing && (
        <Modal title="Pedir firma de un documento" onClose={() => setSigning(false)}>
          <SignatureForm caseId={caseId} onCancel={() => setSigning(false)} onDone={() => { setSigning(false); state.reload(); }} />
        </Modal>
      )}
    </Card>
  );
}
