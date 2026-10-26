/** Subdominios que no son empresas. */
const RESERVED = new Set(['admin', 'www', 'app', 'api']);

/**
 * Extrae el slug de la empresa a partir del host.
 *   abc.softinmo.com  -> "abc"      abc.localhost:3000 -> "abc"
 *   admin.softinmo.com -> null      localhost:3000     -> null
 * Devuelve undefined si el host no pertenece a la plataforma.
 */
export function tenantSlugFromHost(host: string | undefined, appDomain: string): string | null | undefined {
  if (!host) return undefined;
  const hostname = host.trim().toLowerCase().split(':')[0];
  if (!hostname) return undefined;

  let prefix: string;
  if (hostname === 'localhost' || hostname === appDomain) {
    return null;
  } else if (hostname.endsWith('.localhost')) {
    prefix = hostname.slice(0, -'.localhost'.length);
  } else if (hostname.endsWith(`.${appDomain}`)) {
    prefix = hostname.slice(0, -(appDomain.length + 1));
  } else {
    return undefined;
  }

  if (RESERVED.has(prefix)) return null;
  // Un solo nivel y solo caracteres válidos de subdominio.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix)) return undefined;
  return prefix;
}
