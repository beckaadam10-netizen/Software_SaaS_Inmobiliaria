"use client";

import { useRef, useState, type FormEvent } from "react";
import { AnswerList, type AnswerItem } from "@/components/AnswerList";
import { Button, Card, ErrorNote, Input, Loader, PageHeader } from "@/components/ui";
import { api, errorText, useFetch } from "@/lib/api";

type Status = { content: boolean; assistant: boolean; provider: string | null; used: number; limit: number | null; plan: string; suggestions: string[] };
type Answer = { intent: string; title: string; text: string; items: AnswerItem[] };
type Turn = { id: number; question: string; answer?: Answer; error?: string };

export default function AssistantPage() {
  const status = useFetch<Status>("/ai/status");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const id = nextId.current++;
    setTurns((t) => [...t, { id, question: q }]);
    setBusy(true);
    try {
      const answer = await api<Answer>("/ai/assistant", { method: "POST", json: { question: q } });
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer } : x)));
    } catch (e) {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: errorText(e) } : x)));
    }
    setBusy(false);
    status.reload();
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = input.current?.value ?? "";
    if (input.current) input.current.value = "";
    void ask(value);
  }

  return (
    <>
      <PageHeader title="Asistente" subtitle="Pregunta por tus propiedades, clientes y operaciones. Responde solo con los datos de tu inmobiliaria." />
      <Loader state={status}>
        {(s) =>
          !s.assistant ? (
            <ErrorNote>El asistente no está incluido en tu plan {s.plan}. Actualiza tu plan para usarlo.</ErrorNote>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
              <Card className="flex min-h-[26rem] flex-col">
                <div className="flex flex-1 flex-col gap-4" aria-live="polite">
                  {turns.length === 0 && <p className="text-sm text-ink/70">Escribe tu pregunta o elige una de las sugerencias.</p>}
                  {turns.map((t) => (
                    <div key={t.id} className="flex flex-col gap-2">
                      <p className="self-end rounded-2xl rounded-br-sm bg-brand-teal px-4 py-2 text-sm text-on-brand">{t.question}</p>
                      {t.error ? <ErrorNote>{t.error}</ErrorNote> : !t.answer ? <p className="text-sm text-ink/65">Buscando en tus datos…</p> : (
                        <div className="rounded-2xl rounded-bl-sm bg-surface px-4 py-3 ring-1 ring-ink/10">
                          <p className="text-xs font-semibold uppercase tracking-wide text-ink/65">{t.answer.title}</p>
                          <p className="mt-1 text-sm text-ink">{t.answer.text}</p>
                          {t.answer.intent === "help" ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {t.answer.items.filter((i) => !i.label.includes("(")).map((i) => <Button key={i.label} small variant="ghost" onClick={() => ask(i.label)}>{i.label}</Button>)}
                            </div>
                          ) : <AnswerList items={t.answer.items} />}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <form onSubmit={submit} className="mt-5 flex gap-2">
                  <Input ref={input} name="question" aria-label="Tu pregunta" placeholder="Por ejemplo: ¿Qué leads necesitan seguimiento?" maxLength={300} autoComplete="off" />
                  <Button type="submit" disabled={busy}>Preguntar</Button>
                </form>
              </Card>
              <div className="flex flex-col gap-4">
                <Card>
                  <h2 className="mb-2 text-sm font-semibold text-ink">Preguntas frecuentes</h2>
                  <div className="flex flex-col items-start gap-1.5">
                    {s.suggestions.map((q) => <button key={q} onClick={() => ask(q)} disabled={busy} className="text-left text-sm font-medium text-link hover:underline disabled:opacity-60">{q}</button>)}
                  </div>
                  <p className="mt-3 text-xs text-ink/65">También: “¿Qué propiedades debería mostrarle a (nombre)?” o “¿Qué clientes podrían estar interesados en (código)?”.</p>
                </Card>
                <Card>
                  <h2 className="text-sm font-semibold text-ink">Uso de este mes</h2>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{s.used}<span className="text-sm font-medium text-ink/65"> de {s.limit ?? "sin límite"}</span></p>
                  <p className="mt-1 text-xs text-ink/65">Solicitudes de IA de toda la empresa. Las cifras del asistente se calculan con tus datos; no se inventan.</p>
                </Card>
              </div>
            </div>
          )
        }
      </Loader>
    </>
  );
}
