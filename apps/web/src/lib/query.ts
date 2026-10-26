"use client";

import { useEffect, useState } from "react";

/** Valor de un parámetro de la dirección actual (por ejemplo ?q=). Solo en el navegador. */
export function queryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

/** Lee el parámetro después de mostrar la pantalla, cuando la dirección ya cambió. null mientras no se leyó. */
export function useQueryParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    queueMicrotask(() => setValue(queryParam(name)));
  }, [name]);
  return value;
}
