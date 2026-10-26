import { ForbiddenException, Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { tenantSlugFromHost } from './host.js';

/** Resuelve la empresa por subdominio y abre el contexto de la petición. */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // El frontend (Next.js) reenvía el host original en x-forwarded-host.
    const forwarded = req.headers['x-forwarded-host'];
    const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.headers.host;
    const appDomain = this.config.get<string>('APP_DOMAIN', 'softinmo.com');
    const slug = tenantSlugFromHost(host, appDomain);

    if (slug === undefined) {
      // No es un subdominio de la plataforma: puede ser el dominio propio (verificado) de una empresa.
      const hostname = (host ?? '').trim().toLowerCase().split(':')[0];
      const own = hostname
        ? await this.prisma.platform.tenantDomain.findFirst({ where: { domain: hostname, verifiedAt: { not: null } }, select: { tenant: { select: { id: true, slug: true, status: true } } } })
        : null;
      if (!own) throw new NotFoundException('Dominio no reconocido');
      if (own.tenant.status !== 'ACTIVE') throw new ForbiddenException('La cuenta de esta empresa está suspendida');
      return requestContext.run({ tenantId: own.tenant.id, tenantSlug: own.tenant.slug }, next);
    }
    if (slug === null) {
      return requestContext.run({ tenantId: null, tenantSlug: null }, next);
    }

    const tenant = await this.prisma.platform.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, status: true },
    });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');
    if (tenant.status !== 'ACTIVE') throw new ForbiddenException('La cuenta de esta empresa está suspendida');

    return requestContext.run({ tenantId: tenant.id, tenantSlug: tenant.slug }, next);
  }
}
