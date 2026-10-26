"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Badge, Card, Empty, ErrorNote, Loading } from "@/components/ui";
import { api, ApiError, errorText, type SessionUser } from "@/lib/api";
import { brandStyle } from "@/lib/brand";
import { imageUrl, ownerDocumentUrl } from "@/lib/images";
import { CASE_STATUS, fmtDate, fmtDateTime, money, OFFER_KIND, OFFER_STATUS, OPERATION, PROPERTY_STATUS, PROPERTY_TYPE, STAGE, STAGES, VISIT_STATUS } from "@/lib/labels";
import { PROPERTY_TONE } from "@/lib/tones";

type OwnerProperty = {
  id: string; code: string; title: string; type: string; operation: string; status: string; isPublished: boolean; price: number; currency: string; zone: string | null; city: string | null;
  imageId: string | null; agent: { fullName: string; phone: string | null } | null; views: number; views30: number; leads: number; leads30: number; visitsDone: number;
  visits: Array<{ scheduledAt: string; status: string; result: string | null }>;
  case: { code: string; status: string; stage: string; closedPrice: number | null; closedAt: string | null; captationEnds: string | null; isExclusive: boolean } | null;
  offers: Array<{ kind: string; amount: number; currency: string; status: string; createdAt: string }>;
  documents: Array<{ id: string; name: string; category: string; createdAt: string }>;
};
type Summary = { owner: string; company: string; properties: OwnerProperty[] };
type Me = SessionUser;

const Stat = ({ label, value, hint }: { label: string; value: number; hint?: string }) => (
  <div className="rounded-xl bg-surface px-3 py-2.5">
    <p className="text-xs text-ink/70">{label}</p>
    <p className="text-xl font-bold tabular-nums text-ink">{value.toLocaleString("es-BO")}</p>
    {hint && <p className="text-xs text-ink/65">{hint}</p>}
  </div>
);

