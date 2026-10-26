import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { Public, Roles } from '../auth/auth.decorators.js';
import { current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { requestContext } from '../common/request-context.js';
import { defined, optEmail, optText, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { colorError, normalizeDomain } from './brand.js';
import { BRAND_SELECT, brandView } from './brand-view.js';
import { IMAGE_TYPES as LOGO_TYPES, MIME } from './image-types.js';

const color = z.preprocess((v) => (v === '' ? null : v), z.string().trim().nullish());
const link = z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(190).regex(/^https:\/\/[^\s]+$/, 'Usa una dirección que empiece con https://').nullish());
const updateSchema = z.object({
  name: text().optional(), phone: optText(30), whatsapp: optText(30), email: optEmail, address: optText(), about: optText(2000), schedule: optText(),
  website: link, facebook: link, instagram: link, tiktok: link, legalName: optText(), taxId: optText(30),
  primaryColor: color, buttonColor: color, hideBrand: z.boolean().optional(),
});
/** Datos, marca y dominios propios de la empresa (White Label). */
@Controller()
export class CompanyController {
  private readonly dir: string;
  private readonly appDomain: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
    this.appDomain = config.get<string>('APP_DOMAIN', 'softinmo.com');
  }

  private async tenant() {
    const t = await this.prisma.platform.tenant.findUniqueOrThrow({
      where: { id: current().tenantId },
      select: { ...BRAND_SELECT, legalName: true, taxId: true, hideBrand: true, plan: { select: { features: true } }, domains: { orderBy: { createdAt: 'asc' } } },
    });
    const features = t.plan.features as string[];
    return {
      ...brandView(t), legalName: t.legalName, taxId: t.taxId, wantsHideBrand: t.hideBrand,
      can: { whiteLabel: features.includes('white_label'), customDomain: features.includes('custom_domain') },
      domains: t.domains.map((d) => ({ id: d.id, domain: d.domain, verified: !!d.verifiedAt, record: { type: 'TXT', name: `_softinmo.${d.domain}`, value: d.verifyToken } })),
    };
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('company')
  get() {
    return this.tenant();
  }

  @Roles('ADMIN')
  @Patch('company')
  async update(@Body() body: unknown) {
    const data = validate(updateSchema, body);
    for (const key of ['primaryColor', 'buttonColor'] as const) {
      const error = colorError(data[key]);
      if (error) throw new BadRequestException(error);
      if (data[key]) data[key] = data[key]!.toLowerCase();
    }
    if (data.hideBrand) await this.limits.assertFeature('white_label', 'Quitar la marca Soft_Inmo');
    await this.prisma.platform.tenant.update({ where: { id: current().tenantId }, data: defined(data) });
    return this.tenant();
  }

  @Roles('ADMIN')
  @Post('company/logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  async logo(@UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    const me = current();
    if (!file) throw new BadRequestException('Selecciona una imagen');
    const kind = LOGO_TYPES[file.mimetype];
    if (!kind || !kind.check(file.buffer)) throw new BadRequestException('Formato no admitido. Usa PNG, JPG o WebP de hasta 1 MB');
    const folder = join(this.dir, me.tenantId);
    await mkdir(folder, { recursive: true });
    const before = await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: me.tenantId }, select: { logoFile: true } });
    const logoFile = `${randomUUID()}.${kind.ext}`;
    await writeFile(join(folder, logoFile), file.buffer);
    await this.prisma.platform.tenant.update({ where: { id: me.tenantId }, data: { logoFile } });
    if (before.logoFile) await unlink(join(folder, before.logoFile)).catch(() => undefined);
    return this.tenant();
  }

  @Roles('ADMIN')
  @Delete('company/logo')
  async removeLogo() {
    const me = current();
    const before = await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: me.tenantId }, select: { logoFile: true } });
    await this.prisma.platform.tenant.update({ where: { id: me.tenantId }, data: { logoFile: null } });
    if (before.logoFile) await unlink(join(this.dir, me.tenantId, before.logoFile)).catch(() => undefined);
    return this.tenant();
  }

  @Public()
  @Get('public/logo')
  async publicLogo(@Res() res: Response) {
    const tenantId = requestContext.get()?.tenantId;
    const t = tenantId ? await this.prisma.platform.tenant.findUnique({ where: { id: tenantId }, select: { logoFile: true } }) : null;
    const ext = t?.logoFile?.match(/^[a-f0-9-]+\.(png|jpg|webp)$/)?.[1];
    if (!t?.logoFile || !ext) throw new NotFoundException('Logo no encontrado');
    res.setHeader('Content-Type', MIME[ext]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(this.dir, tenantId!, t.logoFile), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Logo no encontrado', statusCode: 404 });
    });
  }

  // ---------- Dominios propios ----------
  @Roles('ADMIN')
  @Post('company/domains')
  async addDomain(@Body() body: unknown) {
    const { domain: raw } = validate(z.object({ domain: text(200) }), body);
    await this.limits.assertFeature('custom_domain', 'El dominio personalizado');
    const domain = normalizeDomain(raw, this.appDomain);
    if (!domain) throw new BadRequestException('Escribe un dominio válido, por ejemplo www.tuinmobiliaria.com');
    if (await this.prisma.platform.tenantDomain.count({ where: { domain } })) throw new BadRequestException('Ese dominio ya está registrado');
    if ((await this.prisma.platform.tenantDomain.count({ where: { tenantId: current().tenantId } })) >= 3) throw new BadRequestException('Puedes registrar hasta 3 dominios');
    await this.prisma.platform.tenantDomain.create({ data: { tenantId: current().tenantId, domain, verifyToken: `softinmo-verify-${randomBytes(16).toString('hex')}` } });
    return this.tenant();
  }

  /** Comprueba el registro TXT en el DNS del dominio. Hasta que no esté, el dominio no se usa. */
  @Roles('ADMIN')
  @Post('company/domains/:id/verify')
  async verify(@Param('id') id: string) {
    const d = await this.prisma.platform.tenantDomain.findFirst({ where: { id, tenantId: current().tenantId } });
    if (!d) throw new NotFoundException('Dominio no encontrado');
    const records = await resolveTxt(`_softinmo.${d.domain}`).catch(() => [] as string[][]);
    if (!records.some((r) => r.join('') === d.verifyToken)) {
      throw new BadRequestException(`Aún no encontramos el registro TXT en _softinmo.${d.domain}. Los cambios de DNS pueden tardar hasta 24 horas.`);
    }
    await this.prisma.platform.tenantDomain.update({ where: { id }, data: { verifiedAt: new Date() } });
    return this.tenant();
  }

  @Roles('ADMIN')
  @Delete('company/domains/:id')
  async removeDomain(@Param('id') id: string) {
    const { count } = await this.prisma.platform.tenantDomain.deleteMany({ where: { id, tenantId: current().tenantId } });
    if (!count) throw new NotFoundException('Dominio no encontrado');
    return this.tenant();
  }
}
