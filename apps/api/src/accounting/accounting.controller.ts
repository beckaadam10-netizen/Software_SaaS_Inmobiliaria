import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { AuditService } from '../common/audit.service.js';
import { current } from '../common/current.js';
import { currency, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountingService } from './accounting.service.js';
import { FinanceService } from '../finance/finance.service.js';
import { balanceSheet, closingLines, entryError, inYear, incomeStatement, ledger, localYear, round2, trialBalance, yearEnd } from './ledger.js';

const date = z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.date().optional());
const rangeSchema = z.object({ from: date, to: date });
const accountSchema = z.object({ code: z.string().trim().regex(/^\d{4,10}$/, 'El código lleva de 4 a 10 dígitos'), name: text(120), type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']) });
const amount = z.coerce.number().min(0).max(1e11);
const entrySchema = z.object({
  date: z.coerce.date(), description: text(190), currency,
  lines: z.array(z.object({ accountId: z.string().min(1).max(40), debit: amount.default(0), credit: amount.default(0) })).min(2).max(40),
});

/** Contabilidad de doble partida. La gestionan el administrador y el contador. */
@Roles('ADMIN', 'ACCOUNTANT')
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accounting: AccountingService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly finance: FinanceService,
  ) {}

  private async ready() {
    await this.accounting.assertEnabled();
    await this.accounting.sync();
  }

  @Get('accounts')
  async accounts() {
    await this.accounting.assertEnabled();
    return this.accounting.accounts();
  }

  @Post('accounts')
  async createAccount(@Body() body: unknown) {
    await this.accounting.assertEnabled();
    const data = validate(accountSchema, body);
    const all = await this.accounting.accounts();
    if (all.some((a) => a.code === data.code)) throw new BadRequestException('Ya existe una cuenta con ese código');
    return this.prisma.db.account.create({ data: { ...data, tenantId: current().tenantId } });
  }

  /** Libro diario: los asientos en orden, con sus líneas. */
  @Get('journal')
  async journal(@Query() query: unknown) {
    await this.ready();
    const r = validate(rangeSchema, query);
    const rows = await this.prisma.db.journalEntry.findMany({
      where: { date: { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lt: new Date(r.to.getTime() + 864e5) } : {}) } },
      orderBy: { number: 'desc' }, take: 300,
      include: { lines: { orderBy: { debit: 'desc' }, select: { debit: true, credit: true, account: { select: { code: true, name: true } } } } },
    });
    return rows.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit) })) }));
  }

  /** Asiento manual (aporte de capital, ajustes). Debe cuadrar. */
  @Post('journal')
  async createEntry(@Body() body: unknown) {
    await this.accounting.assertEnabled();
    const data = validate(entrySchema, body);
    const accounts = await this.accounting.accounts();
    const lines = data.lines.map((l) => {
      const account = accounts.find((a) => a.id === l.accountId);
      if (!account) throw new BadRequestException('Una de las cuentas no existe');
      return { accountCode: account.code, debit: round2(l.debit), credit: round2(l.credit) };
    });
    const error = entryError(lines);
    if (error) throw new BadRequestException(error);
    await this.finance.assertOpenPeriod(data.date, data.currency);
    const entry = await this.accounting.post({ date: data.date, description: data.description, currency: data.currency, sourceType: 'manual', sourceId: null, lines, createdById: current().userId });
    await this.audit.record('journal', entry.id, 'Asiento manual registrado', null, { number: entry.number, description: entry.description, currency: entry.currency, lines });
    return entry;
  }

  /** Balance de comprobación, estado de resultados y balance general, por moneda. */
  @Get('statements')
  async statements(@Query() query: unknown) {
    await this.ready();
    const r = validate(rangeSchema, query);
    const [accounts, lines] = await Promise.all([this.accounting.accounts(), this.accounting.lines(r)]);
    // El balance general es acumulado: toma todo hasta la fecha final, sin fecha inicial.
    const cumulative = r.from ? await this.accounting.lines({ to: r.to }) : lines;
    const currencies = [...new Set(cumulative.map((l) => l.currency))].sort().reverse();
    // El asiento de cierre no cuenta en el resultado del periodo: solo traslada el saldo al patrimonio.
    const operating = lines.filter((l) => l.sourceType !== 'closing');
    return currencies.map((cur) => {
      const trial = trialBalance(accounts, operating, cur);
      return { currency: cur, trial, income: incomeStatement(trial.rows), balance: balanceSheet(trialBalance(accounts, cumulative, cur).rows) };
    });
  }

  // ---------- Cierre de gestión ----------
  @Get('closings')
  async closings() {
    await this.ready();
    const [rows, lines] = await Promise.all([this.prisma.db.accountingClosing.findMany({ orderBy: [{ year: 'desc' }, { currency: 'asc' }] }), this.accounting.lines({})]);
    const current = localYear(new Date());
    const years = [...new Set(lines.filter((l) => l.sourceType !== 'closing').map((l) => localYear(l.date)))].filter((y) => y < current).sort();
    const open = years.filter((y) => !rows.some((r) => r.year === y));
    return { closings: rows.map((r) => ({ ...r, result: Number(r.result) })), closable: open };
  }

  /** Cierra una gestión (año calendario) en todas las monedas con movimientos. Las fechas de ese año quedan bloqueadas. */
  @Post('closings')
  async close(@Body() body: unknown) {
    const { year } = validate(z.object({ year: z.coerce.number().int().min(2000).max(2100) }), body);
    await this.ready();
    if (year >= localYear(new Date())) throw new BadRequestException(`La gestión ${year} todavía no terminó: se cierra a partir del 1 de enero de ${year + 1}`);
    const me = current();
    const [accounts, lines, done] = await Promise.all([this.accounting.accounts(), this.accounting.lines({}), this.prisma.db.accountingClosing.findMany()]);
    const operating = lines.filter((l) => l.sourceType !== 'closing');
    if (done.some((d) => d.year === year)) throw new BadRequestException(`La gestión ${year} ya está cerrada`);
    if (done.some((d) => d.year > year)) throw new BadRequestException('Ya hay una gestión posterior cerrada');
    if (!operating.some((l) => inYear(l.date, year))) throw new BadRequestException(`No hay movimientos en la gestión ${year}`);
    // Las gestiones se cierran en orden: la anterior con movimientos debe estar cerrada.
    const pending = [...new Set(operating.filter((l) => localYear(l.date) < year).map((l) => localYear(l.date)))].sort().find((y) => !done.some((d) => d.year === y));
    if (pending) throw new BadRequestException(`Primero cierra la gestión ${pending}`);
    // El cierre es de toda la empresa: se registra en cada moneda con movimientos hasta ese año.
    const currencies = [...new Set(operating.filter((l) => l.date.getTime() <= yearEnd(year).getTime()).map((l) => l.currency))];
    const out = [];
    for (const cur of currencies) {
      const rows = trialBalance(accounts, operating.filter((l) => inYear(l.date, year)), cur).rows;
      const { lines: closing, result } = closingLines(rows);
      const entry = closing.length >= 2
        ? await this.accounting.post({ date: yearEnd(year), description: `Cierre de la gestión ${year}`, currency: cur, sourceType: 'closing', sourceId: `${year}-${cur}`, lines: closing, createdById: me.userId })
        : null;
      const row = await this.prisma.db.accountingClosing.create({ data: { tenantId: me.tenantId, year, currency: cur, entryId: entry?.id ?? null, result, createdById: me.userId } });
      await this.audit.record('accounting_closings', row.id, `Gestión ${year} cerrada`, null, { year, currency: cur, result });
      out.push({ ...row, result });
    }
    return out;
  }

  /** Reabre la última gestión cerrada (solo el administrador). Borra su asiento de cierre y desbloquea las fechas. */
  @Roles('ADMIN')
  @Delete('closings/:year')
  async reopen(@Param('year') raw: string) {
    const year = Number(raw);
    const rows = await this.prisma.db.accountingClosing.findMany({ where: { year } });
    if (!rows.length) throw new NotFoundException('Esa gestión no está cerrada');
    if (await this.prisma.db.accountingClosing.count({ where: { year: { gt: year } } })) throw new BadRequestException('Solo se reabre la última gestión cerrada');
    for (const r of rows) {
      if (r.entryId) await this.prisma.db.journalEntry.delete({ where: { id: r.entryId } });
      await this.prisma.db.accountingClosing.delete({ where: { id: r.id } });
      await this.audit.record('accounting_closings', r.id, `Gestión ${year} reabierta`, { year, currency: r.currency, result: Number(r.result) }, null);
    }
    return { year };
  }

  /** Libro mayor de una cuenta. */
  @Get('ledger/:accountId')
  async ledger(@Param('accountId') accountId: string, @Query('currency') cur?: string) {
    await this.ready();
    const accounts = await this.accounting.accounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    const lines = await this.accounting.lines({});
    return { account, currency: cur === 'BOB' ? 'BOB' : 'USD', lines: ledger(account, lines, cur === 'BOB' ? 'BOB' : 'USD') };
  }
}
