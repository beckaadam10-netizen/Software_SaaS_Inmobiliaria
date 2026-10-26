import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { current, ownScope } from '../common/current.js';
import { text, validate } from '../common/validate.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const entityType = z.enum(['case', 'property', 'contact']);
const uploadSchema = z.object({
  entityType,
  entityId: z.string().min(1).max(40),
  category: z.enum(['TITLE', 'CONTRACT', 'ID', 'AUTHORIZATION', 'RECEIPT', 'PLAN', 'OTHER']).default('OTHER'),
  name: text(150),
});

const zip = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
/** Tipos admitidos, con comprobación de la firma real del archivo. */
const TYPES: Record<string, { ext: string; check: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', check: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  'image/jpeg': { ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', check: zip },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', check: zip },
};

/**
 * Documentos de expedientes, propiedades y contactos. Son siempre privados:
 * solo se descargan con sesión y con acceso al registro al que pertenecen.
 */
@Controller('documents')
export class DocumentsController {
  private readonly dir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
  }

  /** Comprueba que el usuario puede ver el registro dueño del documento. Devuelve su expediente y agente. */
  private async access(type: z.infer<typeof entityType>, id: string): Promise<{ caseId: string | null; agentId: string | null }> {
    const db = this.prisma.db;
    if (type === 'case') {
      const c = await db.commercialCase.findFirst({ where: { id, ...ownScope() }, select: { id: true, agentId: true } });
      if (c) return { caseId: c.id, agentId: c.agentId };
    } else if (type === 'property') {
      const p = await db.property.findFirst({ where: { id, ...ownScope() }, select: { agentId: true } });
      if (p) return { caseId: null, agentId: p.agentId };
    } else {
      const c = await db.contact.findFirst({ where: { id, ...ownScope('assignedAgentId') }, select: { assignedAgentId: true } });
      if (c) return { caseId: null, agentId: c.assignedAgentId };
    }
    throw new NotFoundException('No se encontró el registro del documento');
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get()
  async list(@Query('entityType') type: string, @Query('entityId') entityId: string) {
    const parsed = validate(entityType, type);
    await this.access(parsed, entityId);
    return this.prisma.db.document.findMany({
      where: { entityType: parsed, entityId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, category: true, name: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedBy: { select: { fullName: true } } },
    });
  }

  @Roles('ADMIN', 'AGENT')
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async upload(@Body() body: unknown, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    const data = validate(uploadSchema, body);
    const me = current();
    const owner = await this.access(data.entityType, data.entityId);
    if (!file) throw new BadRequestException('Selecciona un archivo');
    const kind = TYPES[file.mimetype];
    if (!kind || !kind.check(file.buffer)) throw new BadRequestException('Formato no admitido. Usa PDF, JPG, PNG, Word o Excel');

    const folder = join(this.dir, me.tenantId, 'docs');
    await mkdir(folder, { recursive: true });
    const fileName = `${randomUUID()}.${kind.ext}`;
    await writeFile(join(folder, fileName), file.buffer);
    const doc = await this.prisma.db.document.create({
      data: { ...data, tenantId: me.tenantId, caseId: owner.caseId, fileName, mimeType: file.mimetype, sizeBytes: file.size, uploadedById: me.userId },
      select: { id: true, name: true },
    });
    if (data.entityType !== 'contact') await this.activity.log(data.entityType, data.entityId, `Documento agregado: ${data.name}`);
    if (owner.caseId) {
      await this.notifications.notify([owner.agentId], { type: 'document', title: `Nuevo documento: ${data.name}`, link: `/app/gestion/${owner.caseId}` });
    }
    return doc;
  }

  private async find(id: string) {
    const doc = await this.prisma.db.document.findUnique({ where: { id } });
    if (!doc || !/^[a-f0-9-]+\.[a-z]{3,4}$/.test(doc.fileName)) throw new NotFoundException('Documento no encontrado');
    await this.access(validate(entityType, doc.entityType), doc.entityId);
    return doc;
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const doc = await this.find(id);
    const ext = doc.fileName.split('.').pop();
    const safe = doc.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 100) || 'documento';
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${safe}.${ext}`)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(this.dir, doc.tenantId, 'docs', doc.fileName), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Documento no encontrado', statusCode: 404 });
    });
  }

  @Roles('ADMIN', 'AGENT')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const doc = await this.find(id);
    await this.prisma.db.document.delete({ where: { id } });
    await unlink(join(this.dir, doc.tenantId, 'docs', doc.fileName)).catch(() => undefined);
    if (doc.entityType !== 'contact') await this.activity.log(doc.entityType as 'case' | 'property', doc.entityId, `Documento eliminado: ${doc.name}`);
    return { id };
  }
}
