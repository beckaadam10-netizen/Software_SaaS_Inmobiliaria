"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const KEY_ID = "si_visitor";
const KEY_FAVS = "si_favs";

// El navegador puede bloquear el almacenamiento (modo privado): todo sigue funcionando sin él.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento */
  }
}
/** Código anónimo del navegador; no identifica a la persona. */
function visitorId() {
  let id = read<string | null>(KEY_ID, null);
  if (!id || !/^[a-zA-Z0-9-]{8,40}$/.test(id)) {
    id = (globalThis.crypto?.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 36);
    write(KEY_ID, id);
  }
  return id;
}
export const savedFavorites = () => read<string[]>(KEY_FAVS, []);

/** "Guardar" del portal: el visitante marca propiedades sin crear una cuenta. */
export function FavoriteButton({ code }: { code: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // Se lee después de montar para no desalinear el HTML del servidor.
    const saved = savedFavorites().includes(code);
    if (saved) queueMicrotask(() => setOn(true));
  }, [code]);

  async function toggle() {
    const next = !on;
    setOn(next);
    const favs = savedFavorites().filter((c) => c !== code);
    write(KEY_FAVS, next ? [...favs, code] : favs);
    await api(`/public/properties/${code}/favorite`, { method: "POST", json: { visitorId: visitorId(), on: next } }).catch(() => null);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${on ? "bg-brand-deep text-on-brand" : "border border-ink/25 bg-white text-ink hover:bg-ink/5"}`}
    >
      <span aria-hidden>{on ? "♥" : "♡"}</span>
      {on ? "Guardada" : "Guardar"}
    </button>
  );
}
