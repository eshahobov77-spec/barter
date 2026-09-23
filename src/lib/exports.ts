/** Chiroyli formatlangan .xlsx eksportlar (Django barter/exports.py). */
import ExcelJS from 'exceljs';
import { CLOSE_REASON, GROUP_LABELS, SUPPLY_STATUS, TX_KIND } from './constants';
import { num, isoDate, dmy } from './format';

const FONT = 'Arial';
const HEAD_FILL: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
const HEAD_FONT: any = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const BODY_FONT: any = { name: FONT, size: 10 };
const BOLD: any = { name: FONT, size: 10, bold: true };
const TITLE: any = { name: FONT, size: 14, bold: true };
const LINE: any = { bottom: { style: 'thin', color: { argb: 'FFD9D9E3' } } };
const MONEY_FMT = '#,##0;(#,##0);-';

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheet(
  wb: ExcelJS.Workbook,
  title: string,
  heading: string,
  columns: [string, number][],
  startRow = 4,
) {
  const ws = wb.addWorksheet(title);
  ws.getCell('A1').value = heading;
  ws.getCell('A1').font = TITLE;
  ws.getCell('A2').value = `Yaratildi: ${dmy(new Date())}`;
  ws.getCell('A2').font = { name: FONT, size: 9, color: { argb: 'FF6B7280' } } as any;

  columns.forEach(([name, width], i) => {
    const c = ws.getCell(startRow, i + 1);
    c.value = name;
    c.fill = HEAD_FILL;
    c.font = HEAD_FONT;
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = width;
  });
  ws.getRow(startRow).height = 30;
  ws.views = [{ state: 'frozen', ySplit: startRow }];
  return ws;
}

function styleRow(
  ws: ExcelJS.Worksheet,
  row: number,
  ncols: number,
  moneyCols: number[] = [],
  dateCols: number[] = [],
) {
  for (let c = 1; c <= ncols; c++) {
    const cell = ws.getCell(row, c);
    cell.font = BODY_FONT;
    cell.border = LINE;
    if (moneyCols.includes(c)) cell.numFmt = MONEY_FMT;
    else if (dateCols.includes(c)) cell.numFmt = 'dd.mm.yyyy hh:mm';
  }
}

function totalRow(
  ws: ExcelJS.Worksheet,
  row: number,
  labelCol: number,
  sumCols: number[],
  first: number,
  last: number,
  fn = 'SUBTOTAL(9,',
) {
  const label = ws.getCell(row, labelCol);
  label.value = 'JAMI';
  label.font = BOLD;
  for (const c of sumCols) {
    const L = colLetter(c);
    const cell = ws.getCell(row, c);
    cell.value = {
      formula: fn === 'SUM(' ? `SUM(${L}${first}:${L}${last})` : `SUBTOTAL(9,${L}${first}:${L}${last})`,
    } as any;
    cell.font = BOLD;
    cell.numFmt = MONEY_FMT;
  }
}

