import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { current } from '../common/current.js';
import { validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';

const readSchema = z.object({ ids: z.array(z.string().max(40)).max(100).optional() });

@Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    const { userId } = current();
    const [items, unread] = await Promise.all([
      this.prisma.db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 40 }),
      this.prisma.db.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  /** Marca como leídas las indicadas, o todas si no se indica ninguna. */
  @Post('read')
  @HttpCode(200)
  async read(@Body() body: unknown) {
    const { ids } = validate(readSchema, body);
    const { userId } = current();
    await this.prisma.db.notification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
