"use client";

import { useState } from "react";
import { INTRO_TOTAL, introMessage, randomWalk, type IntroOp } from "@/lib/intro-messages";
import { OPERATION } from "@/lib/labels";
import { useSession } from "./Shell";
import { Button, Textarea } from "./ui";

/** Mensaje para presentarse como agente a un propietario que todavía no conocemos: 1.000 variantes por operación. */
export function IntroMessages({ defaultOp = "SALE" }: { defaultOp?: string }) {
  const user = useSession();
  const [op, setOp] = useState<IntroOp>((["SALE", "RENT", "ANTICRETICO"].includes(defaultOp) ? defaultOp : "SALE") as IntroOp);
  // Orden mezclado y sin repetir hasta recorrer los 1.000; cada operación lleva su propio avance.
  const [walk] = useState(() => randomWalk());
  const [step, setStep] = useState<Record<IntroOp, number>>({ SALE: 0, RENT: 0, ANTICRETICO: 0 });
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const n = walk(step[op]);
  const text = edited ?? introMessage(op, n, user.fullName, user.tenant?.name ?? "nuestra inmobiliaria");
  const again = () => { setStep((s) => ({ ...s, [op]: (s[op] + 1) % INTRO_TOTAL })); setEdited(null); setCopied(false); };

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-ink/10" aria-labelledby="intro-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="intro-title" className="font-semibold text-ink">Mensaje de presentación</h2>
          <p className="text-sm text-ink/70">Para escribirle por primera vez a un propietario del que aún no sabes el nombre.</p>
        </div>
        <div role="radiogroup" aria-label="Operación del mensaje" className="flex rounded-lg bg-surface p-0.5 ring-1 ring-ink/10">
          {(Object.keys(OPERATION) as IntroOp[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={op === k} onClick={() => { setOp(k); setEdited(null); setCopied(false); }}
              className={`rounded-md px-3 py-1 text-sm font-semibold transition ${op === k ? "bg-accent-lime text-on-accent" : "text-ink/75 hover:text-ink"}`}>
              {OPERATION[k]}
            </button>
          ))}
        </div>
      </div>
      <Textarea aria-label="Mensaje de presentación" value={text} onChange={(e) => setEdited(e.target.value)} rows={7} className="mt-3 text-sm leading-relaxed" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button small onClick={again}>Volver a generar</Button>
        <Button small variant="ghost" onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => null)}>{copied ? "Copiado" : "Copiar"}</Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-lg bg-accent-lime px-3 text-sm font-bold text-on-accent hover:brightness-95">Enviar por WhatsApp</a>
        <span className="ml-auto text-xs tabular-nums text-ink/60" aria-live="polite">Mensaje {(step[op] + 1).toLocaleString("es-BO")} de {INTRO_TOTAL.toLocaleString("es-BO")} · {OPERATION[op].toLowerCase()}</span>
      </div>
    </section>
  );
}
