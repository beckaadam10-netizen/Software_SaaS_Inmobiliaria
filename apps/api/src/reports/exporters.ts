import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type ColumnType = 'text' | 'number' | 'money' | 'date' | 'datetime';
export interface Column {
  header: string;
  key: string;
  type?: ColumnType;
  width?: number;
}
export interface Report {
  title: string;
  subtitle: string;
  columns: Column[];
  rows: Array<Record<string, unknown>>;
}

const TZ = 'America/La_Paz';
const fmtDate = (v: unknown, withTime = false) =>
  v ? new Date(v as string).toLocaleString('es-BO', { timeZone: TZ, dateStyle: 'short', ...(withTime ? { timeStyle: 'short' } : {}) }) : '';
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

/** Valor como texto para CSV y PDF. */
function display(value: unknown, type: ColumnType = 'text'): string {
  if (value == null) return '';
  if (type === 'date') return fmtDate(value);
  if (type === 'datetime') return fmtDate(value, true);
  if (type === 'money') return (num(value) ?? 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (type === 'number') return String(num(value) ?? '');
  return String(value);
}

/**
 * Evita la inyección de fórmulas: una celda de texto que empieza con = + - @ se abriría
 * como fórmula en Excel. Se le antepone un apóstrofo.
 */
function safeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function toCsv(report: Report): Buffer {
  const cell = (text: string) => `"${text.replace(/"/g, '""')}"`;
  const lines = [
    report.columns.map((c) => cell(c.header)).join(';'),
    ...report.rows.map((row) =>
      report.columns
        .map((c) => {
          const value = row[c.key];
          // Los números van sin separador de miles para que Excel los reconozca.
          if ((c.type === 'money' || c.type === 'number') && value != null && value !== '') return String(num(value)).replace('.', ',');
          return cell(safeText(display(value, c.type)));
        })
        .join(';'),
    ),
  ];
  // BOM para que Excel lea bien los acentos; punto y coma como separador (configuración regional en español).
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

export async function toXlsx(report: Report): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Soft_Inmo';
  const sheet = book.addWorksheet(report.title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 }] });
  sheet.addRow([report.title]).font = { bold: true, size: 14, color: { argb: 'FF0B3C49' } };
  sheet.addRow([report.subtitle]).font = { color: { argb: 'FF52606D' } };
  const header = sheet.addRow(report.columns.map((c) => c.header));
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFF1FAF7' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3C49' } };
  });
  for (const row of report.rows) {
    sheet.addRow(
      report.columns.map((c) => {
        const value = row[c.key];
        if (value == null || value === '') return null;
        if (c.type === 'money' || c.type === 'number') return num(value);
        if (c.type === 'date' || c.type === 'datetime') return new Date(value as string);
        return safeText(String(value));
      }),
    );
  }
  report.columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = c.width ?? (c.type === 'money' ? 16 : c.type === 'date' ? 13 : c.type === 'datetime' ? 18 : 24);
    if (c.type === 'money') col.numFmt = '#,##0.00';
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy';
    if (c.type === 'datetime') col.numFmt = 'dd/mm/yyyy hh:mm';
  });
  if (report.rows.length) sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: report.columns.length } };
  return Buffer.from(await book.xlsx.writeBuffer());
}

export function toPdf(report: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: report.title, Author: 'Soft_Inmo' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = doc.page.height - doc.page.margins.bottom - 14;
    const weights = report.columns.map((c) => c.width ?? (c.type === 'money' || c.type === 'number' ? 12 : c.type === 'date' ? 11 : c.type === 'datetime' ? 15 : 22));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * width);
    const right = (c: Column) => c.type === 'money' || c.type === 'number';
    // Las fuentes incluidas en PDF no tienen todos los símbolos: se reemplazan los que no existen.
    const clean = (s: string) => s.replace(/[→←]/g, '-').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…]/g, '?');

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(left, y, width, 18).fill('#0B3C49');
      doc.fillColor('#F1FAF7').font('Helvetica-Bold').fontSize(8);
      let x = left;
      report.columns.forEach((c, i) => {
        doc.text(clean(c.header), x + 4, y + 5, { width: widths[i] - 8, align: right(c) ? 'right' : 'left', lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + 18;
    };

    doc.fillColor('#0B3C49').font('Helvetica-Bold').fontSize(16).text(clean(report.title), left, doc.page.margins.top);
    doc.fillColor('#52606D').font('Helvetica').fontSize(9).text(clean(report.subtitle));
    doc.moveDown(0.8);
    drawHeader();

    report.rows.forEach((row, index) => {
      doc.font('Helvetica').fontSize(8);
      const cells = report.columns.map((c) => clean(display(row[c.key], c.type)));
      const height = Math.max(...cells.map((text, i) => doc.heightOfString(text, { width: widths[i] - 8 }))) + 6;
      if (doc.y + height > bottom) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      if (index % 2 === 1) doc.rect(left, y, width, height).fill('#F1FAF7');
      doc.fillColor('#1F2933').font('Helvetica').fontSize(8);
      let x = left;
      cells.forEach((text, i) => {
        doc.text(text, x + 4, y + 3, { width: widths[i] - 8, align: right(report.columns[i]) ? 'right' : 'left' });
        x += widths[i];
      });
      doc.y = y + height;
    });
    if (!report.rows.length) doc.moveDown().fillColor('#52606D').fontSize(10).text('No hay datos para este reporte en el periodo elegido.', left);

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      doc.fillColor('#52606D').font('Helvetica').fontSize(8).text(`Soft_Inmo · Página ${i + 1} de ${pages.count}`, left, doc.page.height - doc.page.margins.bottom - 4, { width, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
