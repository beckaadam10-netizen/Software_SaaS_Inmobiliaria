import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WebhooksService } from '../integrations/webhooks.service.js';
import { AutomationsService } from '../automations/automations.service.js';
import { ActivityService } from '../common/activity.service.js';
import { requestContext } from '../common/request-context.js';
import type { CaseStage, StageStatus } from '../generated/prisma/enums.js';
import { FinanceService } from '../finance/finance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Los 8 pasos de la gestión comercial, en orden. */
export const STAGES: CaseStage[] = [
  'CAPTATION', 'MARKETING', 'LEADS', 'VISIT', 'FOLLOW_UP', 'NEGOTIATION', 'LEGAL', 'POST_SALE',
];
export const STAGE_LABEL: Record<CaseStage, string> = {
  CAPTATION: 'Captación',
  MARKETING: 'Publicidad y marketing',
  LEADS: 'Atención de interesados',
  VISIT: 'Visita',
  FOLLOW_UP: 'Seguimiento post-visita',
  NEGOTIATION: 'Negociación y cierre',
  LEGAL: 'Proceso legal',
  POST_SALE: 'Postventa y referidos',
};

/** Paso actual = el primero que aún no está terminado. */
export function currentStageOf(stages: Array<{ stage: CaseStage; status: StageStatus }>): CaseStage {
  const byStage = new Map(stages.map((s) => [s.stage, s.status]));
  return STAGES.find((s) => byStage.get(s) !== 'DONE') ?? 'POST_SALE';
}

export type CaseEvent = 'lead' | 'visit_scheduled' | 'visit_done' | 'offer';

@Injectable()
export class CasesService {
  private readonly logger = new Logger('Cases');

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly finance: FinanceService,
    private readonly automations: AutomationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  private tenantId() {
    return requestContext.get()!.tenantId!;
  }

  /** Abre el expediente de una propiedad e inicia la etapa de captación. */
  async createForProperty(
    property: { id: string; operation: 'SALE' | 'RENT' | 'ANTICRETICO'; price: unknown; currency: string; ownerId: string | null; agentId: string | null; code: string },
    extra: { isExclusive?: boolean; commissionPct?: number | null; captationEnds?: Date | null } = {},
  ) {
    const tenantId = this.tenantId();
    for (let attempt = 0; attempt < 5; attempt++) {
      const count = await this.prisma.db.commercialCase.count();
      const code = `EXP-${String(count + 1 + attempt).padStart(4, '0')}`;
      try {
        const created = await this.prisma.db.commercialCase.create({
          data: {
            tenantId,
            code,
            propertyId: property.id,
            ownerId: property.ownerId,
            agentId: property.agentId,
            operation: property.operation,
            price: property.price as number,
            currency: property.currency,
            isExclusive: extra.isExclusive ?? false,
            commissionPct: extra.commissionPct ?? null,
            captationEnds: extra.captationEnds ?? null,
            // Escritura anidada: el tenantId se pasa a mano (el filtro automático no la cubre).
            stages: {
              create: STAGES.map((stage, i) => ({ tenantId, stage, status: i === 0 ? ('IN_PROGRESS' as const) : ('PENDING' as const) })),
            },
          },
        });
        await this.activity.log('case', created.id, `Expediente ${code} abierto para la propiedad ${property.code}. Inicia Captación`);
        return created;
      } catch (e) {
        if ((e as { code?: string }).code !== 'P2002') throw e;
      }
    }
    throw new BadRequestException('No se pudo generar el código del expediente');
  }

  /** Expediente abierto más reciente de una propiedad, si existe. */
  async openCaseFor(propertyId: string) {
    return this.prisma.db.commercialCase.findFirst({
      where: { propertyId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, property: { select: { code: true } } },
    });
  }

  private async recompute(caseId: string) {
    const stages = await this.prisma.db.commercialStage.findMany({ where: { caseId }, select: { stage: true, status: true } });
    const currentStage = currentStageOf(stages);
    await this.prisma.db.commercialCase.update({ where: { id: caseId }, data: { currentStage } });
    return currentStage;
  }

