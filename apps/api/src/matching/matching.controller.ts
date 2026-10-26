import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators.js';
import { ownScope } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MATCH_THRESHOLD, matchScore } from './match.js';

const ON_OFFER = ['AVAILABLE', 'RESERVED', 'NEGOTIATING'] as const;
const prefs = { prefOperation: true, prefType: true, prefZone: true, prefBudgetMax: true, prefCurrency: true, prefBedrooms: true } as const;

/** Relaciona automáticamente clientes con propiedades. */
@Roles('ADMIN', 'AGENT', 'ACCOUNTANT')
@Controller('matching')
export class MatchingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  /** Clientes cuyas preferencias coinciden con esta propiedad. */
  @Get('properties/:id')
  async forProperty(@Param('id') id: string) {
    await this.limits.assertFeature('matching', 'El matching');
    const property = await this.prisma.db.property.findFirst({ where: { id, ...ownScope() } });
    if (!property) throw new NotFoundException('Propiedad no encontrada');
    const contacts = await this.prisma.db.contact.findMany({
      where: { ...ownScope('assignedAgentId'), type: { notIn: ['OWNER'] }, id: { not: property.ownerId ?? '' } },
      select: { id: true, fullName: true, phone: true, type: true, ...prefs },
      take: 2000,
    });
    return contacts
      .map((c) => ({ contact: { id: c.id, fullName: c.fullName, phone: c.phone, type: c.type }, match: matchScore(c, property) }))
      .filter((r) => r.match && r.match.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.match!.score - a.match!.score)
      .slice(0, 50)
      .map((r) => ({ ...r.contact, ...r.match! }));
  }

  /** Propiedades en oferta compatibles con lo que busca este cliente. */
  @Get('contacts/:id')
  async forContact(@Param('id') id: string) {
    await this.limits.assertFeature('matching', 'El matching');
    const contact = await this.prisma.db.contact.findFirst({ where: { id, ...ownScope('assignedAgentId') }, select: { id: true, ...prefs } });
    if (!contact) throw new NotFoundException('Contacto no encontrado');
    // Se muestran propiedades de toda la empresa: el agente puede ofrecer inmuebles de sus colegas.
    const properties = await this.prisma.db.property.findMany({
      where: { status: { in: [...ON_OFFER] }, ...(contact.prefOperation ? { operation: contact.prefOperation } : {}) },
      select: { id: true, code: true, title: true, operation: true, type: true, zone: true, price: true, currency: true, bedrooms: true, isPublished: true, agent: { select: { fullName: true } } },
      take: 2000,
    });
    return properties
      .map((p) => ({ property: p, match: matchScore(contact, p) }))
      .filter((r) => r.match && r.match.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.match!.score - a.match!.score)
      .slice(0, 50)
      .map((r) => ({ ...r.property, ...r.match! }));
  }
}
