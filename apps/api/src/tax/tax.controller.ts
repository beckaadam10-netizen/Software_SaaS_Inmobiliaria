import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { AuditService } from '../common/audit.service.js';
import { current } from '../common/current.js';
import { LimitsService } from '../common/limits.service.js';
import { optText, text, validate } from '../common/validate.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toCsv, toPdf, toXlsx, type Report } from '../reports/exporters.js';
import { ivaSummary, monthRange, purchasesBook, salesBook } from './books.js';

const purchaseSchema = z.object({
  date: z.coerce.date(), supplierTaxId: z.string().trim().regex(/^[0-9A-Za-z-]{1,20}$/, 'NIT inválido'), supplierName: text(150),
  invoiceNumber: z.string().trim().regex(/^[0-9A-Za-z-]{1,30}$/, 'Número de factura inválido'), authCode: optText(100), total: z.coerce.number().positive().max(1e10),
});
const currentMonth = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 7);

/** Libros de compras y ventas IVA, en bolivianos. */
@Roles('ADMIN', 'ACCOUNTANT')
@Controller('tax')
export class TaxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: LimitsService,
    private readonly audit: AuditService,
  ) {}

  private async books(month: string) {
    await this.limits.assertFeature('invoicing', 'Los libros IVA');
    const range = monthRange(month);
    if (!range) throw new BadRequestException('Indica el mes como AAAA-MM');
    const period = { gte: range.from, lt: range.to };
    const [invoices, purchases, rates] = await Promise.all([
      this.prisma.db.invoice.findMany({ where: { status: { in: ['ISSUED', 'VOIDED'] }, number: { not: null }, date: period } }),
      this.prisma.db.purchaseInvoice.findMany({ where: { date: period } }),
      this.prisma.db.exchangeRate.findMany({ where: { date: { lt: range.to } } }),
    ]);
    const sales = salesBook(invoices.map((i) => ({ ...i, total: Number(i.total) })), rates.map((r) => ({ date: r.date, rate: Number(r.rate) })));
    const buys = purchasesBook(purchases.map((p) => ({ ...p, total: Number(p.total) })));
    return { month, sales, purchases: { ...buys, rows: buys.rows.map((r, i) => ({ ...r, id: purchases.find((p) => p.date.getTime() === r.date.getTime() && p.invoiceNumber === r.invoiceNumber && p.supplierTaxId === r.supplierTaxId)?.id ?? String(i) })) }, summary: ivaSummary(sales, buys) };
  }

  @Get('books')
  get(@Query('month') month?: string) {
    return this.books(month || currentMonth());
  }

  @Post('purchases')
  async addPurchase(@Body() body: unknown) {
    await this.limits.assertFeature('invoicing', 'Los libros IVA');
    const data = validate(purchaseSchema, body);
    if (await this.prisma.db.purchaseInvoice.count({ where: { supplierTaxId: data.supplierTaxId, invoiceNumber: data.invoiceNumber } })) {
      throw new BadRequestException('Esa factura de ese proveedor ya está registrada');
    }
    const me = current();
    const row = await this.prisma.db.purchaseInvoice.create({ data: { ...data, tenantId: me.tenantId, createdById: me.userId } });
    await this.audit.record('purchase_invoices', row.id, 'Factura de compra registrada', null, { ...data });
    return { ...row, total: Number(row.total) };
  }

  @Delete('purchases/:id')
  async removePurchase(@Param('id') id: string) {
    const row = await this.prisma.db.purchaseInvoice.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Factura de compra no encontrada');
    await this.prisma.db.purchaseInvoice.delete({ where: { id } });
    await this.audit.record('purchase_invoices', id, 'Factura de compra eliminada', { ...row, total: Number(row.total) }, null);
    return { id };
  }

  @Get('books/export')
  async export(@Query('month') month: string, @Query('book') book: string, @Query('format') format: string, @Res() res: Response) {
    const data = await this.books(month || currentMonth());
    const company = await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: current().tenantId }, select: { legalName: true, name: true, taxId: true } });
    const who = `${company.legalName ?? company.name}${company.taxId ? ` · NIT ${company.taxId}` : ''} · periodo ${data.month} · montos en bolivianos`;
    const report: Report = book === 'purchases'
      ? {
          title: 'Libro de compras IVA', subtitle: who,
          columns: [{ header: 'Fecha', key: 'date', type: 'date' }, { header: 'NIT proveedor', key: 'supplierTaxId' }, { header: 'Razón social', key: 'supplierName', width: 26 }, { header: 'N° factura', key: 'invoiceNumber' }, { header: 'Cód. autorización', key: 'authCode' }, { header: 'Importe total', key: 'total', type: 'money' }, { header: 'Base crédito fiscal', key: 'base', type: 'money' }, { header: 'Crédito fiscal 13 %', key: 'tax', type: 'money' }],
          rows: data.purchases.rows,
        }
      : {
          title: 'Libro de ventas IVA', subtitle: who,
          columns: [{ header: 'Fecha', key: 'date', type: 'date' }, { header: 'N° factura', key: 'number', type: 'number' }, { header: 'Estado', key: 'status' }, { header: 'NIT/CI cliente', key: 'customerTaxId' }, { header: 'Razón social', key: 'customerName', width: 26 }, { header: 'Importe total', key: 'total', type: 'money' }, { header: 'Base débito fiscal', key: 'base', type: 'money' }, { header: 'Débito fiscal 13 %', key: 'tax', type: 'money' }],
          rows: data.sales.rows,
        };
    const f = z.enum(['csv', 'xlsx', 'pdf']).safeParse(format).data ?? 'xlsx';
    const out = f === 'csv' ? Buffer.from(toCsv(report)) : f === 'pdf' ? await toPdf(report) : await toXlsx(report);
    res.setHeader('Content-Type', f === 'csv' ? 'text/csv; charset=utf-8' : f === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="libro-${book === 'purchases' ? 'compras' : 'ventas'}-${data.month}.${f}"`);
    res.send(out);
  }
}
