import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { resolvePermissions } from '../common/permissions.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Request } from 'express';
import { requestContext } from '../common/request-context.js';
import type { UserRole } from '../generated/prisma/enums.js';
import { IS_PUBLIC, ROLES } from './auth.decorators.js';
import { readCookie, SESSION_COOKIE } from './cookies.js';

export interface SessionPayload {
  sub: string;
  tenantId: string | null;
  role: UserRole;
}

/** Guard global: exige sesión válida, del mismo tenant, y el rol requerido. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException('Inicia sesión para continuar');

    let payload: SessionPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException('Sesión vencida o inválida');
    }

    const ctx = requestContext.get();
    // Una sesión de una empresa no sirve en el subdominio de otra.
    if (!ctx || payload.tenantId !== ctx.tenantId) {
      throw new UnauthorizedException('Sesión no válida para esta empresa');
    }
    // El usuario se lee en cada petición: desactivarlo o cambiar sus permisos tiene efecto inmediato.
    const user = await this.prisma.platform.user.findFirst({ where: { id: payload.sub, tenantId: payload.tenantId, isActive: true }, select: { role: true, permissions: true, branchId: true } });
    if (!user) throw new UnauthorizedException('Sesión vencida o inválida');
    ctx.userId = payload.sub;
    ctx.role = user.role;
    ctx.permissions = resolvePermissions(user.role, user.permissions);
    ctx.userBranchId = user.branchId;

    // Vista por sucursal: el panel envía la sucursal elegida; se usa solo si es de esta empresa.
    const branch = req.headers['x-branch'];
    if (typeof branch === 'string' && branch && ctx.tenantId && user.role !== 'OWNER') {
      ctx.branchId = (await this.prisma.platform.branch.count({ where: { id: branch, tenantId: ctx.tenantId } })) ? branch : null;
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    // Contador sin "registrar en finanzas": solo consulta.
    if (user.role === 'ACCOUNTANT' && req.method !== 'GET' && /^\/api\/(finance|invoices|accounting|bank|tax)\//.test(req.path + '/') && !ctx.permissions.includes('manage_finance')) {
      throw new ForbiddenException('Tu usuario solo puede consultar finanzas. Pide al administrador el permiso para registrar.');
    }
    return true;
  }
}