  private async setStatus(caseId: string, stage: CaseStage, status: StageStatus, notes?: string | null) {
    await this.prisma.db.commercialStage.updateMany({
      where: { caseId, stage },
      data: { status, completedAt: status === 'DONE' ? new Date() : null, ...(notes !== undefined ? { notes } : {}) },
    });
  }

  /** Cambia el estado de un paso y aplica sus efectos en el resto del sistema. */
  async updateStage(caseId: string, stage: CaseStage, input: { status?: StageStatus; notes?: string | null }) {
    const found = await this.prisma.db.commercialCase.findUnique({
      where: { id: caseId },
      include: { stages: true, property: { select: { id: true, status: true, code: true } } },
    });
    if (!found) throw new NotFoundException('Expediente no encontrado');
    const row = found.stages.find((s) => s.stage === stage);
    if (!row) throw new NotFoundException('Paso no encontrado');
    const status = input.status ?? row.status;

    await this.setStatus(caseId, stage, status, input.notes);

    if (input.status && input.status !== row.status) {
      const label = STAGE_LABEL[stage];
      const text = status === 'DONE' ? `Paso completado: ${label}` : status === 'IN_PROGRESS' ? `Paso en curso: ${label}` : `Paso reabierto: ${label}`;
      await this.activity.log('case', caseId, text);

      if (status === 'DONE') {
        // Al terminar un paso se habilita el siguiente.
        const next = STAGES[STAGES.indexOf(stage) + 1];
        const nextRow = next && found.stages.find((s) => s.stage === next);
        if (next && nextRow?.status === 'PENDING') await this.setStatus(caseId, next, 'IN_PROGRESS');

        // Terminar Marketing publica la propiedad en el portal.
        if (stage === 'MARKETING' && found.property.status === 'AVAILABLE') {
          await this.prisma.db.property.update({ where: { id: found.property.id }, data: { isPublished: true } });
          await this.activity.log('property', found.property.id, 'Propiedad publicada en el portal', caseId);
        }
      }
    }
    await this.recompute(caseId);
    await this.syncProperty(caseId);
  }

  /** Cuando la negociación está en curso, la propiedad figura como "en negociación". */
  private async syncProperty(caseId: string) {
    const found = await this.prisma.db.commercialCase.findUnique({
      where: { id: caseId },
      select: { status: true, propertyId: true, property: { select: { status: true } }, stages: { where: { stage: 'NEGOTIATION' }, select: { status: true } } },
    });
    if (found?.status === 'OPEN' && found.stages[0]?.status === 'IN_PROGRESS' && found.property.status === 'AVAILABLE') {
      await this.prisma.db.property.update({ where: { id: found.propertyId }, data: { status: 'NEGOTIATING' } });
      await this.activity.log('property', found.propertyId, 'Propiedad en negociación', caseId);
    }
  }

  /** Eventos de otros módulos que hacen avanzar el expediente de la propiedad. */
  async onEvent(propertyId: string | null | undefined, event: CaseEvent): Promise<string | null> {
    if (!propertyId) return null;
    const open = await this.openCaseFor(propertyId);
    if (!open) return null;
    const stages = await this.prisma.db.commercialStage.findMany({ where: { caseId: open.id } });
    const statusOf = (s: CaseStage) => stages.find((x) => x.stage === s)?.status;
    const start = async (s: CaseStage) => {
      if (statusOf(s) === 'PENDING') await this.setStatus(open.id, s, 'IN_PROGRESS');
    };

    if (event === 'lead') await start('LEADS');
    if (event === 'visit_scheduled') await start('VISIT');
    if (event === 'visit_done') {
      if (statusOf('VISIT') !== 'DONE') await this.setStatus(open.id, 'VISIT', 'DONE');
      await start('FOLLOW_UP');
    }
    if (event === 'offer') await start('NEGOTIATION');
    if (event === 'visit_scheduled' || event === 'offer') await this.webhooks.emit(event === 'offer' ? 'offer.received' : 'visit.scheduled', { caseId: open.id, caseCode: open.code, propertyCode: open.property.code });
    await this.recompute(open.id);
    await this.syncProperty(open.id);
    return open.id;
  }

