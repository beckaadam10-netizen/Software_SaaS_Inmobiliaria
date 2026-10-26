"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { api, errorText } from "@/lib/api";
import { money, PAY_METHOD, todayInput } from "@/lib/labels";
import { ErrorNote, Field, formData, FormActions, Input, Select } from "./ui";

/** Tabla con el estilo del sistema; las columnas numéricas se alinean a la derecha con `num`. */
export function DataTable({ head, children, minWidth = 720 }: { head: Array<string | { label: string; num?: boolean }>; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/10">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="border-b border-ink/10 text-xs uppercase tracking-wide text-ink/65">
          <tr>
            {head.map((h, i) => {
              const col = typeof h === "string" ? { label: h } : h;
              return <th key={i} className={`px-4 py-3 font-semibold ${col.num ? "text-right" : ""}`}>{col.label}</th>;
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/10">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, num, strong, className = "" }: { children?: ReactNode; num?: boolean; strong?: boolean; className?: string }) => (
  <td className={`px-4 py-3 ${num ? "text-right tabular-nums" : ""} ${strong ? "font-semibold text-ink" : "text-ink/85"} ${className}`}>{children}</td>
);
/** Monto con signo y color según sea positivo o negativo. */
export const Signed = ({ value, currency }: { value: number; currency: string }) => (
  <span className={value < 0 ? "text-danger" : "text-ink"}>{value < 0 ? "−" : ""}{money(Math.abs(value), currency)}</span>
);

/** Formulario de cobro o pago contra una cuenta. */
export function PaymentForm({ path, balance, currency, verb, onDone, onCancel }: { path: string; balance: number; currency: string; verb: "Cobrar" | "Pagar"; onDone: () => void; onCancel: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [today] = useState(todayInput);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(path, { method: "POST", json: formData(e.currentTarget) });
      onDone();
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <p className="text-sm text-ink/80 sm:col-span-2">Saldo pendiente: <strong className="text-ink">{money(balance, currency)}</strong></p>
      <Field label={`Monto (${currency})`}><Input name="amount" type="number" min={0.01} max={balance} step="0.01" required defaultValue={balance} /></Field>
      <Field label="Fecha"><Input name="date" type="date" required defaultValue={today} /></Field>
      <Field label="Forma de pago" className="sm:col-span-2"><Select name="method" options={PAY_METHOD} /></Field>
      <div className="sm:col-span-2"><ErrorNote>{error}</ErrorNote><FormActions onCancel={onCancel} saving={saving} label={verb === "Cobrar" ? "Registrar cobro" : "Registrar pago"} /></div>
    </form>
  );
}
