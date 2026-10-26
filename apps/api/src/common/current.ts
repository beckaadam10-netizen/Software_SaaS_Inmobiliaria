import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/enums.js';
import { requestContext } from './request-context.js';

export interface CurrentUser {
  tenantId: string;
  userId: string;
  role: UserRole;
}

/** Usuario y empresa de la petición. Falla si la ruta no es de una empresa. */
export function current(): CurrentUser {
  const ctx = requestContext.get();
  if (!ctx?.userId || !ctx.role) throw new UnauthorizedException('Inicia sesión para continuar');
  if (!ctx.tenantId) throw new ForbiddenException('Esta sección pertenece al panel de una empresa');
  return { tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role };
}

/** ¿Tiene el usuario este permiso? El administrador los tiene todos. */
export function can(permission: string): boolean {
  const ctx = requestContext.get();
  return ctx?.role === 'ADMIN' || !!ctx?.permissions?.includes(permission);
}

/** Lanza 403 si falta el permiso. */
export function assertCan(permission: string, message = 'No tienes permiso para esta acción') {
  if (!can(permission)) throw new ForbiddenException(message);
}

/** Jefe de sucursal: agente con el permiso y con sucursal asignada. Su vista es siempre su sucursal. */
export function managedBranch(): string | null {
  const ctx = requestContext.get();
  return ctx?.role === 'AGENT' && !can('view_all') && can('branch_manager') && ctx.userBranchId ? ctx.userBranchId : null;
}

/** El agente sin "ver toda la empresa" ni jefatura de sucursal solo ve lo que tiene asignado. */
export function restrictedAgent(): boolean {
  const user = current();
  return user.role === 'AGENT' && !can('view_all') && !managedBranch();
}

/** Sucursal de la vista: la del jefe de sucursal, o la elegida en el panel. */
export function currentBranch(): string | null {
  return managedBranch() ?? requestContext.get()?.branchId ?? null;
}

/** Puede asignar registros a otras personas: el administrador (a cualquiera) y el jefe (a su sucursal). */
export function canAssign(): boolean {
  return current().role === 'ADMIN' || !!managedBranch();
}

/**
 * Filtro a mezclar en el `where`: el agente restringido ve solo lo suyo; si se eligió una sucursal,
 * se ve solo lo de los agentes de esa sucursal. `field` es el campo del agente (agentId o assignedAgentId).
 */
export function ownScope(field = 'agentId'): Record<string, unknown> {
  const user = current();
  if (restrictedAgent()) return { [field]: user.userId };
  const branchId = currentBranch();
  return branchId ? { [field.replace(/Id$/, '')]: { branchId } } : {};
}
