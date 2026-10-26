"use client";

import { useEffect } from "react";

/** Registra el service worker para que el sistema se pueda instalar como aplicación. */
export function InstallApp() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);
  return null;
}
