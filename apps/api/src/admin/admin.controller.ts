import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { defined, optInt, password, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';

const RESERVED = ['admin', 'www', 'app', 'api'];
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/, 'Usa de 3 a 32 letras, números o guiones')
  .refine((v) => !RESERVED.includes(v), 'Ese subdominio está reservado');
const limitValue = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(0).max(1e7).nullable());
const limits = z.object({ agents: limitValue, properties: limitValue, contacts: limitValue, aiRequests: limitValue.optional() });

const tenantCreate = z.object({
  name: text(),
  slug,
  planId: z.string().min(1),
  adminName: text(),
  adminEmail: z.string().trim().toLowerCase().pipe(z.email()),
  adminPassword: password,
});
const tenantUpdate = z.object({
  name: text().optional(),
  planId: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'CANCELLED']).optional(),
  extraAgents: optInt(0, 1000),
});
const planFields = {
  name: text(),
  priceMonthly: z.coerce.number().min(0).max(1e7),
  limits,
  features: z.array(z.string().trim().min(1).max(60)).max(100),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
};
const planCreate = z.object({ code: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,30}$/, 'Código inválido'), ...planFields });
const planUpdate = z.object(planFields).partial();

/** Superadmin: administra toda la plataforma. Solo accesible desde admin.<dominio>. */
@Roles('SUPERADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.platform;
  }

  @Get('stats')
  async stats() {
    const [byStatus, users, properties, leads, tenants] = await Promise.all([
      this.db.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.user.count({ where: { tenantId: { not: null }, isActive: true } }),
      this.db.property.count(),
      this.db.lead.count(),
      this.db.tenant.findMany({ where: { status: 'ACTIVE' }, select: { plan: { select: { priceMonthly: true } }, subscriptions: { take: 1, orderBy: { createdAt: 'desc' }, select: { extraAgents: true } } } }),
    ]);
    const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    // Ingreso mensual estimado según precios de lista; no es facturación real.
    const estimatedMrr = tenants.reduce((sum, t) => sum + Number(t.plan.priceMonthly), 0);
    return { tenants: { active: count('ACTIVE'), suspended: count('SUSPENDED'), cancelled: count('CANCELLED') }, users, properties, leads, estimatedMrr };
  }

  /** Dominios propios de las empresas. Soporte puede darlos por verificados o quitarlos. */
  @Get('domains')
  domains() {
    return this.db.tenantDomain.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, domain: true, verifiedAt: true, createdAt: true, tenant: { select: { name: true, slug: true } } } });
  }

  @Patch('domains/:id')
  async setDomain(@Param('id') id: string, @Body() body: unknown) {
    const { verified } = validate(z.object({ verified: z.boolean() }), body);
    const { count } = await this.db.tenantDomain.updateMany({ where: { id }, data: { verifiedAt: verified ? new Date() : null } });
    if (!count) throw new NotFoundException('Dominio no encontrado');
    return { id, verified };
  }

  /** Consumo de IA del mes por empresa, para controlar costos. */
  @Get('ai-usage')
  async aiUsage() {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), 1);
    const [rows, tenants] = await Promise.all([
      this.db.aiUsage.groupBy({ by: ['tenantId', 'provider'], where: { createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } }),
      this.db.tenant.findMany({ select: { id: true, name: true, slug: true, plan: { select: { name: true, limits: true } } } }),
    ]);
    return tenants
      .map((t) => {
        const mine = rows.filter((r) => r.tenantId === t.id);
        const external = mine.filter((r) => !['plantilla', 'reglas'].includes(r.provider));
        return {
          tenant: { id: t.id, name: t.name, slug: t.slug }, plan: t.plan.name, limit: ((t.plan.limits ?? {}) as Record<string, number | null>).aiRequests ?? 0,
          requests: mine.reduce((a, r) => a + r._count._all, 0),
          external: external.reduce((a, r) => a + r._count._all, 0),
          inputTokens: external.reduce((a, r) => a + (r._sum.inputTokens ?? 0), 0),
          outputTokens: external.reduce((a, r) => a + (r._sum.outputTokens ?? 0), 0),
        };
      })
      .sort((a, b) => b.requests - a.requests);
  }

  @Get('tenants')
  async tenants() {
    const rows = await this.db.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { id: true, code: true, name: true, limits: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { properties: true, contacts: true, leads: true } },
      },
    });
    const agents = await this.db.user.groupBy({ by: ['tenantId'], where: { role: 'AGENT', isActive: true }, _count: { _all: true } });
    const users = await this.db.user.groupBy({ by: ['tenantId'], where: { isActive: true }, _count: { _all: true } });
    const of = (list: typeof agents, id: string) => list.find((r) => r.tenantId === id)?._count._all ?? 0;
    return rows.map(({ subscriptions, _count, ...t }) => ({
      ...t,
      subscription: subscriptions[0] ?? null,
      usage: { agents: of(agents, t.id), users: of(users, t.id), properties: _count.properties, contacts: _count.contacts, leads: _count.leads },
    }));
  }

  @Post('tenants')
  async createTenant(@Body() body: unknown) {
    const data = validate(tenantCreate, body);
    const plan = await this.db.plan.findUnique({ where: { id: data.planId } });
    if (!plan) throw new BadRequestException('Plan no encontrado');
    if (await this.db.tenant.count({ where: { slug: data.slug } })) throw new BadRequestException('Ese subdominio ya está en uso');

    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    return this.db.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        planId: plan.id,
        subscriptions: { create: { planId: plan.id, status: 'TRIAL', currentPeriodStart: start, currentPeriodEnd: end } },
        users: { create: { email: data.adminEmail, fullName: data.adminName, role: 'ADMIN', passwordHash: await bcrypt.hash(data.adminPassword, 12) } },
      },
      select: { id: true, slug: true, name: true },
    });
  }

  @Patch('tenants/:id')
  async updateTenant(@Param('id') id: string, @Body() body: unknown) {
    const { extraAgents, ...data } = validate(tenantUpdate, body);
    const tenant = await this.db.tenant.findUnique({ where: { id }, include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');
    if (data.planId && !(await this.db.plan.count({ where: { id: data.planId } }))) throw new BadRequestException('Plan no encontrado');

    await this.db.tenant.update({ where: { id }, data: defined(data) });
    const sub = tenant.subscriptions[0];
    if (sub && (data.planId || extraAgents != null)) {
      await this.db.subscription.update({
        where: { id: sub.id },
        data: { ...(data.planId ? { planId: data.planId } : {}), ...(extraAgents != null ? { extraAgents } : {}) },
      });
    }
    return { id };
  }

  @Get('plans')
  plans() {
    return this.db.plan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { tenants: true } } } });
  }

  @Post('plans')
  async createPlan(@Body() body: unknown) {
    const data = validate(planCreate, body);
    if (await this.db.plan.count({ where: { code: data.code } })) throw new BadRequestException('Ya existe un plan con ese código');
    return this.db.plan.create({ data });
  }

  @Patch('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(planUpdate, body);
    if (!(await this.db.plan.count({ where: { id } }))) throw new NotFoundException('Plan no encontrado');
    return this.db.plan.update({ where: { id }, data: defined(data) });
  }
}
