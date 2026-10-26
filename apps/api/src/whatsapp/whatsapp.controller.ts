import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { ActivityService } from '../common/activity.service.js';
import { current, ownScope } from '../common/current.js';
import { defined, optId, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';

const templateSchema = z.object({ name: text(80), body: z.string().trim().min(1).max(1500) });
const logSchema = z.object({ contactId: z.string().min(1), leadId: optId, templateName: text(80).optional() });

/** Plantillas con las que arranca cada empresa. Variables: {cliente} {agente} {empresa} {propiedad} {precio} {enlace} {fecha} */
const DEFAULTS = [
  { name: 'Primer contacto', body: 'Hola {cliente}, soy {agente} de {empresa}. Recibí tu consulta por {propiedad}. ¿Te parece si coordinamos una llamada para darte más información?' },
  { name: 'Compartir propiedad', body: 'Hola {cliente}, te comparto esta propiedad que puede interesarte: {propiedad}, {precio}. Puedes ver fotos y detalles aquí: {enlace}' },
  { name: 'Confirmar visita', body: 'Hola {cliente}, te confirmo la visita a {propiedad} el {fecha}. Cualquier cambio me avisas. Saludos, {agente}.' },
  { name: 'Seguimiento post-visita', body: 'Hola {cliente}, gracias por visitar {propiedad}. ¿Qué te pareció? Quedo atento a tus dudas o a una segunda visita.' },
];

/**
 * WhatsApp en esta fase: plantillas y enlaces "clic para chatear" que abren el WhatsApp del agente,
 * con registro de cada mensaje en el historial. El envío automático requiere la API de WhatsApp Business.
 */
@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('templates')
  async templates() {
    const { tenantId } = current();
    const existing = await this.prisma.db.messageTemplate.findMany({ orderBy: { createdAt: 'asc' } });
    if (existing.length) return existing;
    await this.prisma.db.messageTemplate.createMany({ data: DEFAULTS.map((t) => ({ ...t, tenantId })) });
    return this.prisma.db.messageTemplate.findMany({ orderBy: { createdAt: 'asc' } });
  }

  @Roles('ADMIN')
  @Post('templates')
  create(@Body() body: unknown) {
    return this.prisma.db.messageTemplate.create({ data: { ...validate(templateSchema, body), tenantId: current().tenantId } });
  }

  @Roles('ADMIN')
  @Patch('templates/:id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(templateSchema.partial(), body);
    if (!(await this.prisma.db.messageTemplate.count({ where: { id } }))) throw new NotFoundException('Plantilla no encontrada');
    return this.prisma.db.messageTemplate.update({ where: { id }, data: defined(data) });
  }

  @Roles('ADMIN')
  @Delete('templates/:id')
  async remove(@Param('id') id: string) {
    if (!(await this.prisma.db.messageTemplate.count({ where: { id } }))) throw new NotFoundException('Plantilla no encontrada');
    await this.prisma.db.messageTemplate.delete({ where: { id } });
    return { id };
  }

  /** Registra en el historial que el agente abrió WhatsApp para escribirle al contacto. */
  @Roles('ADMIN', 'AGENT')
  @Post('log')
  async log(@Body() body: unknown) {
    const data = validate(logSchema, body);
    const contact = await this.prisma.db.contact.findFirst({ where: { id: data.contactId, ...ownScope('assignedAgentId') }, select: { id: true, fullName: true } });
    if (!contact) throw new NotFoundException('Contacto no encontrado');
    const lead = data.leadId ? await this.prisma.db.lead.findFirst({ where: { id: data.leadId, contactId: contact.id }, select: { id: true, caseId: true, status: true } }) : null;
    const textLog = `WhatsApp a ${contact.fullName}${data.templateName ? ` (${data.templateName})` : ''}`;
    await this.activity.log('contact', contact.id, textLog, lead?.caseId);
    if (lead) {
      await this.activity.log('lead', lead.id, textLog, lead.caseId);
      // Escribirle a un lead nuevo cuenta como primer contacto.
      if (lead.status === 'NEW') await this.prisma.db.lead.update({ where: { id: lead.id }, data: { status: 'CONTACTED' } });
    }
    return { ok: true };
  }
}
