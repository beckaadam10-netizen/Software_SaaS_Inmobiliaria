import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { requestContext } from '../common/request-context.js';
import type { TaskPriority, TaskType } from '../generated/prisma/enums.js';
import { computeAlerts } from '../insights/alerts.js';
import { SnapshotService } from '../insights/snapshot.service.js';
import { DAY, money } from '../insights/snapshot.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AutomationInfo {
  key: string;
  name: string;
  description: string;
  /** "event": al ocurrir algo. "daily": una vez por día. */
  trigger: 'event' | 'daily';
}

/** Catálogo de automatizaciones. Cada empresa enciende o apaga las que quiera. */
export const AUTOMATIONS: AutomationInfo[] = [
  { key: 'lead_new_task', trigger: 'event', name: 'Tarea al recibir un lead', description: 'Crea una tarea "Contactar" para el agente asignado, con plazo de 24 horas.' },
  { key: 'visit_done_task', trigger: 'event', name: 'Seguimiento después de la visita', description: 'Al marcar una visita como realizada, crea la tarea de llamar al cliente al día siguiente.' },
  { key: 'case_won_task', trigger: 'event', name: 'Post-venta al cerrar', description: 'Al ganar una operación, crea la tarea de contactar al cliente a los 7 días.' },
  { key: 'visit_reminder', trigger: 'daily', name: 'Recordatorio de visitas', description: 'Avisa al agente de sus visitas de las próximas 24 horas.' },
  { key: 'lead_followup', trigger: 'daily', name: 'Leads sin seguimiento', description: 'Crea una tarea por cada lead abierto sin cambios en más de 7 días.' },
  { key: 'offer_stalled', trigger: 'daily', name: 'Ofertas sin respuesta', description: 'Crea una tarea cuando una oferta lleva más de 5 días pendiente.' },
  { key: 'captation_expiring', trigger: 'daily', name: 'Captaciones por vencer', description: 'Avisa al agente y al administrador cuando una captación vence en 7 días.' },
  { key: 'receivable_overdue', trigger: 'daily', name: 'Cobros vencidos', description: 'Avisa a administración y contabilidad de las cuentas por cobrar vencidas.' },
  { key: 'daily_summary', trigger: 'daily', name: 'Resumen diario', description: 'Envía al administrador un aviso con los asuntos que necesitan atención.' },
];
const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class AutomationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Automations');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly snapshots: SnapshotService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('AUTOMATIONS_SCHEDULER', 'on') === 'off') return;
    // Revisa cada hora; cada automatización diaria se ejecuta una sola vez por día y empresa.
    this.timer = setInterval(() => void this.runAllTenants(), 60 * 60 * 1000);
    this.timer.unref();
    setTimeout(() => void this.runAllTenants(), 30_000).unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async settings() {
    const rows = await this.prisma.db.automationSetting.findMany();
    const lastRuns = await this.prisma.db.automationRun.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    return AUTOMATIONS.map((a) => ({
      ...a,
      enabled: rows.find((r) => r.key === a.key)?.enabled ?? true,
      lastRun: lastRuns.find((r) => r.key === a.key)?.createdAt ?? null,
    }));
  }

  async enabled(key: string) {
    const row = await this.prisma.db.automationSetting.findFirst({ where: { key } });
    return row?.enabled ?? true;
  }

  async setEnabled(key: string, enabled: boolean) {
    const tenantId = requestContext.get()!.tenantId!;
    const row = await this.prisma.db.automationSetting.findFirst({ where: { key } });
    if (row) await this.prisma.db.automationSetting.update({ where: { id: row.id }, data: { enabled } });
    else await this.prisma.db.automationSetting.create({ data: { tenantId, key, enabled } });
  }

  /** Crea una tarea automática, salvo que ya exista una igual pendiente para el mismo registro. */
  private async task(input: { title: string; type: TaskType; priority?: TaskPriority; dueInDays: number; assignedToId: string | null; leadId?: string; caseId?: string; contactId?: string; propertyId?: string }) {
    if (!input.assignedToId) return 0;
    const tenantId = requestContext.get()!.tenantId!;
    const dup = await this.prisma.db.task.count({
      where: { automatic: true, status: 'PENDING', type: input.type, title: input.title, leadId: input.leadId ?? null, caseId: input.caseId ?? null, contactId: input.contactId ?? null },
    });
    if (dup) return 0;
    const { dueInDays, ...rest } = input;
    await this.prisma.db.task.create({ data: { ...rest, assignedToId: input.assignedToId, tenantId, automatic: true, dueAt: new Date(Date.now() + dueInDays * DAY) } });
    await this.notifications.notify([input.assignedToId], { type: 'task', title: `Tarea automática: ${input.title}`, link: '/app/tareas' });
    return 1;
  }

  /** Los eventos nunca interrumpen la operación que los dispara. */
  private async safely(key: string, fn: () => Promise<unknown>) {
    try {
      if (await this.enabled(key)) await fn();
    } catch (e) {
      this.logger.error(`Automatización ${key}: ${e}`);
    }
  }

  onLead(lead: { id: string; agentId: string | null; contactId: string }, contactName: string) {
    return this.safely('lead_new_task', () =>
      this.task({ title: `Contactar a ${contactName}`, type: 'CALL', priority: 'HIGH', dueInDays: 1, assignedToId: lead.agentId, leadId: lead.id, contactId: lead.contactId }));
  }
  onVisitDone(visit: { agentId: string | null; contactId: string; propertyId: string; caseId: string | null }, contactName: string) {
    return this.safely('visit_done_task', () =>
      this.task({ title: `Llamar a ${contactName} por su visita`, type: 'FOLLOW_UP', dueInDays: 1, assignedToId: visit.agentId, contactId: visit.contactId, propertyId: visit.propertyId, caseId: visit.caseId ?? undefined }));
  }
  onCaseWon(c: { id: string; code: string; agentId: string | null; clientId: string | null }) {
    return this.safely('case_won_task', () =>
      this.task({ title: `Post-venta ${c.code}: contactar al cliente`, type: 'FOLLOW_UP', priority: 'LOW', dueInDays: 7, assignedToId: c.agentId, caseId: c.id, contactId: c.clientId ?? undefined }));
  }

  /** Ejecuta las automatizaciones diarias de la empresa en curso. Cada una corre como máximo una vez por día. */
  async runDaily() {
    const tenantId = requestContext.get()!.tenantId!;
    const results: Array<{ key: string; name: string; ran: boolean; created: number; reason?: string }> = [];
    let snapshot: Awaited<ReturnType<SnapshotService['load']>> | null = null;
    for (const a of AUTOMATIONS.filter((x) => x.trigger === 'daily')) {
      if (!(await this.enabled(a.key))) {
        results.push({ key: a.key, name: a.name, ran: false, created: 0, reason: 'Desactivada' });
        continue;
      }
      try {
        await this.prisma.db.automationRun.create({ data: { tenantId, key: a.key, day: today() } });
      } catch {
        results.push({ key: a.key, name: a.name, ran: false, created: 0, reason: 'Ya se ejecutó hoy' });
        continue;
      }
      try {
        snapshot ??= await this.snapshots.load({ finance: true });
        results.push({ key: a.key, name: a.name, ran: true, created: await this.execute(a.key, snapshot) });
      } catch (e) {
        this.logger.error(`Automatización ${a.key}: ${e}`);
        results.push({ key: a.key, name: a.name, ran: false, created: 0, reason: 'Falló; se reintentará mañana' });
      }
    }
    return results;
  }

  private async execute(key: string, s: Awaited<ReturnType<SnapshotService['load']>>): Promise<number> {
    const now = s.now.getTime();
    const contact = (id: string) => s.contacts.find((c) => c.id === id)?.fullName ?? 'el cliente';
    const property = (id: string | null) => s.properties.find((p) => p.id === id);
    const admins = await this.notifications.admins();
    let n = 0;
    switch (key) {
      case 'visit_reminder':
        for (const v of s.visits.filter((x) => ['CONFIRMED', 'RESCHEDULED'].includes(x.status) && x.scheduledAt.getTime() > now && x.scheduledAt.getTime() - now <= DAY)) {
          if (!v.agentId) continue;
          const when = v.scheduledAt.toLocaleString('es-BO', { timeZone: 'America/La_Paz', weekday: 'long', hour: '2-digit', minute: '2-digit' });
          await this.notifications.notify([v.agentId], { type: 'visit', title: `Recordatorio: visita con ${contact(v.contactId)}`, body: `${property(v.propertyId)?.code ?? ''} · ${when}`, link: '/app/visitas' });
          n++;
        }
        return n;
      case 'lead_followup':
        for (const l of s.leads.filter((x) => !['CLOSED', 'LOST', 'NEW'].includes(x.status) && now - x.updatedAt.getTime() > 7 * DAY)) {
          n += await this.task({ title: `Retomar contacto con ${contact(l.contactId)}`, type: 'FOLLOW_UP', dueInDays: 1, assignedToId: l.agentId, leadId: l.id, contactId: l.contactId });
        }
        return n;
      case 'offer_stalled':
        for (const o of s.offers.filter((x) => x.status === 'PENDING' && now - x.createdAt.getTime() > 5 * DAY)) {
          const c = s.cases.find((k) => k.id === o.caseId);
          if (!c || c.status !== 'OPEN') continue;
          n += await this.task({ title: `Responder la oferta de ${money(o.amount, o.currency)} en ${c.code}`, type: 'REVIEW', priority: 'HIGH', dueInDays: 1, assignedToId: c.agentId ?? admins[0] ?? null, caseId: c.id });
        }
        return n;
      case 'captation_expiring':
        for (const c of s.cases.filter((x) => x.status === 'OPEN' && x.captationEnds && x.captationEnds.getTime() - now <= 7 * DAY && x.captationEnds.getTime() > now - DAY)) {
          await this.notifications.notify([c.agentId, ...admins], { type: 'case', title: `La captación de ${c.code} vence pronto`, body: property(c.propertyId)?.title, link: `/app/gestion/${c.id}` });
          n++;
        }
        return n;
      case 'receivable_overdue': {
        const overdue = s.receivables.filter((r) => r.dueDate.getTime() < now - DAY);
        if (!overdue.length) return 0;
        const accountants = await this.prisma.db.user.findMany({ where: { role: 'ACCOUNTANT', isActive: true }, select: { id: true } });
        await this.notifications.notify([...admins, ...accountants.map((a) => a.id)], {
          type: 'finance', title: overdue.length === 1 ? '1 cuenta por cobrar vencida' : `${overdue.length} cuentas por cobrar vencidas`, body: overdue.slice(0, 3).map((r) => r.concept).join(' · '), link: '/app/finanzas/por-cobrar',
        });
        return overdue.length;
      }
      case 'daily_summary': {
        const alerts = computeAlerts(s);
        if (!alerts.length) return 0;
        await this.notifications.notify(admins, { type: 'automation', title: `Resumen de hoy: ${alerts.length === 1 ? '1 asunto necesita' : `${alerts.length} asuntos necesitan`} atención`, body: alerts.slice(0, 3).map((a) => a.title).join(' · '), link: '/app/alertas' });
        return alerts.length;
      }
      default:
        return 0;
    }
  }

  /** Programador: recorre todas las empresas activas. Las tareas quedan a nombre del sistema. */
  async runAllTenants() {
    try {
      const tenants = await this.prisma.platform.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true, slug: true } });
      for (const t of tenants) {
        await requestContext.run({ tenantId: t.id, tenantSlug: t.slug }, async () => {
          await this.runDaily();
        });
      }
    } catch (e) {
      this.logger.error(`No se pudieron ejecutar las automatizaciones: ${e}`);
    }
  }
}
