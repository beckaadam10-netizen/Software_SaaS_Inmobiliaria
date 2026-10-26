"use client";

import { useEffect, type ComponentProps, type ReactNode } from "react";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

const BTN = {
  primary: "bg-brand-teal text-on-brand hover:bg-brand-deep",
  accent: "bg-accent-lime text-on-accent hover:brightness-95",
  ghost: "border border-ink/20 bg-white text-ink hover:bg-ink/5",
  danger: "border border-danger/40 bg-white text-danger hover:bg-danger-soft",
};
export function Button({ variant = "primary", small, className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof BTN; small?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal",
        small ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        BTN[variant],
        className,
      )}
    />
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-ink/25 bg-white px-3 text-sm text-ink outline-none placeholder:text-ink/45 focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/25";

export function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx("flex flex-col gap-1.5 text-sm font-medium text-ink", className)}>
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs font-normal text-ink/65">{hint}</span>}
    </label>
  );
}
export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}
export function Select({ options, placeholder, ...props }: ComponentProps<"select"> & { options: Array<[string, string]> | string[][] | Record<string, string>; placeholder?: string }) {
  const list = Array.isArray(options) ? options : Object.entries(options);
  return (
    <select {...props} className={cx(inputClass, "pr-8", props.className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {list.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cx(inputClass, "h-auto py-2", props.className)} />;
}

const TONES = {
  neutral: "bg-ink/8 text-ink",
  teal: "bg-brand-teal/12 text-brand-ink",
  lime: "bg-lime-soft text-ink",
  amber: "bg-warning-soft text-warning",
  red: "bg-danger-soft text-danger",
  green: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  /* Nombres de estado: éxito, alerta, error, información. */
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  dark: "bg-brand-deep text-on-brand",
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", TONES[tone])}>{children}</span>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-2xl bg-white p-5 ring-1 ring-ink/10", className)}>{children}</section>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink/70">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger ring-1 ring-danger/30">
      {children}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/25 px-6 py-10 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-ink/70">{children}</div>}
    </div>
  );
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-ink/65">Cargando…</p>;
}

/** Estado de carga, error o contenido, en un solo lugar. */
export function Loader<T>({ state, children }: { state: { data: T | null; error: string | null; loading: boolean }; children: (data: T) => ReactNode }) {
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;
  if (!state.data) return <Loading />;
  return <>{children(state.data)}</>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:py-10" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx("w-full rounded-2xl bg-white p-6 shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="-mr-1 -mt-1 rounded-lg p-1.5 text-xl leading-none text-ink/60 hover:bg-ink/5 hover:text-ink">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormActions({ onCancel, saving, label = "Guardar" }: { onCancel: () => void; saving: boolean; label?: string }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={saving}>
        {saving ? "Guardando…" : label}
      </Button>
    </div>
  );
}

/** Convierte un formulario en objeto; los campos vacíos viajan como cadena vacía y la API los trata como nulos. */
export function formData(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries([...new FormData(form).entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}
