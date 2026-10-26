import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { defined, optText, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';

const schema = z.object({ name: text(80), city: optText(80), address: optText(), phone: optText(30) });

/**
 * Sucursales. Un agente pertenece a una sucursal; sus propiedades, clientes y operaciones son de esa sucursal.
 * El panel elige la vista (toda la empresa o una sucursal) con la cabecera x-branch.
 */
@Controller('branches')
export class BranchesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  /** Lista con números por sucursal. Todos la leen para poder elegir la vista. */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get()
  async list() {
    const { plan } = await this.limits.usage();
    if (!plan.features.includes('multi_branch')) return { enabled: false, items: [] };
    const rows = await this.prisma.db.branch.findMany({ orderBy: { name: 'asc' }, include: { users: { where: { isActive: true, role: { in: ['ADMIN', 'AGENT'] } }, select: { id: true } } } });
    const counts = await Promise.all(rows.map((b) => this.prisma.db.property.count({ where: { agent: { branchId: b.id }, status: { in: ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] } } })));
    return { enabled: true, items: rows.map(({ users, ...b }, i) => ({ ...b, agents: users.length, properties: counts[i] })) };
  }

  @Roles('ADMIN')
  @Post()
  async create(@Body() body: unknown) {
    await this.limits.assertFeature('multi_branch', 'Las sucursales');
    const data = validate(schema, body);
    if (await this.prisma.db.branch.count({ where: { name: data.name } })) throw new BadRequestException('Ya existe una sucursal con ese nombre');
    return this.prisma.db.branch.create({ data: { ...data, tenantId: current().tenantId } });
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(schema.partial(), body);
    if (!(await this.prisma.db.branch.count({ where: { id } }))) throw new NotFoundException('Sucursal no encontrada');
    if (data.name && (await this.prisma.db.branch.count({ where: { name: data.name, id: { not: id } } }))) throw new BadRequestException('Ya existe una sucursal con ese nombre');
    return this.prisma.db.branch.update({ where: { id }, data: defined(data) });
  }

  /** Solo se elimina una sucursal sin personas asignadas. */
  @Roles('ADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    if (!(await this.prisma.db.branch.count({ where: { id } }))) throw new NotFoundException('Sucursal no encontrada');
    if (await this.prisma.db.user.count({ where: { branchId: id } })) throw new BadRequestException('Primero pasa a sus usuarios a otra sucursal');
    await this.prisma.db.branch.delete({ where: { id } });
    return { id };
  }
}
