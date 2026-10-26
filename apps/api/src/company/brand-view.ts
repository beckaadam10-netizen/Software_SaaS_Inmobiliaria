/** Datos públicos de la marca de una empresa: lo que ven su portal y su panel. */
export const BRAND_SELECT = {
  name: true, slug: true, phone: true, email: true, address: true, about: true, logoFile: true, primaryColor: true, buttonColor: true,
  whatsapp: true, website: true, facebook: true, instagram: true, tiktok: true, schedule: true, hideBrand: true,
} as const;

type BrandRow = { [K in keyof typeof BRAND_SELECT]: unknown } & { logoFile: string | null; hideBrand: boolean; plan: { features: unknown } };

export function brandView(t: BrandRow) {
  const { logoFile, hideBrand, plan, ...rest } = t;
  const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
  return {
    ...rest,
    // La dirección del logo cambia con cada archivo, para que el navegador no muestre uno viejo.
    logo: logoFile ? `/api/public/logo?v=${logoFile.slice(0, 8)}` : null,
    // Quitar la marca Soft_Inmo solo aplica si el plan incluye White Label.
    hideBrand: hideBrand && features.includes('white_label'),
  };
}
