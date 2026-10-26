import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { join, resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { password, validate } from '../common/validate.js';
import { DAY } from '../insights/snapshot.js';
import { PrismaService } from '../prisma/prisma.service.js';

const accountSchema = z.object({ contactId: z.string().min(1).max(40), email: z.string().trim().toLowerCase().pipe(z.email()), password });

/**
 * Portal del propietario. Ve solo sus propiedades y lo que pasa con ellas;
 * nunca datos personales de los interesados ni las comisiones internas.
 */
@Controller('owner')
export class OwnerController {
  private readonly dir: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
  }

  @Roles('ADMIN')
  @Get('accounts')
  accounts() {
    return this.prisma.db.user.findMany({
      where: { role: 'OWNER' }, orderBy: { fullName: 'asc' },
      select: { id: true, email: true, fullName: true, isActive: true, lastLoginAt: true, contactId: true },
    });
  }

  /** El administrador da acceso al portal a un contacto propietario. */
  @Roles('ADMIN')
  @Post('accounts')
  async createAccount(@Body() body: unknown) {
    const data = validate(accountSchema, body);
    await this.limits.assertFeature('owner_portal', 'El portal del propietario');
    const contact = await this.prisma.db.contact.findUnique({ where: { id: data.contactId } });
    if (!contact) throw new NotFoundException('Contacto no encontrado');
    if (!(await this.prisma.db.property.count({ where: { ownerId: contact.id } }))) throw new BadRequestException('Este contacto no es propietario de ninguna propiedad');
    if (await this.prisma.db.user.count({ where: { contactId: contact.id } })) throw new BadRequestException('Este propietario ya tiene acceso al portal');
    if (await this.prisma.db.user.count({ where: { email: data.email } })) throw new BadRequestException('Ya existe un usuario con ese email en tu empresa');
    return this.prisma.db.user.create({
      data: { tenantId: current().tenantId, email: data.email, fullName: contact.fullName, phone: contact.phone, role: 'OWNER', contactId: contact.id, passwordHash: await bcrypt.hash(data.password, 12) },
      select: { id: true, email: true, fullName: true, isActive: true, contactId: true },
    });
  }

  /** El propietario descarga contratos, autorizaciones y recibos de sus propiedades. */
  @Roles('OWNER')
  @Get('documents/:id')
  async document(@Param('id') id: string, @Res() res: Response) {
    const me = current();
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: me.userId }, select: { contactId: true } });
    const doc = await this.prisma.db.document.findFirst({ where: { id, entityType: 'property', category: { in: ['CONTRACT', 'AUTHORIZATION', 'RECEIPT'] } } });
    const owns = doc && user.contactId ? await this.prisma.db.property.count({ where: { id: doc.entityId, ownerId: user.contactId } }) : 0;
    if (!doc || !owns || !/^[a-f0-9-]+\.[a-z]{3,4}$/.test(doc.fileName)) throw new NotFoundException('Documento no encontrado');
    const safe = doc.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 100) || 'documento';
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}.${doc.fileName.split('.').pop()}`)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(this.dir, doc.tenantId, 'docs', doc.fileName), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Documento no encontrado', statusCode: 404 });
    });
  }

  @Roles('OWNER')
  @Get('summary')
  async summary() {
    const me = current();
    const db = this.prisma.db;
    const user = await db.user.findUniqueOrThrow({ where: { id: me.userId }, select: { fullName: true, contactId: true } });
    const tenant = await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: me.tenantId }, select: { name: true } });
    if (!user.contactId) return { owner: user.fullName, company: tenant.name, properties: [] };
    const since = new Date(Date.now() - 30 * DAY);
    const properties = await db.property.findMany({
      where: { ownerId: user.contactId }, orderBy: { createdAt: 'desc' },
      select: {
        id: true, code: true, title: true, type: true, operation: true, status: true, isPublished: true, price: true, currency: true, zone: true, city: true, viewCount: true, createdAt: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true } },
        agent: { select: { fullName: true, phone: true } },
      },
    });
    const ids = properties.map((p) => p.id);
    const [leads, visits, cases, views30, docs] = await Promise.all([
      db.lead.findMany({ where: { propertyId: { in: ids } }, select: { propertyId: true, createdAt: true } }),
      db.visit.findMany({ where: { propertyId: { in: ids }, status: { not: 'CANCELLED' } }, orderBy: { scheduledAt: 'desc' }, select: { propertyId: true, scheduledAt: true, status: true, result: true } }),
      db.commercialCase.findMany({
        where: { propertyId: { in: ids } }, orderBy: { createdAt: 'desc' },
        select: {
          id: true, code: true, propertyId: true, status: true, currentStage: true, closedPrice: true, closedAt: true, captationEnds: true, isExclusive: true,
          offers: { orderBy: { createdAt: 'desc' }, select: { kind: true, amount: true, currency: true, status: true, createdAt: true } },
        },
      }),
      db.propertyStat.groupBy({ by: ['propertyId'], where: { propertyId: { in: ids }, day: { gte: since.toISOString().slice(0, 10) } }, _sum: { views: true } }),
      db.document.findMany({ where: { entityType: 'property', entityId: { in: ids }, category: { in: ['CONTRACT', 'AUTHORIZATION', 'RECEIPT'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, entityId: true, name: true, category: true, createdAt: true } }),
    ]);
    return {
      owner: user.fullName,
      company: tenant.name,
      properties: properties.map((p) => {
        const c = cases.find((x) => x.propertyId === p.id);
        const pl = leads.filter((l) => l.propertyId === p.id);
        const pv = visits.filter((v) => v.propertyId === p.id);
        const { images, ...rest } = p;
        return {
          ...rest, price: Number(p.price), imageId: images[0]?.id ?? null,
          views: p.viewCount, views30: views30.find((v) => v.propertyId === p.id)?._sum.views ?? 0,
          leads: pl.length, leads30: pl.filter((l) => l.createdAt >= since).length,
          visitsDone: pv.filter((v) => v.status === 'DONE').length,
          // Las visitas se muestran sin el nombre del interesado.
          visits: pv.slice(0, 6).map((v) => ({ scheduledAt: v.scheduledAt, status: v.status, result: v.status === 'DONE' ? v.result : null })),
          case: c ? { code: c.code, status: c.status, stage: c.currentStage, closedPrice: c.closedPrice == null ? null : Number(c.closedPrice), closedAt: c.closedAt, captationEnds: c.captationEnds, isExclusive: c.isExclusive } : null,
          offers: (c?.offers ?? []).map((o) => ({ ...o, amount: Number(o.amount) })),
          documents: docs.filter((d) => d.entityId === p.id).map((d) => ({ id: d.id, name: d.name, category: d.category, createdAt: d.createdAt })),
        };
      }),
    };
  }
}
