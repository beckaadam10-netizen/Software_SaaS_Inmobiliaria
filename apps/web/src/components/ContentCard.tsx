"use client";

import { useState } from "react";
import { api, errorText, useFetch } from "@/lib/api";
import { Badge, Button, Card, ErrorNote, Select, Textarea } from "./ui";

const KINDS = { title: "Título del anuncio", description: "Descripción para el portal", ad: "Anuncio para clasificados", social: "Publicación para redes", whatsapp: "Mensaje de WhatsApp", email: "Email", cta: "Llamada a la acción" };
const TONES = { "": "Tono neutro", profesional: "Profesional", cercano: "Cercano", "de lujo": "De lujo", breve: "Breve y directo" };

/** Genera textos de marketing de la propiedad. Con proveedor de IA redacta el modelo; sin él, plantillas. */
export function ContentCard({ propertyId }: { propertyId: string }) {
  const status = useFetch<{ content: boolean }>("/ai/status");
  const [kind, setKind] = useState("description");
  const [tone, setTone] = useState("");
  const [result, setResult] = useState<{ text: string; source: "ai" | "template" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setResult(await api("/ai/content", { method: "POST", json: { propertyId, kind, tone } }));
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }
  async function copy() {
    if (!result) return;
    await navigator.clipboard?.writeText(result.text).catch(() => null);
    setCopied(true);
  }

  // Si el plan no incluye IA, la tarjeta no se muestra.
  if (!status.data?.content) return null;
  return (
    <Card>
      <h2 className="font-semibold text-ink">Generar contenido</h2>
      <p className="mb-3 text-sm text-ink/70">Textos listos para publicar, hechos solo con los datos de esta ficha.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select aria-label="Tipo de contenido" options={KINDS} value={kind} onChange={(e) => setKind(e.target.value)} />
        <Select aria-label="Tono" options={TONES} value={tone} onChange={(e) => setTone(e.target.value)} />
        <Button onClick={generate} disabled={busy}>{busy ? "Generando…" : "Generar"}</Button>
      </div>
      <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>
      {result && (
        <div className="mt-1">
          <Textarea aria-label="Texto generado" rows={7} value={result.text} onChange={(e) => setResult({ ...result, text: e.target.value })} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Badge tone={result.source === "ai" ? "lime" : "neutral"}>{result.source === "ai" ? "Redactado con IA" : "Hecho con plantilla"}</Badge>
            <Button small variant="ghost" onClick={copy}>{copied ? "Copiado" : "Copiar"}</Button>
          </div>
          <p className="mt-2 text-xs text-ink/65">Revisa el texto antes de publicarlo. Puedes editarlo aquí mismo.</p>
        </div>
      )}
    </Card>
  );
}