export async function exportContracts(rows: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cols: [string, number][] = [
    ['№', 6], ['Shartnoma raqami', 16], ['Barterchi', 38], ['Telefon', 30], ['Sana', 17],
    ['TJM', 20], ['Hom ashyo', 16], ['Guruh', 20], ['Holat', 14], ['Umumiy summa', 17],
    ['Yopilgan (chek + tushum)', 18], ['Qoldiq summa', 17], ["Qarzdorlik (grafik bo'yicha)", 19],
    ['Oxirgi tushum', 17], ['Yopilgan', 10],
  ];
  const ws = sheet(wb, 'Barterlar', 'Barter shartnomalari', cols);
  const first = 5;
  let row = 5;
  rows.forEach((c, i) => {
    const added = ws.addRow([
      i + 1,
      c.number,
      c.supplier.fullName,
      (c.supplier.phones || []).map((p: any) => p.phone).join(', '),
      c.contractDate || null,
      c.tjm.name,
      c.materialType,
      GROUP_LABELS[c.materialGroup] || c.materialGroup,
      c.supplyStatus ? SUPPLY_STATUS[c.supplyStatus] : '',
      num(c.totalAmount),
      num(c.paidAmount),
      null,
      num(c.debtAmount),
      c.lastPaymentAt || null,
      c.isClosed ? 'Ha' : '',
    ]);
    row = added.number;
    added.getCell(12).value = { formula: `J${row}-K${row}` } as any;
    styleRow(ws, row, cols.length, [10, 11, 12, 13], [5, 14]);
    row += 1;
  });
  const last = row - 1;
  if (last >= first) {
    totalRow(ws, row, 9, [10, 11, 12, 13], first, last);
    ws.autoFilter = { from: 'A4', to: `${colLetter(cols.length)}${last}` } as any;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function exportPayments(rows: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cols: [string, number][] = [
    ['Sana', 12], ['Kiritilgan vaqt', 17], ['Barterchi', 38], ['TJM', 20], ['Shartnoma', 16],
    ['Turi', 22], ["Summa (so'm)", 17], ['Izoh', 40], ['Operator', 24], ['Shartnoma holati', 14],
  ];
  const ws = sheet(wb, 'Tushumlar', 'Tushumlar tarixi', cols);
  const first = 5;
  let row = 5;
  for (const t of rows) {
    const added = ws.addRow([
      t.operationDate || null,
      t.createdAt || null,
      t.contract.supplier.fullName,
      t.contract.tjm.name,
      t.contract.number,
      TX_KIND[t.kind] || t.kind,
      num(t.amount),
      t.note,
      t.createdBy ? t.createdBy.fullName || t.createdBy.username : '',
      t.contract.isClosed ? 'Yopilgan' : 'Faol',
    ]);
    row = added.number;
    styleRow(ws, row, cols.length, [7], [2]);
    ws.getCell(row, 1).numFmt = 'dd.mm.yyyy';
    row += 1;
  }
  const last = row - 1;
  if (last >= first) {
    totalRow(ws, row, 6, [7], first, last);
    ws.autoFilter = { from: 'A4', to: `${colLetter(cols.length)}${last}` } as any;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function exportMonthly(report: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cols: [string, number][] = [
    ['TJM', 26], ['Aktiv shartnomalar', 14], ['Qoldiq summa', 18],
    ["Qarzdorlik (grafik bo'yicha)", 19], ['Qarzdorlar soni', 13],
    ['Oy tushumi', 17], ['Tushumlar soni', 12], ['Yopildi (soni)', 12], ['Yopilgan summa', 17],
  ];
  const ws = sheet(wb, 'Oylik hisobot', `Oylik hisobot — ${report.label}`, cols, 10);

  const cur = report.cur;
  const summary: [string, number, boolean][] = [
    ['Oy tushumi', cur.paySum, true],
    ['Tushumlar soni', cur.payCount, false],
    ['Yopilgan shartnomalar', cur.closedCount, false],
    ['Yangi shartnomalar', cur.newCount, false],
    ["Qo'ng'iroqlar", cur.calls, false],
    ['Aktiv shartnomalar', report.active, false],
    ['Qoldiq summa (hozir)', report.remaining, true],
    ["Qarzdorlik (grafik bo'yicha)", report.debt, true],
    ['Qarzdorlar soni', report.debtors, false],
  ];
  summary.forEach(([label, value, isMoney], i) => {
    const r = 3 + Math.floor(i / 2);
    const col = 1 + (i % 2) * 3;
    const lc = ws.getCell(r, col);
    lc.value = label;
    lc.font = BODY_FONT;
    const vc = ws.getCell(r, col + 1);
    vc.value = value;
    vc.font = BOLD;
    if (isMoney) vc.numFmt = MONEY_FMT;
  });

  const first = 11;
  let row = 11;
  for (const r of report.rows) {
    const added = ws.addRow([
      r.tjmName, r.active, r.remaining, r.debt, r.debtors,
      r.paySum, r.payCount, r.closedCount, r.closedSum,
    ]);
    row = added.number;
    styleRow(ws, row, cols.length, [3, 4, 6, 9]);
    row += 1;
  }
  const last = row - 1;
  if (last >= first) {
    const lbl = ws.getCell(row, 1);
    lbl.value = 'JAMI';
    lbl.font = BOLD;
    for (const c of [2, 3, 4, 5, 6, 7, 8, 9]) {
      const L = colLetter(c);
      const cell = ws.getCell(row, c);
      cell.value = { formula: `SUM(${L}${first}:${L}${last})` } as any;
      cell.font = BOLD;
      if ([3, 4, 6, 9].includes(c)) cell.numFmt = MONEY_FMT;
    }
  }
  const foot = ws.getCell(row + 2, 1);
  foot.value =
    "«Qoldiq summa» — uylarning to'lanmagan qolgan summasi. " +
    "«Qarzdorlik» — grafik bo'yicha muddati o'tib to'lanmagan summa.";
  foot.font = { name: FONT, size: 9, color: { argb: 'FF6B7280' } } as any;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxFilename(prefix: string, suffix?: string): string {
  return `${prefix}_${suffix || isoDate(new Date()).replace(/-/g, '')}.xlsx`;
}
