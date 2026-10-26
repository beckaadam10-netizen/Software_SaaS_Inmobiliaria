/**
 * Permisos puntuales por usuario. El rol da un punto de partida y el administrador
 * puede encender o apagar cada permiso para una persona. Funciones puras.
 */
export interface PermissionDef { key: string; role: 'AGENT' | 'ACCOUNTANT'; label: string; help: string; default: boolean }

export const PERMISSIONS: PermissionDef[] = [
  { key: 'view_all', role: 'AGENT', label: 'Ver toda la empresa', help: 'Ve propiedades, clientes y operaciones de todos los agentes, no solo los suyos.', default: false },
  { key: 'create_properties', role: 'AGENT', label: 'Registrar propiedades', help: 'Puede cargar propiedades nuevas.', default: true },
  { key: 'manage_campaigns', role: 'AGENT', label: 'Gestionar campañas', help: 'Crea y edita campañas de marketing.', default: false },
  { key: 'branch_manager', role: 'AGENT', label: 'Jefe de sucursal', help: 'Ve todo lo de su sucursal y asigna propiedades, clientes, visitas y tareas a los agentes de su sucursal.', default: false },
  { key: 'export_reports', role: 'AGENT', label: 'Exportar reportes', help: 'Descarga reportes comerciales en Excel, PDF o CSV. Requiere "Ver toda la empresa".', default: false },
  { key: 'manage_finance', role: 'ACCOUNTANT', label: 'Registrar en finanzas', help: 'Registra cobros, pagos, facturas y asientos. Sin este permiso solo consulta.', default: true },
];

/** Permisos efectivos: los del rol con los cambios hechos para esa persona. */
export function resolvePermissions(role: string, overrides: unknown): string[] {
  const set = (overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {}) as Record<string, unknown>;
  return PERMISSIONS.filter((p) => p.role === role && (typeof set[p.key] === 'boolean' ? set[p.key] : p.default)).map((p) => p.key);
}

/** Limpia lo que envía el administrador: solo claves del rol y valores sí/no; guarda solo lo que difiere del rol. */
export function cleanOverrides(role: string, input: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of PERMISSIONS.filter((x) => x.role === role)) {
    const v = input[p.key];
    if (typeof v === 'boolean' && v !== p.default) out[p.key] = v;
  }
  return out;
}
