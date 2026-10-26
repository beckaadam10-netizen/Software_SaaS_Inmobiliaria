import { ForbiddenException, Injectable } from '@nestjs/common';
import { LimitsService } from '../common/limits.service.js';
import { requestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_ACCOUNTS, entryFor, reverse, type Line, type PostedLine } from './ledger.js';

/**
 * Libros contables de la empresa. Los asientos automáticos se derivan de los movimientos de Finanzas:
 * `sync` crea los que falten, así los libros siempre coinciden con Finanzas aunque el módulo se active tarde.
 */
type PostInput = { date: Date; description: string; currency: string; sourceType: string; sourceId: string | null; lines: Line[]; createdById?: string | null };

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
  ) {}

  private tenantId() {
    return requestContext.get()!.tenantId!;
  }

  async assertEnabled() {
    const { plan } = await this.limits.usage();
    if (!plan.features.includes('accounting')) throw new ForbiddenException(`La contabilidad no está incluida en tu plan ${plan.name}. Actualiza tu plan para usarla.`);
  }

  /** Plan de cuentas; la primera vez crea el plan inicial. */
  async accounts() {
    const db = this.prisma.db;
    const existing = await db.account.findMany({ orderBy: { code: 'asc' } });
    // Crea las cuentas de sistema que falten (también las que se agregaron en versiones nuevas).
    const missing = DEFAULT_ACCOUNTS.filter((a) => !existing.some((e) => e.code === a.code));
    if (!missing.length) return existing;
    await db.account.createMany({ data: missing.map((a) => ({ ...a, tenantId: this.tenantId(), isSystem: true })), skipDuplicates: true });
    return db.account.findMany({ orderBy: { code: 'asc' } });
  }

  /**
   * Los asientos de una empresa se numeran en orden: se registran de a uno para que dos pantallas
   * abiertas a la vez no generen el mismo número ni dupliquen un asiento automático.
   */
  private static queues = new Map<string, Promise<unknown>>();
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const key = this.tenantId();
    const prev = AccountingService.queues.get(key) ?? Promise.resolve();
    const run = prev.catch(() => null).then(fn);
    const tail = run.catch(() => null);
    AccountingService.queues.set(key, tail);
    void tail.then(() => { if (AccountingService.queues.get(key) === tail) AccountingService.queues.delete(key); });
    return run;
  }

  post(input: PostInput) {
    return this.serial(() => this.postNow(input));
  }

  private async postNow(input: PostInput) {
    const db = this.prisma.db;
    const accounts = await this.accounts();
    const idOf = (code: string) => accounts.find((a) => a.code === code)!.id;
    const last = await db.journalEntry.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const entry = await db.journalEntry.create({
      data: { tenantId: this.tenantId(), number: (last?.number ?? 0) + 1, date: input.date, description: input.description.slice(0, 190), currency: input.currency, sourceType: input.sourceType, sourceId: input.sourceId, createdById: input.createdById ?? null },
    });
    await db.journalLine.createMany({ data: input.lines.map((l) => ({ tenantId: this.tenantId(), entryId: entry.id, accountId: idOf(l.accountCode), debit: l.debit, credit: l.credit })) });
    return entry;
  }

  /** Crea los asientos que falten: uno por movimiento y uno de reversión por cada movimiento anulado. */
  sync() {
    return this.serial(() => this.syncNow());
  }

  private async syncNow() {
    const db = this.prisma.db;
    const [txs, entries] = await Promise.all([
      db.transaction.findMany({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], select: { id: true, kind: true, category: true, amount: true, currency: true, date: true, method: true, description: true, voidedAt: true, voidReason: true } }),
      db.journalEntry.findMany({ where: { sourceType: { in: ['transaction', 'transaction_void'] } }, select: { sourceType: true, sourceId: true } }),
    ]);
    const done = new Set(entries.map((e) => `${e.sourceType}:${e.sourceId}`));
    let created = 0;
    for (const t of txs) {
      const lines = entryFor({ kind: t.kind, category: t.category, amount: Number(t.amount), method: t.method });
      if (!done.has(`transaction:${t.id}`)) {
        await this.postNow({ date: t.date, description: t.description, currency: t.currency, sourceType: 'transaction', sourceId: t.id, lines });
        created++;
      }
      if (t.voidedAt && !done.has(`transaction_void:${t.id}`)) {
        await this.postNow({ date: t.voidedAt, description: `Anulación: ${t.description}${t.voidReason ? ` (${t.voidReason})` : ''}`, currency: t.currency, sourceType: 'transaction_void', sourceId: t.id, lines: reverse(lines) });
        created++;
      }
    }
    return created;
  }

  /** Líneas asentadas hasta una fecha, listas para los reportes. */
  async lines(range: { from?: Date; to?: Date }): Promise<PostedLine[]> {
    const rows = await this.prisma.db.journalLine.findMany({
      where: { entry: { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: new Date(range.to.getTime() + 864e5) } : {}) } } },
      select: { debit: true, credit: true, account: { select: { code: true } }, entry: { select: { number: true, date: true, description: true, currency: true, sourceType: true } } },
      take: 100000,
    });
    return rows.map((r) => ({ accountCode: r.account.code, debit: Number(r.debit), credit: Number(r.credit), currency: r.entry.currency, date: r.entry.date, entryNumber: r.entry.number, description: r.entry.description, sourceType: r.entry.sourceType }));
  }
}
