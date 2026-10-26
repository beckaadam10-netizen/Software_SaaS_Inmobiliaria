"use client";

import { useRef, useState } from "react";
import { api, errorText } from "@/lib/api";
import { Avatar } from "./Avatar";
import { Button, ErrorNote } from "./ui";

/** Cambiar o quitar la foto de perfil. `path` es /me/avatar o /users/<id>/avatar. */
export function AvatarUpload({ name, src, path, onChange }: { name: string; src: string | null; path: string; onChange: (avatar: string | null) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(src);
  async function run(fn: () => Promise<{ avatar: string | null }>) {
    setBusy(true); setError(null);
    try {
      const { avatar } = await fn();
      setCurrent(avatar);
      onChange(avatar);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
    if (file.current) file.current.value = "";
  }
  function upload(f?: File) {
    if (!f) return;
    const body = new FormData();
    body.append("file", f);
    void run(() => api<{ avatar: string | null }>(path, { method: "POST", body }));
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={name} src={current} size={88} className="!ring-ink/10" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" small disabled={busy} onClick={() => file.current?.click()}>{current ? "Cambiar foto" : "Subir foto"}</Button>
          {current && <Button type="button" small variant="ghost" disabled={busy} onClick={() => void run(() => api<{ avatar: null }>(path, { method: "DELETE" }))}>Quitar</Button>}
        </div>
        <p className="text-xs text-ink/65">PNG, JPG o WebP de hasta 1 MB. Mejor cuadrada y con buena luz: se ve en el portal junto a tus propiedades.</p>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Archivo de la foto" onChange={(e) => upload(e.target.files?.[0])} />
        <ErrorNote>{error}</ErrorNote>
      </div>
    </div>
  );
}
