import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { AuditService } from '../common/audit.service.js';
import { current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { currency, optText, text, validate } from '../common/validate.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../finance/money.js';
import { FinanceService } from '../finance/finance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseStatement, suggestMatches, type Candidate } from './statement.js';

const accountSchema = z.object({ name: text(80), bank: optText(80), number: optText(40), currency });
const importSchema = z.object({ csv: z.string().min(1).max(2_000_000, 'El archivo supera los 2 MB') });
const createSchema = z.object({ category: z.string().max(30), description: optText(190) });

/** Conciliación bancaria: se importa el extracto (CSV) y cada línea se empareja con un movimiento de Finanzas. */
@Roles('ADMIN', 'ACCOUNTANT')
@Controller('bank')
export class BankController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly audit: AuditService,
    private readonly finance: FinanceService,
  ) {}

  private gate() {
    return this.limits.assertFeature('bank_reconciliation', 'La conciliación bancaria');
  }
  private async account(id: string) {
    const a = await this.prisma.db.bankAccount.findFirst({ where: { id } });
    if (!a) throw new NotFoundException('Cuenta bancaria no encontrada');
    return a;
  }
  private async line(id: string) {
    const l = await this.prisma.db.bankLine.findFirst({ where: { id }, include: { bankAccount: { select: { currency: true, name: true } } } });
    if (!l) throw new NotFoundException('Línea del extracto no encontrada');
    return l;
  }

  @Get('accounts')
  async accounts() {
    await this.gate();
    const rows = await this.prisma.db.bankAccount.findMany({ orderBy: { createdAt: 'asc' }, include: { lines: { select: { amount: true, transactionId: true } } } });
    return rows.map(({ lines, ...a }) => ({ ...a, lines: lines.length, pending: lines.filter((l) => !l.transactionId).length, balance: Math.round(lines.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100 }));
  }

  @Post('accounts')
  async createAccount(@Body() body: unknown) {
    await this.gate();
    const data = validate(accountSchema, body);
    return this.prisma.db.bankAccount.create({ data: { ...data, tenantId: current().tenantId } });
  }

  /** Importa el extracto. Las líneas que ya estaban no se duplican. */
  @Post('accounts/:id/import')
  async import(@Param('id') id: string, @Body() body: unknown) {
    await this.gate();
    const account = await this.account(id);
    const { csv } = validate(importSchema, body);
    const parsed = parseStatement(csv);
    if (!parsed.lines.length) throw new BadRequestException(parsed.errors[0] ?? 'No se encontraron movimientos en el archivo');
    if (parsed.lines.length > 5000) throw new BadRequestException('El extracto tiene más de 5.000 líneas. Impórtalo por partes.');
    const { count } = await this.prisma.db.bankLine.createMany({
      data: parsed.lines.map((l) => ({ ...l, tenantId: account.tenantId, bankAccountId: id })), skipDuplicates: true,
    });
    return { imported: count, duplicated: parsed.lines.length - count, errors: parsed.errors };
  }

  /** Líneas del extracto. Las pendientes traen los movimientos que podrían corresponderles. */
  @Get('accounts/:id/lines')
  async lines(@Param('id') id: string) {
    await this.gate();
    const account = await this.account(id);
    const lines = await this.prisma.db.bankLine.findMany({ where: { bankAccountId: id }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1000 });
    const matchedIds = (await this.prisma.db.bankLine.findMany({ where: { transactionId: { not: null } }, select: { transactionId: true } })).map((l) => l.transactionId!);
    const txs = await this.prisma.db.transaction.findMany({
      where: { voidedAt: null, currency: account.currency, method: { not: 'CASH' } }, orderBy: { date: 'desc' }, take: 5000,
      select: { id: true, kind: true, amount: true, date: true, description: true },
    });
    const byId = new Map(txs.map((t) => [t.id, t]));
    const free: Candidate[] = txs.filter((t) => !matchedIds.includes(t.id)).map((t) => ({ ...t, amount: Number(t.amount) }));
    return lines.map((l) => {
      const matched = l.transactionId ? byId.get(l.transactionId) : null;
      return {
        id: l.id, date: l.date, description: l.description, reference: l.reference, amount: Number(l.amount),
        transaction: l.transactionId ? { id: l.transactionId, description: matched?.description ?? 'Movimiento', date: matched?.date ?? l.date } : null,
        suggestions: l.transactionId ? [] : suggestMatches({ amount: Number(l.amount), date: l.date }, free),
      };
    });
  }

  @Post('lines/:id/match')
  @HttpCode(200)
  async match(@Param('id') id: string, @Body() body: unknown) {
    const { transactionId } = validate(z.object({ transactionId: z.string().min(1).max(40) }), body);
    const line = await this.line(id);
    if (line.transactionId) throw new BadRequestException('Esta línea ya está conciliada');
    const tx = await this.prisma.db.transaction.findFirst({ where: { id: transactionId, voidedAt: null } });
    if (!tx) throw new NotFoundException('Movimiento no encontrado');
    const amount = Number(line.amount);
    if (tx.currency !== line.bankAccount.currency || (tx.kind === 'INCOME') !== amount > 0 || Math.abs(Number(tx.amount) - Math.abs(amount)) >= 0.005) {
      throw new BadRequestException('El movimiento no coincide en moneda, sentido o importe con la línea del extracto');
    }
    if (await this.prisma.db.bankLine.count({ where: { transactionId } })) throw new BadRequestException('Ese movimiento ya está conciliado con otra línea');
    await this.prisma.db.bankLine.update({ where: { id }, data: { transactionId } });
    await this.audit.record('bank', id, 'Línea conciliada', { transactionId: null }, { transactionId });
    return { id, transactionId };
  }

  @Delete('lines/:id/match')
  async unmatch(@Param('id') id: string) {
    const line = await this.line(id);
    if (!line.transactionId) throw new BadRequestException('Esta línea no está conciliada');
    await this.prisma.db.bankLine.update({ where: { id }, data: { transactionId: null } });
    await this.audit.record('bank', id, 'Conciliación deshecha', { transactionId: line.transactionId }, { transactionId: null });
    return { id };
  }

  /** Registra en Finanzas el movimiento que falta (por ejemplo una comisión bancaria) y lo deja conciliado. */
  @Post('lines/:id/create')
  async createFromLine(@Param('id') id: string, @Body() body: unknown) {
    const data = validate(createSchema, body);
    const line = await this.line(id);
    if (line.transactionId) throw new BadRequestException('Esta línea ya está conciliada');
    const amount = Number(line.amount);
    const kind = amount > 0 ? 'INCOME' : 'EXPENSE';
    if (!(kind === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(data.category as never)) throw new BadRequestException('Categoría no válida');
    await this.finance.assertOpenPeriod(line.date, line.bankAccount.currency);
    const me = current();
    const tx = await this.prisma.db.transaction.create({
      data: { tenantId: me.tenantId, kind, category: data.category, amount: Math.abs(amount), currency: line.bankAccount.currency, date: line.date, method: 'TRANSFER', description: data.description ?? line.description, createdById: me.userId },
    });
    await this.prisma.db.bankLine.update({ where: { id }, data: { transactionId: tx.id } });
    await this.audit.record('transactions', tx.id, `${kind === 'INCOME' ? 'Ingreso' : 'Gasto'} registrado desde el extracto bancario`, null, tx);
    return { id, transactionId: tx.id };
  }
}
