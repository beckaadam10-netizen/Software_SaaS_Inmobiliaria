"use client";

import Link from "next/link";
import { IntroMessages } from "@/components/IntroMessages";
import { PageHeader } from "@/components/ui";

/** Mensajes para presentarse como agente antes de abrir una captación. */
export default function IntroPage() {
  return (
    <>
      <PageHeader title="Mensajes de presentación" subtitle="Preséntate como agente inmobiliario a un propietario que todavía no conoces. Elige la operación y genera otro mensaje cuando quieras." />
      <div className="max-w-3xl">
        <IntroMessages />
        <p className="mt-3 text-sm text-ink/70">¿Te respondió? Abre su expediente desde <Link href="/app/gestion" className="font-semibold text-link hover:underline">Gestión comercial › + Nueva captación</Link>.</p>
      </div>
    </>
  );
}
