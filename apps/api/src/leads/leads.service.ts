import { Injectable } from '@nestjs/common';
import { AutomationsService } from '../automations/automations.service.js';
import { WebhooksService } from '../integrations/webhooks.service.js';
import { CasesService } from '../cases/cases.service.js';
import { ActivityService } from '../common/activity.service.js';
import { requestContext } from '../common/request-context.js';
import type { LeadSource } from '../generated/prisma/enums.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Puntaje simple de 0 a 100 según cuánta información útil trae el lead. */
export function scoreLead(input: { phone?: string | null; email?: string | null; propertyId?: string | null; message?: string | null; wantsVisit?: boolean }) {
  let score = 10;
  if (input.phone) score += 30;
  if (input.email) score += 15;
  if (input.propertyId) score += 20;
  if (input.message && input.message.trim().length >= 20) score += 10;
  if (input.wantsVisit) score += 15;
  return Math.min(score, 100);
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly cases: CasesService,
    private readonly notifications: NotificationsService,
    private readonly automations: AutomationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  /** Distribución automática: el agente activo con menos leads abiertos. */
  async pickAgent(): Promise<string | null> {
    const agents = await this.prisma.db.user.findMany({
      where: { isActive: true, role: 'AGENT' },
      select: { id: true, _count: { select: { leads: { where: { status: { notIn: ['CLOSED', 'LOST'] } } } } } },
    });
    if (!agents.length) return null;
    agents.sort((a, b) => a._count.leads - b._count.leads);
    return agents[0].id;
  }

  async create(input: {
    contactId: string;
    propertyId?: string | null;
    agentId?: string | null;
    source: LeadSource;
    message?: string | null;
    wantsVisit?: boolean;
  }) {
    const tenantId = requestContext.get()!.tenantId!;
    const contact = await this.prisma.db.contact.findUniqueOrThrow({ where: { id: input.contactId } });
    const property = input.propertyId
      ? await this.prisma.db.property.findUnique({ where: { id: input.propertyId }, select: { id: true, code: true, agentId: true } })
      : null;

    const agentId = input.agentId ?? property?.agentId ?? contact.assignedAgentId ?? (await this.pickAgent());
    const caseId = await this.cases.onEvent(property?.id, 'lead');

    const lead = await this.prisma.db.lead.create({
      data: {
        tenantId,
        contactId: contact.id,
        propertyId: property?.id ?? null,
        agentId,
        caseId,
        source: input.source,
        message: input.message ?? null,
        score: scoreLead({ phone: contact.phone, email: contact.email, propertyId: property?.id, message: input.message, wantsVisit: input.wantsVisit }),
      },
    });
    if (agentId && !contact.assignedAgentId) {
      await this.prisma.db.contact.update({ where: { id: contact.id }, data: { assignedAgentId: agentId } });
    }
    await this.activity.log('lead', lead.id, `Nuevo lead de ${contact.fullName}${property ? ` por ${property.code}` : ''}`, caseId);
    await this.notifications.notify([agentId], {
      type: 'lead', title: `Nuevo lead: ${contact.fullName}`, body: property ? `Interesado en ${property.code}` : 'Consulta general', link: '/app/leads',
    });
    await this.automations.onLead(lead, contact.fullName);
    await this.webhooks.emit('lead.created', { id: lead.id, source: lead.source, score: lead.score, contact: { fullName: contact.fullName, phone: contact.phone, email: contact.email }, propertyCode: property?.code ?? null });
    return lead;
  }
}
