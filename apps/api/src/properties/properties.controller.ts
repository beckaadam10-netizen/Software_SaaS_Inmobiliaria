import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { Public, Roles } from '../auth/auth.decorators.js';
import { CasesService } from '../cases/cases.service.js';
import { ActivityService } from '../common/activity.service.js';
import { assertCan, canAssign, current, ownScope } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { RefsService } from '../common/refs.service.js';
import { requestContext } from '../common/request-context.js';
import { currency, defined, money, optId, optInt, optNumber, optText, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';

const propertyType = z.enum(['HOUSE', 'APARTMENT', 'LAND', 'OFFICE', 'COMMERCIAL', 'WAREHOUSE', 'OTHER']);
const operation = z.enum(['SALE', 'RENT', 'ANTICRETICO']);
const status = z.enum(['AVAILABLE', 'RESERVED', 'NEGOTIATING', 'SOLD', 'RENTED', 'INACTIVE']);

const base = {
  title: text(),
  type: propertyType,
  operation,
  price: money,
  currency: currency.default('USD'),
  address: optText(),
  zone: optText(),
  city: optText(),
  latitude: optNumber(-90, 90),
  longitude: optNumber(-180, 180),
  areaM2: optNumber(0, 1e7),
  builtM2: optNumber(0, 1e7),
  bedrooms: optInt(0, 100),
  bathrooms: optInt(0, 100),
  parking: optInt(0, 100),
  floor: optInt(-10, 300),
  yearBuilt: optInt(1800, 2100),
  description: optText(10000),
  features: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  ownerId: optId,
  agentId: optId,
};
const createSchema = z.object({
  ...base,
  openCase: z.boolean().default(true),
  // Condiciones de la captación para el expediente que se abre junto con la propiedad.
  captation: z.object({
    isExclusive: z.boolean().optional(),
    commissionPct: optNumber(0, 100),
    captationEnds: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish()),
  }).optional(),
});
const updateSchema = z.object({
  ...base,
  title: text().optional(), type: propertyType.optional(), operation: operation.optional(),
  price: money.optional(), currency: currency.optional(),
  status: status.optional(), isPublished: z.boolean().optional(),
});

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGES = 20;

/** Comprueba la firma real del archivo, no solo el tipo que declara el navegador. */
function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  return false;
}

