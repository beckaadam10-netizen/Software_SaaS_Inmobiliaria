import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { current, managedBranch } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { cleanOverrides, PERMISSIONS, resolvePermissions } from '../common/permissions.js';
import { defined, optId, optText, password, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { avatarUrl } from './avatar.js';

const roles = z.enum(['ADMIN', 'AGENT', 'ACCOUNTANT']);
const createSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  fullName: text(),
  role: roles,
  phone: optText(30),
  branchId: optId,
  password,
});
const updateSchema = z.object({
  fullName: text().optional(),
  role: roles.optional(),
  phone: optText(30),
  isActive: z.boolean().optional(),
  branchId: optId,
  permissions: z.record(z.string(), z.boolean()).optional(),
  password: password.optional(),
});

const publicFields = {
  id: true, email: true, fullName: true, role: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true, permissions: true, avatarFile: true,
  branch: { select: { id: true, name: true } },
} as const;

/** Devuelve el usuario con sus permisos efectivos en lugar de los cambios guardados. */
const view = <T extends { id: string; role: string; permissions: unknown; avatarFile?: string | null }>({ avatarFile, ...u }: T) => ({ ...u, avatar: avatarUrl({ id: u.id, avatarFile }), permissions: resolvePermissions(u.role, u.permissions) });

@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  /** Catálogo de permisos que el administrador puede ajustar por persona. */
  @Roles('ADMIN')
  @Get('permissions')
  permissions() {
    return PERMISSIONS;
  }

  @Roles('ADMIN')
  @Get()
  async list() {
    // Las cuentas de propietarios se administran desde el portal del propietario.
    const rows = await this.prisma.db.user.findMany({ where: { role: { not: 'OWNER' } }, select: publicFields, orderBy: { fullName: 'asc' } });
    return rows.map(view);
  }

  /** Personas que pueden atender propiedades y clientes; para los selectores. */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('agents')
  agents() {
    // El jefe de sucursal elige solo entre las personas de su sucursal.
    const branch = managedBranch();
    return this.prisma.db.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'AGENT'] }, ...(branch ? { branchId: branch } : {}) },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('usage')
  usage() {
    return this.limits.usage();
  }

  private async assertBranch(branchId?: string | null) {
    if (branchId && !(await this.prisma.db.branch.count({ where: { id: branchId } }))) throw new BadRequestException('No se encontró la sucursal indicada');
  }

  @Roles('ADMIN')
  @Post()
  async create(@Body() body: unknown) {
    const data = validate(createSchema, body);
    if (data.role === 'AGENT') await this.limits.assertCanAdd('agents');
    const exists = await this.prisma.db.user.count({ where: { email: data.email } });
    if (exists) throw new BadRequestException('Ya existe un usuario con ese email en tu empresa');
    await this.assertBranch(data.branchId);
    const { password: plain, ...rest } = data;
    return view(await this.prisma.db.user.create({
      data: { ...rest, tenantId: current().tenantId, passwordHash: await bcrypt.hash(plain, 12) },
      select: publicFields,
    }));
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(updateSchema, body);
    const user = await this.prisma.db.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (user.role === 'OWNER' && data.role) throw new BadRequestException('Una cuenta de propietario no puede cambiar de rol');
    const me = current();
    if (id === me.userId && (data.isActive === false || (data.role && data.role !== 'ADMIN'))) {
      throw new BadRequestException('No puedes desactivarte ni quitarte el rol de administrador');
    }
    const willBeActiveAgent = (data.role ?? user.role) === 'AGENT' && (data.isActive ?? user.isActive);
    const isActiveAgent = user.role === 'AGENT' && user.isActive;
    if (willBeActiveAgent && !isActiveAgent) await this.limits.assertCanAdd('agents');

    await this.assertBranch(data.branchId);
    const { password: plain, permissions, ...rest } = data;
    // Los permisos se guardan solo como diferencias con el rol final de la persona.
    const role = data.role ?? user.role;
    const overrides = permissions ? cleanOverrides(role, { ...((user.permissions ?? {}) as Record<string, boolean>), ...permissions }) : data.role && data.role !== user.role ? {} : undefined;
    return view(await this.prisma.db.user.update({
      where: { id },
      data: { ...defined(rest), ...(overrides !== undefined ? { permissions: overrides } : {}), ...(plain ? { passwordHash: await bcrypt.hash(plain, 12) } : {}) },
      select: publicFields,
    }));
  }
}
