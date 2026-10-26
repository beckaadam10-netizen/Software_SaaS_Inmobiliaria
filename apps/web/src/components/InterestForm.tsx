"use client";

import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { ErrorNote, Field, formData, Input, Textarea } from "./ui";

/** "Me interesa" y "Agendar visita" del portal público. */
export function InterestForm({ code }: { code: string }) {
  const [wantsVisit, setWantsVisit] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = formData(e.currentTarget);
    setState("sending");
    setError(null);
    try {
      await api(`/public/properties/${code}/interest`, {
        method: "POST",
        json: { ...raw, visitAt: wantsVisit && raw.visitAt ? new Date(raw.visitAt).toISOString() : "" },
      });
      setState("sent");
    } catch (err) {
      setError(errorText(err));
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-xl bg-lime-soft p-4">
        <p className="font-semibold text-ink">Recibimos tu solicitud</p>
        <p className="mt-1 text-sm text-ink/85">Un agente se pondrá en contacto contigo{wantsVisit ? " para confirmar la visita" : ""}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Nombre completo"><Input name="fullName" required maxLength={120} autoComplete="name" /></Field>
      <Field label="Teléfono o WhatsApp"><Input name="phone" type="tel" required minLength={6} maxLength={30} autoComplete="tel" /></Field>
      <Field label="Email (opcional)"><Input name="email" type="email" autoComplete="email" /></Field>
      <Field label="Mensaje (opcional)"><Textarea name="message" maxLength={1000} placeholder="Quisiera más información…" /></Field>
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input type="checkbox" checked={wantsVisit} onChange={(e) => setWantsVisit(e.target.checked)} className="h-4 w-4 accent-brand-teal" />
        Quiero agendar una visita
      </label>
      {wantsVisit && <Field label="Fecha y hora preferidas"><Input name="visitAt" type="datetime-local" required /></Field>}
      <ErrorNote>{error}</ErrorNote>
      <button type="submit" disabled={state === "sending"} className="h-11 rounded-lg bg-accent-lime font-semibold text-on-accent transition hover:brightness-95 disabled:opacity-60">
        {state === "sending" ? "Enviando…" : wantsVisit ? "Solicitar visita" : "Me interesa"}
      </button>
      <p className="text-xs text-ink/65">Tus datos solo se comparten con la inmobiliaria para atender tu consulta.</p>
    </form>
  );
}
