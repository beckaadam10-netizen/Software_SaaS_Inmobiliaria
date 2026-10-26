"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type Role = "SUPERADMIN" | "ADMIN" | "AGENT" | "ACCOUNTANT" | "OWNER";
/** Marca de la empresa: lo que personaliza su portal y su panel. */
export type Brand = {
  name: string; logo: string | null; primaryColor: string | null; buttonColor: string | null; hideBrand: boolean;
  phone: string | null; whatsapp: string | null; email: string | null; address: string | null; about: string | null; schedule: string | null;
  website: string | null; facebook: string | null; instagram: string | null; tiktok: string | null;
};
export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatar?: string | null;
  permissions?: string[];
  branchId?: string | null;
  tenant?: (Brand & { slug: string }) | null;
};

/** Jefe de sucursal: agente con el permiso, una sucursal asignada y sin "ver todo". */
export const isBranchManager = (user: SessionUser) => user.role === "AGENT" && !!user.branchId && !!user.permissions?.includes("branch_manager") && !user.permissions?.includes("view_all");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const BRANCH_KEY = "softinmo.branch";
/** Sucursal elegida en este navegador para ver el panel ("" = toda la empresa). */
export function selectedBranch(): string {
  try {
    return localStorage.getItem(BRANCH_KEY) ?? "";
  } catch {
    return "";
  }
}
export function selectBranch(id: string) {
  try {
    if (id) localStorage.setItem(BRANCH_KEY, id);
    else localStorage.removeItem(BRANCH_KEY);
  } catch {
    /* sin almacenamiento: la vista vuelve a toda la empresa */
  }
}
const branchHeader = (): Record<string, string> => (typeof window === "undefined" || !selectedBranch() ? {} : { "x-branch": selectedBranch() });

/** Llama al backend a través de /api. Lanza ApiError con el mensaje del servidor. */
export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const isForm = rest.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
      headers: { ...(isForm ? {} : { "content-type": "application/json" }), ...branchHeader(), ...rest.headers },
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new ApiError(
      res.status >= 500 ? "El servidor no está disponible. Intenta de nuevo." : (message ?? "Ocurrió un error"),
      res.status,
    );
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Ocurrió un error");

/** Carga datos de la API y permite recargarlos. Una sesión vencida lleva al login. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        else setError(errorText(e));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick, router]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
