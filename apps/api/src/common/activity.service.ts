import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { requestContext } from './request-context.js';

export type EntityType = 'property' | 'contact' | 'lead' | 'visit' | 'case' | 'commission';
export const ENTITY_TYPES = ['property', 'contact', 'case'] as const;

/** Timeline: historial legible de lo que pasa con cada entidad y cada expediente. */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entityType: EntityType, entityId: string, description: string, caseId?: string | null) {
    const ctx = requestContext.get();
    await this.prisma.db.activity.create({
      data: {
        tenantId: ctx!.tenantId!,
        entityType,
        entityId,
        description: description.slice(0, 500),
        caseId: caseId ?? (entityType === 'case' ? entityId : null),
        userId: ctx?.userId ?? null,
      },
    });
  }

  forEntity(entityType: EntityType, entityId: string) {
    return this.prisma.db.activity.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { fullName: true } } },
    });
  }

  forCase(caseId: string) {
    return this.prisma.db.activity.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { fullName: true } } },
    });
  }
}