export default function OwnerPortalPage() {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SessionUser>("/auth/me")
      .then((u) => {
        if (u.role !== "OWNER") router.replace(u.role === "SUPERADMIN" ? "/superadmin" : "/app");
        else { setMe(u); return api<Summary>("/owner/summary").then(setData); }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        else setError(errorText(e));
      });
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
  }

  return (
    <div className="brand-scope flex min-h-screen flex-1 flex-col" style={brandStyle(me?.tenant)}>
      <header className="flex items-center justify-between gap-3 bg-brand-deep px-4 py-3 sm:px-8">
        {me?.tenant?.logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={me.tenant.logo} alt={me.tenant.name} className="h-9 w-auto max-w-[10rem] rounded bg-[#ffffff] object-contain p-0.5" />
          : me?.tenant?.hideBrand ? <span className="text-lg font-bold text-on-brand">{me.tenant.name}</span> : <Logo onDark />}
        <div className="flex items-center gap-3">
          {data && <span className="hidden text-sm text-on-brand/85 sm:inline">{data.owner}</span>}
          <button onClick={logout} className="rounded-lg border border-on-brand/40 px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-on-brand/10">Cerrar sesión</button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
        {error ? <ErrorNote>{error}</ErrorNote> : !data ? <Loading /> : (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Mis propiedades</h1>
            <p className="mb-6 mt-1 text-sm text-ink/70">Así va la gestión de {data.company} con tus inmuebles.</p>
            {data.properties.length === 0 ? <Empty title="Aún no tienes propiedades registradas">Cuando {data.company} registre tu inmueble, aquí verás su avance.</Empty> : (
              <div className="flex flex-col gap-6">
                {data.properties.map((p) => {
                  const stageIndex = p.case ? STAGES.indexOf(p.case.stage) : -1;
                  return (
                    <Card key={p.id}>
                      <div className="flex flex-col gap-4 sm:flex-row">
                        {p.imageId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl(p.imageId)} alt="" className="h-40 w-full rounded-xl object-cover sm:h-28 sm:w-40" />
                        ) : <div className="flex h-28 w-full items-center justify-center rounded-xl bg-ink/5 text-xs text-ink/55 sm:w-40">Sin foto</div>}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-bold text-ink">{p.title}</h2>
                            <Badge tone={PROPERTY_TONE[p.status]}>{PROPERTY_STATUS[p.status]}</Badge>
                            <Badge tone={p.isPublished ? "lime" : "neutral"}>{p.isPublished ? "Publicada" : "Sin publicar"}</Badge>
                          </div>
                          <p className="text-sm text-ink/75">{p.code} · {PROPERTY_TYPE[p.type]} en {OPERATION[p.operation].toLowerCase()}{p.zone ? ` · ${p.zone}` : ""}{p.city ? `, ${p.city}` : ""}</p>
                          <p className="mt-1 text-xl font-bold text-ink">{money(p.price, p.currency)}</p>
                          {p.agent && <p className="text-sm text-ink/75">Tu agente: <span className="font-semibold text-ink">{p.agent.fullName}</span>{p.agent.phone ? ` · ${p.agent.phone}` : ""}</p>}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Stat label="Vistas en el portal" value={p.views} hint={`${p.views30} en 30 días`} />
                        <Stat label="Interesados" value={p.leads} hint={`${p.leads30} en 30 días`} />
                        <Stat label="Visitas realizadas" value={p.visitsDone} />
                        <Stat label="Ofertas recibidas" value={p.offers.filter((o) => o.kind === "OFFER").length} />
                      </div>

                      {p.case && (
                        <div className="mt-4">
                          <p className="text-sm font-semibold text-ink">
                            Avance de la gestión · {p.case.status === "OPEN" ? `Paso ${stageIndex + 1} de 8: ${STAGE[p.case.stage]}` : `${CASE_STATUS[p.case.status]}${p.case.closedPrice ? ` por ${money(p.case.closedPrice, p.currency)}` : ""}${p.case.closedAt ? ` el ${fmtDate(p.case.closedAt)}` : ""}`}
                          </p>
                          <ol className="mt-2 flex gap-1" aria-hidden>
                            {STAGES.map((s, i) => <li key={s} className={`h-2 flex-1 rounded-full ${p.case!.status === "WON" || i < stageIndex ? "bg-brand-teal" : i === stageIndex ? "bg-accent-lime ring-1 ring-brand-teal" : "bg-ink/10"}`} />)}
                          </ol>
                          {p.case.captationEnds && p.case.status === "OPEN" && <p className="mt-1.5 text-xs text-ink/65">Acuerdo de captación{p.case.isExclusive ? " en exclusiva" : ""} vigente hasta el {fmtDate(p.case.captationEnds)}.</p>}
                        </div>
                      )}

                      <div className="mt-5 grid gap-5 md:grid-cols-3">
                        <div>
                          <h3 className="mb-1 text-sm font-semibold text-ink">Ofertas</h3>
                          {p.offers.length === 0 ? <p className="text-sm text-ink/65">Aún no hay ofertas.</p> : (
                            <ul className="divide-y divide-ink/10 text-sm">
                              {p.offers.map((o, i) => (
                                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                                  <span><span className="font-semibold text-ink">{money(o.amount, o.currency)}</span><span className="block text-xs text-ink/65">{OFFER_KIND[o.kind]} · {fmtDate(o.createdAt)}</span></span>
                                  <Badge tone={o.status === "ACCEPTED" ? "green" : o.status === "PENDING" ? "amber" : "neutral"}>{OFFER_STATUS[o.status]}</Badge>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <h3 className="mb-1 text-sm font-semibold text-ink">Visitas</h3>
                          {p.visits.length === 0 ? <p className="text-sm text-ink/65">Aún no hay visitas.</p> : (
                            <ul className="divide-y divide-ink/10 text-sm">
                              {p.visits.map((v, i) => (
                                <li key={i} className="py-1.5">
                                  <span className="text-ink">{fmtDateTime(v.scheduledAt)}</span> <span className="text-ink/65">· {VISIT_STATUS[v.status]}</span>
                                  {v.result && <span className="block text-xs text-ink/70">{v.result}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <h3 className="mb-1 text-sm font-semibold text-ink">Documentos</h3>
                          {p.documents.length === 0 ? <p className="text-sm text-ink/65">Sin contratos ni autorizaciones cargados.</p> : (
                            <ul className="divide-y divide-ink/10 text-sm">
                              {p.documents.map((d) => <li key={d.id} className="py-1.5"><a href={ownerDocumentUrl(d.id)} className="font-semibold text-link hover:underline">{d.name}</a><span className="block text-xs text-ink/65">{fmtDate(d.createdAt)} · descargar</span></li>)}
                            </ul>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