  async close(caseId: string, input: { result: 'WON' | 'LOST'; clientId?: string | null; closedPrice?: number | null; lostReason?: string | null }) {
    const found = await this.prisma.db.commercialCase.findUnique({ where: { id: caseId }, include: { property: true } });
    if (!found) throw new NotFoundException('Expediente no encontrado');
    if (found.status !== 'OPEN') throw new BadRequestException('Este expediente ya está cerrado');

    if (input.result === 'WON') {
      const clientId = input.clientId ?? found.clientId;
      if (!clientId) throw new BadRequestException('Indica el cliente con quien se cerró la operación');
      const accepted = await this.prisma.db.offer.findFirst({ where: { caseId, status: 'ACCEPTED' }, orderBy: { decidedAt: 'desc' } });
      const closedPrice = input.closedPrice ?? Number(accepted?.amount ?? found.price);
      await this.prisma.db.reservation.updateMany({ where: { caseId, status: 'ACTIVE' }, data: { status: 'APPLIED' } });
      await this.prisma.db.offer.updateMany({ where: { caseId, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: new Date() } });
      await this.prisma.db.commercialCase.update({
        where: { id: caseId },
        data: { status: 'WON', clientId, closedPrice, closedAt: new Date() },
      });
      await this.prisma.db.property.update({
        where: { id: found.propertyId },
        data: { status: found.operation === 'SALE' ? 'SOLD' : 'RENTED', isPublished: false },
      });
      await this.prisma.db.contact.update({ where: { id: clientId }, data: { type: found.operation === 'SALE' ? 'BUYER' : 'TENANT' } });
      await this.prisma.db.lead.updateMany({ where: { caseId, contactId: clientId }, data: { status: 'CLOSED' } });
      for (const s of ['NEGOTIATION'] as CaseStage[]) await this.setStatus(caseId, s, 'DONE');
      const legal = await this.prisma.db.commercialStage.findFirst({ where: { caseId, stage: 'LEGAL' } });
      if (legal?.status === 'PENDING') await this.setStatus(caseId, 'LEGAL', 'IN_PROGRESS');
      await this.activity.log('case', caseId, `Operación cerrada como GANADA por ${found.currency} ${closedPrice.toLocaleString('es-BO')}`);
      await this.activity.log('property', found.propertyId, found.operation === 'SALE' ? 'Propiedad vendida' : 'Propiedad alquilada', caseId);
      // Una operación cerrada alimenta finanzas y comisiones. Si algo falla aquí, el cierre ya quedó hecho.
      await this.finance.onCaseWon(caseId).catch((e) => this.logger.error(`No se pudo generar la comisión de ${caseId}: ${e}`));
      await this.automations.onCaseWon({ id: caseId, code: found.code, agentId: found.agentId, clientId });
      await this.webhooks.emit('case.won', { id: caseId, code: found.code, propertyCode: found.property.code, operation: found.operation, closedPrice, currency: found.currency });
    } else {
      await this.prisma.db.commercialCase.update({
        where: { id: caseId },
        data: { status: 'LOST', lostReason: input.lostReason ?? null, closedAt: new Date() },
      });
      if (['NEGOTIATING', 'RESERVED'].includes(found.property.status)) {
        await this.prisma.db.property.update({ where: { id: found.propertyId }, data: { status: 'AVAILABLE' } });
      }
      await this.prisma.db.reservation.updateMany({ where: { caseId, status: 'ACTIVE' }, data: { status: 'CANCELLED' } });
      await this.prisma.db.offer.updateMany({ where: { caseId, status: 'PENDING' }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
      await this.activity.log('case', caseId, `Operación cerrada como PERDIDA${input.lostReason ? `: ${input.lostReason}` : ''}`);
      await this.webhooks.emit('case.lost', { id: caseId, code: found.code, propertyCode: found.property.code, reason: input.lostReason ?? null });
    }
    await this.recompute(caseId);
  }
}
