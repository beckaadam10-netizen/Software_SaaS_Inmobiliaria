import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { tap } from 'rxjs';
import { requestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';

const SENSITIVE = new Set(['password', 'adminPassword', 'passwordHash']);

function redact(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.has(k) ? '***' : v]),
  );
}

/** Auditoría global: registra cada cambio exitoso con usuario, acción y registro. */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request>();
    // Finanzas registra su propia auditoría, con valor anterior y nuevo.
    if (req.method === 'GET' || req.path.includes('/auth/') || req.path.includes('/public/') || req.path.includes('/finance/')) return next.handle();

    return next.handle().pipe(
      tap((result) => {
        const ctx = requestContext.get();
        if (!ctx?.userId) return;
        const entity = req.path.replace(/^\/api\//, '').split('/')[0] ?? '';
        const id = (result as { id?: string } | null)?.id ?? (req.params as Record<string, string>).id ?? null;
        this.prisma.platform.auditLog
          .create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              action: `${req.method} ${req.route?.path ?? req.path}`.slice(0, 100),
              entity: entity.slice(0, 100),
              entityId: typeof id === 'string' ? id : null,
              after: redact(req.body) as object | undefined,
            },
          })
          .catch((e) => this.logger.error(`No se pudo registrar la auditoría: ${e}`));
      }),
    );
  }
}
