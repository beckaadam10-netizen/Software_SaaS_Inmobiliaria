"use client";

import { use, useState, type FormEvent } from "react";
import { Avatar, Stars } from "@/components/Avatar";
import { PublicChrome, type Site } from "@/components/PublicChrome";
import { Button, Card, ErrorNote, Field, Loader, Loading, Textarea } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";

type ReviewView = {
  clientName: string; operation: string; property: string; zone: string;
  agent: { fullName: string; avatar: string | null } | null;
  done: boolean; review: { rating: number; text: string; publish: boolean } | null;
};
const WHAT: Record<string, string> = { SALE: "tu compra", RENT: "tu alquiler", ANTICRETICO: "tu anticrético" };
const LABELS = ["", "Mala", "Regular", "Buena", "Muy buena", "Excelente"];

/** Página pública de reseña: el cliente llega por el enlace que le envió su agente y califica la atención. */
export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const site = useFetch<Site>("/public/site");
  const state = useFetch<ReviewView>(`/public/reviews/${encodeURIComponent(token)}`);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rating) return setError("Elige de 1 a 5 estrellas");
    const text = String(new FormData(e.currentTarget).get("text") ?? "");
    setSaving(true); setError(null);
    try {
      await api(`/public/reviews/${encodeURIComponent(token)}`, { method: "POST", json: { rating, text, publish } });
      state.reload();
    } catch (err) {
      setError(errorText(err));
    }
    setSaving(false);
  }

  if (!site.data) return site.error ? <main className="p-8"><ErrorNote>{site.error}</ErrorNote></main> : <Loading />;
  const shown = hover || rating;
  return (
    <PublicChrome site={site.data}>
      <div className="mx-auto max-w-xl">
        <Loader state={state}>
          {(r) => (
            <Card>
              {r.agent && (
                <div className="flex items-center gap-4">
                  <Avatar name={r.agent.fullName} src={r.agent.avatar} size={64} />
                  <div className="min-w-0">
                    <p className="text-sm text-ink/70">Te atendió</p>
                    <p className="truncate text-lg font-bold text-ink">{r.agent.fullName}</p>
                  </div>
                </div>
              )}
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">{r.done ? `¡Gracias, ${r.clientName}!` : `${r.clientName}, ¿cómo te fue con ${WHAT[r.operation] ?? "tu operación"}?`}</h1>
              <p className="mt-1 text-sm text-ink/70">{r.property}{r.zone ? ` · ${r.zone}` : ""}</p>
              {r.done ? (
                <div className="mt-5 rounded-xl bg-success-soft p-4 ring-1 ring-success/30" role="status">
                  <p className="font-semibold text-success">Recibimos tu reseña</p>
                  {r.review && (
                    <>
                      <Stars value={r.review.rating} className="mt-2" />
                      <p className="mt-1 text-sm text-ink/85">“{r.review.text}”</p>
                      <p className="mt-2 text-xs text-ink/70">{r.review.publish ? "Ya está publicada en nuestro portal." : "La guardamos solo para la inmobiliaria."}</p>
                    </>
                  )}
                </div>
              ) : (
                <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
                  <fieldset>
                    <legend className="text-sm font-medium text-ink">Tu calificación</legend>
                    <div className="mt-1 flex items-center gap-1" role="radiogroup" aria-label="Calificación" onMouseLeave={() => setHover(0)}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
                          onClick={() => setRating(n)} onMouseEnter={() => setHover(n)}
                          className={`h-12 w-12 rounded-lg text-4xl leading-none transition hover:scale-110 ${n <= shown ? "text-[#f5b301]" : "text-ink/25"}`}>
                          ★
                        </button>
                      ))}
                      <span className="ml-2 text-sm font-semibold text-ink" aria-live="polite">{LABELS[shown]}</span>
                    </div>
                  </fieldset>
                  <Field label="Tu comentario" hint="Cuenta cómo fue la atención, el proceso y la entrega.">
                    <Textarea name="text" required minLength={10} maxLength={1000} rows={5} placeholder="Me ayudaron a encontrar lo que buscaba y el trámite fue rápido…" />
                  </Field>
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-teal" />
                    <span>Autorizo publicar mi reseña en el portal con mi nombre de pila ({r.clientName}).</span>
                  </label>
                  <ErrorNote>{error}</ErrorNote>
                  <Button type="submit" disabled={saving}>{saving ? "Enviando…" : "Enviar reseña"}</Button>
                </form>
              )}
            </Card>
          )}
        </Loader>
      </div>
    </PublicChrome>
  );
}
