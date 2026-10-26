/**
 * Marca de Soft_Inmo: un techo sobre una base, con el guion bajo lima que también aparece en el nombre.
 * El símbolo funciona solo (iconos de la app) y junto al nombre. Sus colores son fijos: no cambian con el tema.
 */
export function LogoMark({ size = 32, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill={onDark ? "#f1faf7" : "#0b3c49"} />
      <path d="M8 15.5 16 8.5l8 7" fill="none" stroke={onDark ? "#0b3c49" : "#f1faf7"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 14.5V20h11v-5.5" fill="none" stroke={onDark ? "#0b3c49" : "#f1faf7"} strokeWidth="2.6" strokeLinejoin="round" />
      <rect x="9" y="23" width="14" height="2.8" rx="1.4" fill="#a3e635" />
    </svg>
  );
}

export function Logo({ onDark = false, mark = true }: { onDark?: boolean; mark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      {mark && <LogoMark onDark={onDark} size={28} />}
      <span className={`font-display text-xl font-extrabold tracking-tight ${onDark ? "text-on-brand" : "text-brand-ink"}`}>
        Soft<span className={onDark ? "text-accent-lime" : "text-link"}>_</span>Inmo
      </span>
    </span>
  );
}
