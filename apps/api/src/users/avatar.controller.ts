import { BadRequestException, Controller, Delete, Get, NotFoundException, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Public, Roles } from '../auth/auth.decorators.js';
import { IMAGE_TYPES, MIME } from '../company/image-types.js';
import { current } from '../common/current.js';
import { AuditService } from '../common/audit.service.js';
import { requestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { avatarUrl } from './avatar.js';

type Upload = { buffer: Buffer; mimetype: string };

/** Foto de perfil: cada persona cambia la suya; el administrador, la de cualquiera de su empresa. */
@Controller()
export class AvatarController {
  private readonly dir: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.dir = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
  }

  private async save(userId: string, file?: Upload) {
    const me = current();
    if (!file) throw new BadRequestException('Selecciona una imagen');
    const kind = IMAGE_TYPES[file.mimetype];
    if (!kind || !kind.check(file.buffer)) throw new BadRequestException('Formato no admitido. Usa PNG, JPG o WebP de hasta 1 MB');
    const user = await this.prisma.db.user.findFirst({ where: { id: userId, role: { not: 'OWNER' } }, select: { id: true, avatarFile: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const folder = join(this.dir, me.tenantId, 'avatars');
    await mkdir(folder, { recursive: true });
    const avatarFile = `${randomUUID()}.${kind.ext}`;
    await writeFile(join(folder, avatarFile), file.buffer);
    await this.prisma.db.user.update({ where: { id: userId }, data: { avatarFile } });
    if (user.avatarFile) await unlink(join(folder, user.avatarFile)).catch(() => undefined);
    await this.audit.record('users', userId, 'Foto de perfil actualizada', null, null);
    return { avatar: avatarUrl({ id: userId, avatarFile }) };
  }

  private async remove(userId: string) {
    const me = current();
    const user = await this.prisma.db.user.findFirst({ where: { id: userId, role: { not: 'OWNER' } }, select: { avatarFile: true } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.db.user.update({ where: { id: userId }, data: { avatarFile: null } });
    if (user.avatarFile) await unlink(join(this.dir, me.tenantId, 'avatars', user.avatarFile)).catch(() => undefined);
    return { avatar: null };
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  mine(@UploadedFile() file?: Upload) {
    return this.save(current().userId, file);
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Delete('me/avatar')
  removeMine() {
    return this.remove(current().userId);
  }

  @Roles('ADMIN')
  @Post('users/:id/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1024 * 1024, files: 1 } }))
  forUser(@Param('id') id: string, @UploadedFile() file?: Upload) {
    return this.save(id, file);
  }

  @Roles('ADMIN')
  @Delete('users/:id/avatar')
  removeForUser(@Param('id') id: string) {
    return this.remove(id);
  }

  /** Pública: el portal muestra la foto del agente a cargo de cada propiedad. */
  @Public()
  @Get('public/avatar/:id')
  async show(@Param('id') id: string, @Res() res: Response) {
    const tenantId = requestContext.get()?.tenantId;
    const u = tenantId ? await this.prisma.platform.user.findFirst({ where: { id: id.slice(0, 40), tenantId, isActive: true, role: { in: ['ADMIN', 'AGENT'] } }, select: { avatarFile: true } }) : null;
    const ext = u?.avatarFile?.match(/^[a-f0-9-]+\.(png|jpg|webp)$/)?.[1];
    if (!u?.avatarFile || !ext) throw new NotFoundException('Foto no encontrada');
    res.setHeader('Content-Type', MIME[ext]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(this.dir, tenantId!, 'avatars', u.avatarFile), (err) => {
      if (err && !res.headersSent) res.status(404).json({ message: 'Foto no encontrada', statusCode: 404 });
    });
  }
}
