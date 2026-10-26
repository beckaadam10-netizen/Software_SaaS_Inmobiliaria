"use client";

import { useState, type FormEvent } from "react";
import { api, errorText, useFetch } from "@/lib/api";
import { documentUrl } from "@/lib/images";
import { DOC_CATEGORY, fileSize, fmtDate } from "@/lib/labels";
import { canEdit, useSession } from "./Shell";
import { Button, Card, ErrorNote, Field, FormActions, Input, Loader, Modal, Select } from "./ui";

type Doc = { id: string; category: string; name: string; mimeType: string; sizeBytes: number; createdAt: string; uploadedBy: { fullName: string } | null };

function UploadForm({ entityType, entityId, onDone, onCancel }: { entityType: string; entityId: string; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("entityType", entityType);
    form.set("entityId", entityId);
    setSaving(true);
    setError(null);
    try {
      await api("/documents", { method: "POST", body: form });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Nombre del documento"><Input name="name" required maxLength={150} placeholder="Contrato de reserva" /></Field>
      <Field label="Tipo"><Select name="category" options={DOC_CATEGORY} defaultValue="CONTRACT" /></Field>
      <Field label="Archivo" hint="PDF, JPG, PNG, Word o Excel, hasta 10 MB.">
        <input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" className="text-sm text-ink file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-brand-teal file:px-3 file:text-sm file:font-semibold file:text-on-brand" />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <FormActions onCancel={onCancel} saving={saving} label="Subir documento" />
    </form>
  );
}

/** Documentos privados de un expediente, propiedad o contacto. */
export function DocumentsCard({ entityType, entityId, onChange }: { entityType: "case" | "property" | "contact"; entityId: string; onChange?: () => void }) {
  const user = useSession();
  const editable = canEdit(user.role);
  const state = useFetch<Doc[]>(`/documents?entityType=${entityType}&entityId=${entityId}`);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setError(null);
    try {
      await api(`/documents/${id}`, { method: "DELETE" });
      setRemoving(null);
      state.reload();
      onChange?.();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">Documentos</h2>
        {editable && <Button small variant="ghost" onClick={() => setAdding(true)}>Subir documento</Button>}
      </div>
      <p className="mb-3 text-xs text-ink/65">Privados: solo los ve tu equipo con acceso a este registro.</p>
      <ErrorNote>{error}</ErrorNote>
      <Loader state={state}>
        {(docs) =>
          docs.length === 0 ? <p className="text-sm text-ink/65">Aún no hay documentos.</p> : (
            <ul className="divide-y divide-ink/10">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <a href={documentUrl(d.id)} className="block truncate text-sm font-semibold text-link hover:underline">{d.name}</a>
                    <p className="text-xs text-ink/65">{DOC_CATEGORY[d.category]} · {fileSize(d.sizeBytes)} · {fmtDate(d.createdAt)}{d.uploadedBy ? ` · ${d.uploadedBy.fullName}` : ""}</p>
                  </div>
                  {editable && (removing === d.id ? (
                    <span className="flex items-center gap-1.5 text-xs text-ink/80">¿Eliminar?
                      <Button small variant="danger" onClick={() => remove(d.id)}>Sí</Button>
                      <Button small variant="ghost" onClick={() => setRemoving(null)}>No</Button>
                    </span>
                  ) : <Button small variant="ghost" onClick={() => setRemoving(d.id)}>Eliminar</Button>)}
                </li>
              ))}
            </ul>
          )
        }
      </Loader>
      {adding && (
        <Modal title="Subir documento" onClose={() => setAdding(false)}>
          <UploadForm entityType={entityType} entityId={entityId} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); onChange?.(); }} />
        </Modal>
      )}
    </Card>
  );
}