@Controller()
export class PropertiesController {
  private readonly uploadDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly refs: RefsService,
    private readonly activity: ActivityService,
    private readonly cases: CasesService,
    config: ConfigService,
  ) {
    this.uploadDir = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('properties')
  list(@Query() query: Record<string, string>) {
    const s = status.safeParse(query.status);
    const o = operation.safeParse(query.operation);
    const t = propertyType.safeParse(query.type);
    const q = query.q?.trim();
    return this.prisma.db.property.findMany({
      where: {
        ...ownScope(),
        ...(s.success ? { status: s.data } : {}),
        ...(o.success ? { operation: o.data } : {}),
        ...(t.success ? { type: t.data } : {}),
        ...(query.published === 'true' ? { isPublished: true } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { code: { contains: q } }, { zone: { contains: q } }, { address: { contains: q } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        agent: { select: { id: true, fullName: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { id: true } },
        _count: { select: { leads: true, visits: true } },
        // Para saber si ya tiene un expediente abierto (Nueva captación sobre una propiedad registrada).
        cases: { where: { status: 'OPEN' }, select: { id: true, code: true }, take: 1 },
      },
    });
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('properties/:id')
  async get(@Param('id') id: string) {
    const property = await this.prisma.db.property.findFirst({
      where: { id, ...ownScope() },
      include: {
        owner: { select: { id: true, fullName: true, phone: true } },
        agent: { select: { id: true, fullName: true } },
        images: { orderBy: { sortOrder: 'asc' }, select: { id: true, sortOrder: true } },
        priceHistory: { orderBy: { createdAt: 'desc' } },
        cases: { orderBy: { createdAt: 'desc' }, select: { id: true, code: true, status: true, currentStage: true } },
        _count: { select: { leads: true, visits: true, favorites: true } },
      },
    });
    if (!property) throw new NotFoundException('Propiedad no encontrada');
    return { ...property, timeline: await this.activity.forEntity('property', id) };
  }

  @Roles('ADMIN', 'AGENT')
  @Post('properties')
  async create(@Body() body: unknown) {
    const { openCase, captation, ...data } = validate(createSchema, body);
    const me = current();
    if (me.role === 'AGENT') assertCan('create_properties', 'Tu usuario no puede registrar propiedades. Pídeselo al administrador.');
    await this.limits.assertCanAdd('properties');
    const agentId = await this.refs.agentFor(data.agentId, me.userId);
    await this.refs.assert({ ownerId: data.ownerId, agentId });

    const slug = (requestContext.get()?.tenantSlug ?? 'prop').replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase() || 'PRP';
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await this.prisma.db.property.count();
      const code = `${slug}-${String(count + 1 + attempt).padStart(4, '0')}`;
      try {
        const property = await this.prisma.db.property.create({ data: { ...data, agentId, code, tenantId: me.tenantId } });
        await this.prisma.db.propertyPriceHistory.create({
          data: { tenantId: me.tenantId, propertyId: property.id, price: property.price, currency: property.currency },
        });
        await this.activity.log('property', property.id, `Propiedad ${code} registrada`);
        if (data.ownerId) {
          await this.prisma.db.contact.updateMany({ where: { id: data.ownerId, type: 'PROSPECT' }, data: { type: 'OWNER' } });
        }
        const opened = openCase ? await this.cases.createForProperty(property, captation ?? {}) : null;
        return { ...property, caseId: opened?.id ?? null, caseCode: opened?.code ?? null };
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    throw new BadRequestException('No se pudo generar el código de la propiedad');
  }

  @Roles('ADMIN', 'AGENT')
  @Patch('properties/:id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(updateSchema, body);
    const me = current();
    const before = await this.prisma.db.property.findFirst({ where: { id, ...ownScope() } });
    if (!before) throw new NotFoundException('Propiedad no encontrada');
    if (!canAssign()) delete data.agentId;
    else if (data.agentId) await this.refs.assertAssignable(data.agentId);
    await this.refs.assert({ ownerId: data.ownerId, agentId: data.agentId });
    if (before.status === 'INACTIVE' && data.status && data.status !== 'INACTIVE') await this.limits.assertCanAdd('properties');

    const next = { ...defined(data) } as Record<string, unknown>;
    const finalStatus = data.status ?? before.status;
    // Solo se publican propiedades que siguen en oferta.
    if (['SOLD', 'RENTED', 'INACTIVE'].includes(finalStatus)) next.isPublished = false;

    const property = await this.prisma.db.property.update({ where: { id }, data: next });

    if (Number(before.price) !== Number(property.price) || before.currency !== property.currency) {
      await this.prisma.db.propertyPriceHistory.create({
        data: { tenantId: me.tenantId, propertyId: id, price: property.price, currency: property.currency },
      });
      await this.activity.log('property', id, `Precio actualizado: ${before.currency} ${Number(before.price).toLocaleString('es-BO')} → ${property.currency} ${Number(property.price).toLocaleString('es-BO')}`);
    }
    if (before.status !== property.status) await this.activity.log('property', id, `Estado cambiado a ${property.status}`);
    if (before.isPublished !== property.isPublished) {
      await this.activity.log('property', id, property.isPublished ? 'Propiedad publicada en el portal' : 'Propiedad retirada del portal');
    }
    return property;
  }

  @Roles('ADMIN', 'AGENT')
  @Post('properties/:id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async upload(@Param('id') id: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    const me = current();
    const property = await this.prisma.db.property.findFirst({ where: { id, ...ownScope() }, select: { id: true } });
    if (!property) throw new NotFoundException('Propiedad no encontrada');
    if (!file) throw new BadRequestException('Selecciona una imagen');
    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext || !looksLikeImage(file.buffer, file.mimetype)) {
      throw new BadRequestException('Formato no admitido. Usa JPG, PNG o WebP');
    }
    const count = await this.prisma.db.propertyImage.count({ where: { propertyId: id } });
    if (count >= MAX_IMAGES) throw new BadRequestException(`Máximo ${MAX_IMAGES} imágenes por propiedad`);

    // Cada empresa guarda sus archivos en su propia carpeta.
    const dir = join(this.uploadDir, me.tenantId);
    await mkdir(dir, { recursive: true });
    const fileName = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, fileName), file.buffer);
    return this.prisma.db.propertyImage.create({
      data: { tenantId: me.tenantId, propertyId: id, fileName, mimeType: file.mimetype, sizeBytes: file.size, sortOrder: count },
      select: { id: true, sortOrder: true },
    });
  }

  @Roles('ADMIN', 'AGENT')
  @Delete('properties/:id/images/:imageId')
  async removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    const me = current();
    const property = await this.prisma.db.property.count({ where: { id, ...ownScope() } });
    const image = property ? await this.prisma.db.propertyImage.findFirst({ where: { id: imageId, propertyId: id } }) : null;
    if (!image) throw new NotFoundException('Imagen no encontrada');
    await this.prisma.db.propertyImage.delete({ where: { id: imageId } });
    await unlink(join(this.uploadDir, me.tenantId, image.fileName)).catch(() => undefined);
    return { id: imageId };
  }

  /** Fotos de propiedades: se sirven solo dentro del subdominio de su empresa. */
  @Public()
  @Get('images/:id')
  async image(@Param('id') id: string, @Res() res: Response) {
    const tenantId = requestContext.get()?.tenantId;
    const image = tenantId ? await this.prisma.db.propertyImage.findUnique({ where: { id } }) : null;
    if (!image || !/^[a-f0-9-]+\.(jpg|png|webp)$/.test(image.fileName)) throw new NotFoundException('Imagen no encontrada');
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(this.uploadDir, image.tenantId, image.fileName), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Imagen no encontrada', statusCode: 404 });
    });
  }
}
