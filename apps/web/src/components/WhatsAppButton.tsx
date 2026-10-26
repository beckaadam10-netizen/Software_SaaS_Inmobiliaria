"use client";

import { useState } from "react";
import { api, useFetch } from "@/lib/api";
import { publicUrl } from "@/lib/images";
import { fillTemplate, fmtDateTime, money, waNumber } from "@/lib/labels";
import { useSession } from "./Shell";
import { Button, Field, Loader, Modal, Select, Textarea } from "./ui";

type Template = { id: string; name: string; body: string };
export type WaTarget = {
  contact: { id: string; fullName: string; phone: string | null };
  leadId?: string;
  property?: { code: string; title: string; price?: unknown; currency?: string } | null;
  date?: string;
};

function Composer({ target, onClose }: { target: WaTarget; onClose: () => void }) {
  const user = useSession();
  const templates = useFetch<Template[]>("/whatsapp/templates");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [edited, setEdited] = useState<string | null>(null);
  const number = waNumber(target.contact.phone);

  return (
    <Loader state={templates}>
      {(list) => {
        const template = list.find((t) => t.id === templateId) ?? list[0];
        const p = target.property;
        const filled = template
          ? fillTemplate(template.body, {
              cliente: target.contact.fullName.split(" ")[0],
              agente: user.fullName,
              empresa: user.tenant?.name,
              propiedad: p?.title,
              precio: p?.price != null ? money(p.price, p.currency) : null,
              enlace: p ? publicUrl(p.code, "whatsapp") : null,
              fecha: target.date ? fmtDateTime(target.date) : null,
            })
          : "";
        const message = edited ?? filled;
        return (
          <div className="grid gap-4">
            <p className="text-sm text-ink/80">Para {target.contact.fullName} · {target.contact.phone}</p>
            <Field label="Plantilla">
              <Select options={list.map((t) => [t.id, t.name] as [string, string])} value={template?.id ?? ""} onChange={(e) => { setTemplateId(e.target.value); setEdited(null); }} />
            </Field>
            <Field label="Mensaje" hint="Puedes ajustarlo antes de enviarlo. Lo que quede entre llaves no tiene dato y conviene completarlo.">
              <Textarea rows={6} value={message} onChange={(e) => setEdited(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <a
                href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  api("/whatsapp/log", { method: "POST", json: { contactId: target.contact.id, leadId: target.leadId, templateName: template?.name } }).catch(() => null);
                  onClose();
                }}
                className="inline-flex h-10 items-center rounded-lg bg-brand-teal px-4 text-sm font-semibold text-on-brand hover:bg-brand-deep"
              >
                Abrir WhatsApp
              </a>
            </div>
            <p className="text-xs text-ink/65">Se abre WhatsApp con el mensaje listo; lo envías tú. El contacto queda registrado en el historial.</p>
          </div>
        );
      }}
    </Loader>
  );
}

/** Botón que prepara un mensaje de WhatsApp con plantilla para un contacto. */
export function WhatsAppButton({ target, onSent, label = "WhatsApp" }: { target: WaTarget; onSent?: () => void; label?: string }) {
  const user = useSession();
  const [open, setOpen] = useState(false);
  if (!waNumber(target.contact.phone) || user.role === "ACCOUNTANT") return null;
  return (
    <>
      <Button small variant="ghost" onClick={() => setOpen(true)}>{label}</Button>
      {open && (
        <Modal title="Mensaje de WhatsApp" onClose={() => setOpen(false)}>
          <Composer target={target} onClose={() => { setOpen(false); onSent?.(); }} />
        </Modal>
      )}
    </>
  );
}
