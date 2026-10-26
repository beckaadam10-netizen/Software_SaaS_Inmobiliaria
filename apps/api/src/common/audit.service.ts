import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { requestContext } from './request-context.js';

/** Convierte Decimals y fechas a valores simples para guardarlos como JSON. */
function plain(value: unknown): unknown {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

/** Auditoría con valor anterior y valor nuevo. La usan los módulos financieros en cada cambio. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  async record(entity: string, entityId: string, action: string, before: unknown, after: unknown) {
    const ctx = requestContext.get();
    try {
      await this.prisma.platform.auditLog.create({
        data: {
          tenantId: ctx?.tenantId ?? null, userId: ctx?.userId ?? null, action: action.slice(0, 100), entity: entity.slice(0, 100), entityId,
          before: (plain(before) ?? undefined) as object | undefined, after: (plain(after) ?? undefined) as object | undefined,
        },
      });
    } catch (e) {
      this.logger.error(`No se pudo registrar la auditoría: ${e}`);
    }
  }
}
