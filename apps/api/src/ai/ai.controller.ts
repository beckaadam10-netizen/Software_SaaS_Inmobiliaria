import { Body, Controller, Get, NotFoundException, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { current, currentBranch, ownScope, restrictedAgent } from '../common/current.js';
import { optText, text, validate } from '../common/validate.js';
import { answer, SUGGESTIONS } from '../insights/assistant.js';
import { SnapshotService } from '../insights/snapshot.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiService } from './ai.service.js';
import { CONTENT_KINDS, contentPrompt, templateContent, type PropertyFacts } from './content.js';

const contentSchema = z.object({ propertyId: z.string().min(1).max(40), kind: z.enum(CONTENT_KINDS as [string, ...string[]]), tone: optText(40) });
const askSchema = z.object({ question: text(300) });

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly snapshots: SnapshotService,
  ) {}

  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Get('status')
  async status() {
    return { ...(await this.ai.status()), suggestions: SUGGESTIONS };
  }

  /** Redacta contenido de marketing de una propiedad. Con proveedor usa IA; sin él, plantillas. */
  @Roles('ADMIN', 'AGENT')
  @Post('content')
  async content(@Body() body: unknown, @Req() req: Request) {
    const data = validate(contentSchema, body);
    await this.ai.assertAllowed('content');
    const p = await this.prisma.db.property.findFirst({ where: { id: data.propertyId, ...ownScope() }, include: { agent: { select: { fullName: true } }, tenant: { select: { name: true } } } });
    if (!p) throw new NotFoundException('Propiedad no encontrada');
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? '';
    // Solo datos que ya son públicos en el portal: nunca dirección exacta, propietario ni datos internos.
    const facts: PropertyFacts = {
      code: p.code, title: p.title, type: p.type, operation: p.operation, price: Number(p.price), currency: p.currency, zone: p.zone, city: p.city,
      areaM2: p.areaM2, builtM2: p.builtM2, bedrooms: p.bedrooms, bathrooms: p.bathrooms, parking: p.parking,
      features: Array.isArray(p.features) ? (p.features as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      description: p.description, company: p.tenant.name, agent: p.agent?.fullName ?? null, link: `${req.protocol}://${host}/p/${p.code}`,
    };
    const kind = data.kind as (typeof CONTENT_KINDS)[number];
    const { system, prompt } = contentPrompt(kind, facts, data.tone ?? undefined);
    const done = await this.ai.complete(system, prompt);
    await this.ai.record('content', done ? this.ai.provider! : 'plantilla', done ?? undefined);
    return { kind, text: done?.text ?? templateContent(kind, facts), source: done ? 'ai' : 'template' };
  }

  /** Asistente: responde con los datos reales de la empresa. Las cifras salen de reglas, no del modelo. */
  @Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
  @Post('assistant')
  async assistant(@Body() body: unknown) {
    const { question } = validate(askSchema, body);
    await this.ai.assertAllowed('assistant');
    const me = current();
    const [snapshot, user] = await Promise.all([
      this.snapshots.load({ agentId: restrictedAgent() ? me.userId : undefined, branchId: currentBranch() ?? undefined, finance: me.role !== 'AGENT' }),
      this.prisma.db.user.findUniqueOrThrow({ where: { id: me.userId }, select: { id: true, fullName: true } }),
    ]);
    const result = answer(question, snapshot, user);
    await this.ai.record('assistant', 'reglas');
    return result;
  }
}
