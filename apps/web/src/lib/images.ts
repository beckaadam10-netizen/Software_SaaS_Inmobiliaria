/** Dirección de una foto de propiedad. */
export const imageUrl = (id: string) => `/api/images/${id}`;
/** Dirección de descarga de un documento privado (exige sesión). */
export const documentUrl = (id: string) => `/api/documents/${id}/download`;
/** Dirección pública de una propiedad, con la fuente de tráfico para las estadísticas. */
export function publicUrl(code: string, src?: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/p/${code}${src ? `?src=${src}` : ""}`;
}
/** Dirección de descarga de un reporte. */
export function reportUrl(id: string, format: string, from?: string, to?: string) {
  const q = new URLSearchParams({ format, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  return `/api/reports/${id}?${q}`;
}
/** Dirección del PDF de una factura (exige sesión). */
export const invoicePdfUrl = (id: string) => `/api/invoices/${id}/pdf`;
/** Exportación de los libros IVA. */
export const taxBookUrl = (month: string, book: "sales" | "purchases", format: string) => `/api/tax/books/export?month=${month}&book=${book}&format=${format}`;
/** Documento que el propietario descarga desde su portal. */
export const ownerDocumentUrl = (id: string) => `/api/owner/documents/${id}`;
/** Documento a firmar, visto desde el enlace de firma. */
export const signDocumentUrl = (token: string) => `/api/public/sign/${token}/document`;
