"use client";

import Link from "next/link";

export type AnswerItem = { label: string; detail?: string; link?: string };

/** Lista de resultados con enlace al registro, usada por el asistente y las alertas. */
export function AnswerList({ items }: { items: AnswerItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 divide-y divide-ink/10">
      {items.map((i, n) => (
        <li key={n} className="py-2 text-sm">
          {i.link ? <Link href={i.link} className="font-semibold text-link hover:underline">{i.label}</Link> : <span className="font-semibold text-ink">{i.label}</span>}
          {i.detail && <span className="block text-ink/70">{i.detail}</span>}
        </li>
      ))}
    </ul>
  );
}
