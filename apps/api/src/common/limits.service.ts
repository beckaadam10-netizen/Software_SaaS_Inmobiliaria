import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { requestContext } from './request-context.js';

export type LimitKey = 'agents' | 'properties' | 'contacts';

const LABEL: Record<LimitKey, string> = {
  agents: 'agentes',
  properties: 'propiedades activas',
  contacts: 'clientes y leads',
};

/** Límites del plan: plan -> límites -> uso. Nada está escrito en código. */
@Injectable()
export class LimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async usage() {
    // Vale para sesiones de usuario y para la API pública (que no tiene usuario).
    const tenantId = requestContext.get()?.tenantId;
    if (!tenantId) throw new ForbiddenException('Esta sección pertenece al panel de una empresa');
    const tenant = await this.prisma.platform.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { plan: true, subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const limits = (tenant.plan.limits ?? {}) as Record<string, number | null>;
    const extraAgents = tenant.subscriptions[0]?.extraAgents ?? 0;
    const now = new Date();
    const [agents, properties, contacts, aiUsed] = await Promise.all([
      this.prisma.db.user.count({ where: { role: 'AGENT', isActive: true } }),
      this.prisma.db.property.count({ where: { status: { not: 'INACTIVE' } } }),
      this.prisma.db.contact.count(),
      this.prisma.db.aiUsage.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
    ]);
    return {
      plan: { code: tenant.plan.code, name: tenant.plan.name, features: tenant.plan.features as string[] },
      limits: {
        agents: limits.agents == null ? null : limits.agents + extraAgents,
        properties: limits.properties ?? null,
        contacts: limits.contacts ?? null,
      } as Record<LimitKey, number | null>,
      usage: { agents, properties, contacts } as Record<LimitKey, number>,
      /** Solicitudes de IA del mes en curso. Sin límite definido en el plan = 0 (no incluido). */
      ai: { limit: limits.aiRequests === undefined ? 0 : limits.aiRequests, used: aiUsed },
    };
  }

  /** Lanza 403 si el plan de la empresa no incluye el módulo. */
  async assertFeature(feature: string, label: string) {
    const { plan } = await this.usage();
    if (!plan.features.includes(feature)) {
      throw new ForbiddenException(`${label} no está incluido en tu plan ${plan.name}. Actualiza tu plan para usarlo.`);
    }
  }

  /** Nivel del módulo financiero según el plan: sin finanzas, básico o completo. */
  async financeLevel(): Promise<'none' | 'basic' | 'full'> {
    const { plan } = await this.usage();
    if (plan.features.some((f) => f === 'finance_full' || f === 'finance_advanced')) return 'full';
    return plan.features.includes('finance_basic') ? 'basic' : 'none';
  }

  /** Lanza 403 si crear uno más supera el límite del plan. */
  async assertCanAdd(key: LimitKey) {
    const { limits, usage, plan } = await this.usage();
    const limit = limits[key];
    if (limit != null && usage[key] >= limit) {
      throw new ForbiddenException(
        `Has alcanzado el límite de ${LABEL[key]} de tu plan ${plan.name} (${usage[key]} de ${limit}). Actualiza tu plan para agregar más.`,
      );
    }
  }
}
