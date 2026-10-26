import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserRole } from '../generated/prisma/enums.js';

/** Datos de la petición en curso: qué empresa y qué usuario. */
export interface RequestContext {
  /** Empresa resuelta por subdominio. null = zona de plataforma (superadmin). */
  tenantId: string | null;
  tenantSlug: string | null;
  userId?: string;
  role?: UserRole;
  /** Permisos efectivos del usuario (rol + cambios del administrador). */
  permissions?: string[];
  /** Sucursal elegida para ver el panel; null = toda la empresa. */
  branchId?: string | null;
  /** Sucursal a la que pertenece el usuario. */
  userBranchId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContext = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
};
