import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { current, currentBranch, restrictedAgent } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { validate } from '../common/validate.js';
import { computeAlerts } from './alerts.js';
import { agentStats, avgDaysToClose, demand, funnel, zones } from './analytics.js';
import { SnapshotService } from './snapshot.service.js';

const date = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.date().optional());
const rangeSchema = z.object({ from: date, to: date });

@Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
@Controller()
export class InsightsController {
  constructor(
    private readonly snapshots: SnapshotService,
    private readonly limits: LimitsService,
  ) {}

  private scope() {
    const me = current();
    return { agentId: restrictedAgent() ? me.userId : undefined, branchId: currentBranch() ?? undefined, finance: me.role !== 'AGENT' };
  }

  /** Analítica avanzada: embudo, agentes, demanda y zonas. El agente ve solo lo suyo. */
  @Get('analytics')
  async analytics(@Query() query: unknown) {
    await this.limits.assertFeature('analytics_advanced', 'La analítica avanzada');
    const range = validate(rangeSchema, query);
    const s = await this.snapshots.load(this.scope());
    return { funnel: funnel(s, range), agents: agentStats(s, range), demand: demand(s), zones: zones(s), avgDaysToClose: avgDaysToClose(s) };
  }

  /** Alertas inteligentes: lo que necesita atención hoy. Disponible en todos los planes. */
  @Get('alerts')
  async alerts() {
    return computeAlerts(await this.snapshots.load(this.scope()));
  }
}
