import { Injectable, Logger } from '@nestjs/common';
import { requestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface Notice {
  type: 'lead' | 'visit' | 'offer' | 'reservation' | 'document' | 'referral' | 'case' | 'task' | 'automation' | 'finance';
  title: string;
  body?: string;
  link?: string;
}

/** Avisos dentro del sistema. Email, push y WhatsApp se conectan aquí en fases siguientes. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');
  constructor(private readonly prisma: PrismaService) {}

  /** Avisa a los usuarios indicados, salvo a quien hizo la acción. Nunca interrumpe la operación principal. */
  async notify(userIds: Array<string | null | undefined>, notice: Notice) {
    const ctx = requestContext.get();
    if (!ctx?.tenantId) return;
    const targets = [...new Set(userIds.filter((id): id is string => !!id && id !== ctx.userId))];
    if (!targets.length) return;
    try {
      // Solo usuarios activos de esta empresa.
      const users = await this.prisma.db.user.findMany({ where: { id: { in: targets }, isActive: true }, select: { id: true } });
      if (!users.length) return;
      await this.prisma.db.notification.createMany({
        data: users.map((u) => ({
          tenantId: ctx.tenantId!, userId: u.id, type: notice.type, title: notice.title.slice(0, 190),
          body: notice.body?.slice(0, 500) ?? null, link: notice.link ?? null,
        })),
      });
    } catch (e) {
      this.logger.error(`No se pudo crear la notificación: ${e}`);
    }
  }

  async admins(): Promise<string[]> {
    const rows = await this.prisma.db.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
    return rows.map((r) => r.id);
  }
}
