import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { canAssign, current, managedBranch } from '../common/current.js';
import { RefsService } from '../common/refs.service.js';
import { defined, optId, optText, text, validate } from '../common/validate.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const optDate = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.date().nullish());
const fields = {
  title: text(190),
  type: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'FOLLOW_UP', 'DOCUMENT', 'PAYMENT', 'SIGNATURE', 'REVIEW', 'CUSTOM']).default('CUSTOM'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueAt: optDate,
  notes: optText(2000),
  assignedToId: optId,
  contactId: optId,
  propertyId: optId,
  caseId: optId,
};
const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, title: fields.title.optional(), type: fields.type.optional(), priority: fields.priority.optional(), status: z.enum(['PENDING', 'DONE']).optional() }).partial();
const include = { assignedTo: { select: { id: true, fullName: true } } } as const;

/** Tareas: llamadas, seguimientos, documentos y cobros pendientes. El agente ve solo las suyas. */
@Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: RefsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** El administrador ve todas; el jefe de sucursal, las de su sucursal; el resto, las suyas. */
  private mine() {
    const me = current();
    const branch = managedBranch();
    return me.role === 'ADMIN' ? {} : branch ? { assignedTo: { branchId: branch } } : { assignedToId: me.userId };
  }

  private async assertAssignee(id: string) {
    const branch = managedBranch();
    const ok = await this.prisma.db.user.count({ where: { id, isActive: true, role: { in: ['ADMIN', 'AGENT', 'ACCOUNTANT'] }, ...(branch ? { branchId: branch } : {}) } });
    if (!ok) throw new BadRequestException(branch ? 'Solo puedes asignar tareas a personas de tu sucursal' : 'No se encontró a la persona responsable indicada');
  }

  @Get()
  async list(@Query('status') status?: string, @Query('assignedToId') assignedToId?: string) {
    const where = { ...(status === 'DONE' || status === 'PENDING' ? { status: status as 'DONE' | 'PENDING' } : {}), ...(assignedToId ? { assignedToId } : {}), ...this.mine() };
    const rows = await this.prisma.db.task.findMany({ where, include, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }], take: 500 });
    // Las tareas sin fecha van al final de las pendientes.
    return rows.sort((a, b) => (a.status === b.status ? (a.dueAt ? +a.dueAt : Infinity) - (b.dueAt ? +b.dueAt : Infinity) : 0));
  }

  @Post()
  async create(@Body() body: unknown) {
    const data = validate(createSchema, body);
    const me = current();
    // Solo el administrador reparte tareas a otras personas.
    const assignedToId = canAssign() && data.assignedToId ? data.assignedToId : me.userId;
    await this.assertAssignee(assignedToId);
    await this.refs.assert({ contactId: data.contactId, propertyId: data.propertyId, caseId: data.caseId });
    const task = await this.prisma.db.task.create({ data: { ...data, assignedToId, tenantId: me.tenantId, createdById: me.userId }, include });
    await this.notifications.notify([assignedToId], { type: 'task', title: `Nueva tarea: ${task.title}`, link: '/app/tareas' });
    return task;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(updateSchema, body);
    const before = await this.prisma.db.task.findFirst({ where: { id, ...this.mine() } });
    if (!before) throw new NotFoundException('Tarea no encontrada');
    if (!canAssign()) delete data.assignedToId;
    if (data.assignedToId === null) delete data.assignedToId;
    if (data.assignedToId) await this.assertAssignee(data.assignedToId);
    await this.refs.assert({ contactId: data.contactId, propertyId: data.propertyId, caseId: data.caseId });
    const task = await this.prisma.db.task.update({
      where: { id },
      data: { ...defined(data), ...(data.status && data.status !== before.status ? { completedAt: data.status === 'DONE' ? new Date() : null } : {}) } as never,
      include,
    });
    if (data.assignedToId && data.assignedToId !== before.assignedToId) {
      await this.notifications.notify([data.assignedToId], { type: 'task', title: `Te asignaron una tarea: ${task.title}`, link: '/app/tareas' });
    }
    return task;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const me = current();
    const task = await this.prisma.db.task.findFirst({ where: { id, ...this.mine() } });
    if (!task) throw new NotFoundException('Tarea no encontrada');
    if (me.role !== 'ADMIN' && task.createdById !== me.userId) throw new ForbiddenException('Solo puedes eliminar las tareas que creaste');
    await this.prisma.db.task.delete({ where: { id } });
    return { ok: true };
  }
}
