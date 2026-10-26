import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentCard, type PublicAgent } from "@/components/AgentCard";
import { FavoriteButton } from "@/components/FavoriteButton";
import { InterestForm } from "@/components/InterestForm";
import { ShareLinks } from "@/components/PortalExtras";
import { PropertyArea } from "@/components/PortalMap";
import { PublicChrome, type Site } from "@/components/PublicChrome";
import { money, OPERATION, PROPERTY_TYPE } from "@/lib/labels";
import { serverGet } from "@/lib/server-api";
import { imageUrl } from "@/lib/images";

type Detail = {
  code: string; title: string; type: string; operation: string; price: string; currency: string; zone: string | null; city: string | null;
  areaM2: number | null; builtM2: number | null; bedrooms: number | null; bathrooms: number | null; parking: number | null; floor: number | null;
  yearBuilt: number | null; description: string | null; features: string[] | null; images: Array<{ id: string }>;
  agent: PublicAgent | null;
  location: { lat: number; lng: number; radius: number } | null;
};
type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ src?: string }> };
const SOURCES = ["qr", "whatsapp", "facebook", "instagram", "tiktok"];

const safeCode = (code: string) => encodeURIComponent(code.slice(0, 20));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  // Solo metadatos: no debe contar como visualización, así que se consulta el listado.
  const list = await serverGet<Array<{ code: string; title: string; zone: string | null }>>("/public/properties");
  const p = list?.find((x) => x.code === code.toUpperCase());
  return p ? { title: `${p.title}${p.zone ? ` · ${p.zone}` : ""}` } : { title: "Propiedad no encontrada" };
}

export default async function PublicProperty({ params, searchParams }: Props) {
  const { code } = await params;
  const { src } = await searchParams;
  // La fuente (QR, WhatsApp, redes) alimenta las estadísticas de la publicación.
  const source = src && SOURCES.includes(src.toLowerCase()) ? `?src=${src.toLowerCase()}` : "";
  const [site, p] = await Promise.all([serverGet<Site>("/public/site"), serverGet<Detail>(`/public/properties/${safeCode(code)}${source}`)]);
  if (!site || !p) notFound();

  const facts: Array<[string, string | number | null]> = [
    ["Habitaciones", p.bedrooms], ["Baños", p.bathrooms], ["Parqueos", p.parking],
    ["Terreno", p.areaM2 != null ? `${p.areaM2} m²` : null], ["Construcción", p.builtM2 != null ? `${p.builtM2} m²` : null],
    ["Piso", p.floor], ["Año", p.yearBuilt],
  ];
  const shown = facts.filter(([, v]) => v != null);
  const whatsapp = p.agent?.phone ? `https://wa.me/${p.agent.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, me interesa la propiedad ${p.code}: ${p.title}`)}` : null;

  return (
    <PublicChrome site={site}>
      <Link href="/" className="text-sm font-medium text-link hover:underline">← Todas las propiedades</Link>
      <div className="mt-3 grid gap-8 lg:grid-cols-[1fr_360px]">
        <article className="min-w-0">
          {p.images.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {p.images.slice(0, 5).map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={imageUrl(img.id)} alt={`${p.title}, foto ${i + 1}`} className={`w-full rounded-2xl object-cover ${i === 0 ? "aspect-[16/9] sm:col-span-2" : "aspect-[4/3]"}`} />
              ))}
            </div>
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center rounded-2xl bg-brand-deep/10 text-ink/60">Fotos próximamente</div>
          )}

          <p className="mt-6 text-sm font-medium text-ink/70">{p.code} · {PROPERTY_TYPE[p.type]} en {OPERATION[p.operation].toLowerCase()}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">{p.title}</h1>
          <p className="mt-1 text-ink/75">{[p.zone, p.city].filter(Boolean).join(", ")}</p>
          <p className="mt-3 text-3xl font-bold text-brand-ink">{money(p.price, p.currency)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <FavoriteButton code={p.code} />
            <ShareLinks code={p.code} title={p.title} />
          </div>

          {shown.length > 0 && (
            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {shown.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink/10">
                  <dd className="text-lg font-bold text-ink">{value}</dd>
                  <dt className="text-xs text-ink/70">{label}</dt>
                </div>
              ))}
            </dl>
          )}
          {p.description && (
            <>
              <h2 className="mt-8 text-lg font-semibold text-ink">Descripción</h2>
              <p className="mt-2 whitespace-pre-line leading-relaxed text-ink/85">{p.description}</p>
            </>
          )}
          {p.features && p.features.length > 0 && (
            <>
              <h2 className="mt-8 text-lg font-semibold text-ink">Características</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {p.features.map((f) => <li key={f} className="rounded-full bg-brand-teal/12 px-3 py-1 text-sm font-medium text-brand-ink">{f}</li>)}
              </ul>
            </>
          )}
          <PropertyArea code={p.code} location={p.location} />
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-ink/10">
            <h2 className="mb-4 text-lg font-semibold text-ink">¿Te interesa esta propiedad?</h2>
            <InterestForm code={p.code} />
          </section>
          {p.agent && <AgentCard agent={p.agent} whatsapp={whatsapp} />}
        </aside>
      </div>
    </PublicChrome>
  );
}
