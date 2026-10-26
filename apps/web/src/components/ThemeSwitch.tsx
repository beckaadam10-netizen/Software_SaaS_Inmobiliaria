"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "softinmo.theme";
const LABEL: Record<Theme, string> = { system: "Automático", light: "Claro", dark: "Oscuro" };

/** Aplica el tema guardado. Se ejecuta también antes de pintar, desde el layout, para evitar parpadeos. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

/** Selector de tema: automático (según el equipo), claro u oscuro. */
export function ThemeSwitch({ onDark = false }: { onDark?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    let saved: Theme = "system";
    try {
      const v = localStorage.getItem(KEY);
      if (v === "light" || v === "dark") saved = v;
    } catch {
      /* sin almacenamiento: se usa el del sistema */
    }
    queueMicrotask(() => setTheme(saved));
  }, []);
  function choose(t: Theme) {
    setTheme(t);
    applyTheme(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* el cambio vale para esta visita */
    }
  }
  return (
    <div role="group" aria-label="Tema" className={`flex rounded-lg p-0.5 text-xs font-semibold ring-1 ${onDark ? "ring-on-brand/30" : "ring-ink/20"}`}>
      {(Object.keys(LABEL) as Theme[]).map((t) => (
        <button key={t} type="button" onClick={() => choose(t)} aria-pressed={theme === t}
          className={`flex-1 rounded-md px-2 py-1 transition ${theme === t ? (onDark ? "bg-on-brand text-brand-deep" : "bg-brand-deep text-on-brand") : onDark ? "text-on-brand/80 hover:bg-on-brand/10" : "text-ink/70 hover:bg-ink/5"}`}>
          {LABEL[t]}
        </button>
      ))}
    </div>
  );
}
