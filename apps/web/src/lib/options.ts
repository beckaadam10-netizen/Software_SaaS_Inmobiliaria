"use client";

import { useFetch } from "./api";

type Opt = Array<[string, string]>;

/** Listas para los selectores de los formularios. */
export function useAgents(): Opt {
  const { data } = useFetch<Array<{ id: string; fullName: string }>>("/users/agents");
  return (data ?? []).map((a) => [a.id, a.fullName]);
}
export function useContacts(enabled = true): Opt {
  const { data } = useFetch<Array<{ id: string; fullName: string; phone: string | null }>>(enabled ? "/contacts" : null);
  return (data ?? []).map((c) => [c.id, c.phone ? `${c.fullName} · ${c.phone}` : c.fullName]);
}
export function useProperties(enabled = true): Opt {
  const { data } = useFetch<Array<{ id: string; code: string; title: string }>>(enabled ? "/properties" : null);
  return (data ?? []).map((p) => [p.id, `${p.code} · ${p.title}`]);
}
