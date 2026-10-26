import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { canAssign, current, managedBranch } from './current.js';

/**
 * Verifica que los ids recibidos pertenezcan a la empresa actual antes de guardarlos
 * como relación. Sin esto, alguien podría enlazar registros de otra empresa por su id.
 */
@Injectable()
export class RefsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Agente al que se asigna un registro. El agente común se asigna a sí mismo; el jefe de sucursal puede
   * elegir a alguien de su sucursal; el administrador a cualquiera. Lanza 400 si la persona no es válida.
   */
  async agentFor(requested: string | null | undefined, fallback: string | null): Promise<string | null> {
    const me = current();
    if (!canAssign()) return me.userId;
    const id = requested ?? fallback;
    if (!id) return null;
    await this.assertAssignable(id);
    return id;
  }

  async assertAssignable(agentId: string) {
    const branch = managedBranch();
    const ok = await this.prisma.db.user.count({ where: { id: agentId, isActive: true, role: { in: ['ADMIN', 'AGENT'] }, ...(branch ? { branchId: branch } : {}) } });
    if (!ok) throw new BadRequestException(branch ? 'Solo puedes asignar a agentes de tu sucursal' : 'No se encontró el agente indicado');
  }

  async assert(refs: {
    propertyId?: string | null;
    contactId?: string | null;
    ownerId?: string | null;
    clientId?: string | null;
    agentId?: string | null;
    leadId?: string | null;
    caseId?: string | null;
  }) {
    const db = this.prisma.db;
    const checks: Array<[string, Promise<number>]> = [];
    const add = (label: string, id: string | null | undefined, count: (id: string) => Promise<number>) => {
      if (id) checks.push([label, count(id)]);
    };
    add('la propiedad', refs.propertyId, (id) => db.property.count({ where: { id } }));
    add('el contacto', refs.contactId, (id) => db.contact.count({ where: { id } }));
    add('el propietario', refs.ownerId, (id) => db.contact.count({ where: { id } }));
    add('el cliente', refs.clientId, (id) => db.contact.count({ where: { id } }));
    add('el agente', refs.agentId, (id) =>
      db.user.count({ where: { id, isActive: true, role: { in: ['ADMIN', 'AGENT'] } } }),
    );
    add('el lead', refs.leadId, (id) => db.lead.count({ where: { id } }));
    add('el expediente', refs.caseId, (id) => db.commercialCase.count({ where: { id } }));
    for (const [label, promise] of checks) {
      if ((await promise) === 0) throw new BadRequestException(`No se encontró ${label} indicado`);
    }
  }
}
