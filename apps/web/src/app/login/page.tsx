"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { api, ApiError, type SessionUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    setLoading(true);
    try {
      const { user } = await api<{ user: SessionUser }>("/auth/login", {
        method: "POST",
        json: { email: form.get("email"), password: form.get("password") },
      });
      router.replace(user.role === "SUPERADMIN" ? "/superadmin" : user.role === "OWNER" ? "/propietario" : "/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error");
      setLoading(false);
    }
  }

  const input =
    "h-11 w-full rounded-lg border border-ink/25 bg-white px-3 text-ink outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/30";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-ink/10">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold text-ink">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-ink/70">Ingresa con tu cuenta de la empresa.</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Email
            <input name="email" type="email" autoComplete="email" required className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Contraseña
            <input name="password" type="password" autoComplete="current-password" required className={input} />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 rounded-lg bg-brand-teal font-semibold text-on-brand transition hover:bg-brand-deep disabled:opacity-60"
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
