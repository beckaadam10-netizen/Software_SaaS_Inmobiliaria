/** Foto de perfil redonda; sin foto muestra las iniciales sobre el color de marca. */
export function Avatar({ name, src, size = 48, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`Foto de ${name}`} style={style} className={`shrink-0 rounded-full bg-[#ffffff] object-cover ring-2 ring-on-brand/70 ${className}`} />
  ) : (
    <span aria-label={`Iniciales de ${name}`} role="img" style={style} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent-lime font-bold text-on-accent ${className}`}>{initials}</span>
  );
}

/** Calificación de 1 a 5 con estrellas; el número también va en texto para lectores de pantalla. */
export function Stars({ value, size = "text-base", className = "" }: { value: number; size?: string; className?: string }) {
  const full = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-0.5 ${size} ${className}`} aria-label={`${value.toLocaleString("es-BO")} de 5 estrellas`} role="img">
      {[1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden className={i <= full ? "text-[#f5b301]" : "opacity-30"}>★</span>)}
    </span>
  );
}
