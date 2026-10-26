import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMIN')
  @Get()
  list() {
    return this.prisma.db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { fullName: true } } },
    });
  }
}
