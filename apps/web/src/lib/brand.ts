import type { CSSProperties } from "react";

/** Colores de la empresa como variables CSS: reemplazan a los de Soft_Inmo dentro del elemento que las recibe. */
export function brandStyle(brand?: { primaryColor: string | null; buttonColor: string | null } | null): CSSProperties {
  return {
    ...(brand?.primaryColor ? { "--color-brand-deep": brand.primaryColor } : {}),
    ...(brand?.buttonColor ? { "--color-brand-teal": brand.buttonColor } : {}),
  } as CSSProperties;
}
