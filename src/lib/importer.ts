/** Excel → bazaga import. Qayta ishga tushirsa ham xavfsiz (idempotent). */
import ExcelJS from 'exceljs';
import prisma from './db';
import { logAction } from './audit';
import { cleanRows, searchKey, tjmKey, type CleanRow } from './cleaning';
import { recalculate } from './services';
import { num, round2 } from './format';
import { toDateOnly, today } from './dates';
import { A, KIND_OPENING } from './constants';
import type { SessionUser } from './auth';

const OPENING_NOTE = 'Excel import: berilgan chek';

export type ImportResult = {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  tjmsCreated: string[];
  suppliersCreated: number;
  errors: [number, string][];
  warnings: [number, string][];
  fixes: number;
  dryRun: boolean;
  debtTotal: number;
  arrearsTotal: number;
  ok: boolean;
};

function emptyResult(dryRun: boolean): ImportResult {
  return {
    totalRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    tjmsCreated: [],
    suppliersCreated: 0,
    errors: [],
    warnings: [],
    fixes: 0,
    dryRun,
    debtTotal: 0,
    arrearsTotal: 0,
    ok: true,
  };
}

/** exceljs katakchasini oddiy qiymatga aylantiradi. */
function cellValue(v: any): any {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('text' in v) return v.text;
    if ('richText' in v) return (v.richText || []).map((r: any) => r.text).join('');
    if ('hyperlink' in v) return v.text ?? v.hyperlink;
    if ('error' in v) return null;
    return String(v);
  }
  return v;
}

export async function readRows(buffer: Buffer): Promise<CleanRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.getWorksheet('Import') || wb.worksheets[0];
  if (!ws) throw new Error("Excel fayl bo'sh");

  const rows: any[][] = [];
  let maxCols = 0;
  ws.eachRow({ includeEmpty: true }, (row) => {
    const raw = row.values as any[];
    const arr: any[] = [];
    for (let i = 1; i < raw.length; i++) arr.push(cellValue(raw[i]));
    maxCols = Math.max(maxCols, arr.length);
    rows.push(arr);
  });
  // Barcha qatorlarni bir xil uzunlikka keltiramiz
  for (const r of rows) while (r.length < maxCols) r.push(null);

  // Sarlavha qatorini topamiz (ba'zi fayllarda tepada bo'sh qatorlar bo'ladi)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const filled = rows[i].filter((c) => String(c ?? '').trim() !== '').length;
    if (filled >= 3) {
      headerIdx = i;
      break;
    }
  }
  return cleanRows(rows.slice(headerIdx), headerIdx);
}

async function syncOpening(tx: any, contractId: number, paid: number, userId: number | null) {
  const opening = await tx.transaction.findFirst({ where: { contractId, kind: KIND_OPENING } });
  if (paid > 0) {
    if (!opening) {
      await tx.transaction.create({
        data: {
          contractId,
          amount: round2(paid),
          kind: KIND_OPENING,
          operationDate: toDateOnly(today()),
          note: OPENING_NOTE,
          createdById: userId,
        },
      });
    } else if (num(opening.amount) !== round2(paid)) {
      await tx.transaction.update({ where: { id: opening.id }, data: { amount: round2(paid) } });
    }
  } else if (opening) {
    await tx.transaction.delete({ where: { id: opening.id } });
  }
}

async function syncClosed(tx: any, contractId: number, userId: number | null) {
  const c = await tx.contract.findUnique({ where: { id: contractId } });
  if (!c) return;
  if (num(c.remainingAmount) <= 0 && !c.isClosed) {
    await tx.contract.update({
      where: { id: contractId },
      data: {
        isClosed: true,
        closedAt: new Date(),
        closedById: userId,
        closeReason: 'bajarildi',
        closeNote: 'Import: qoldiq 0',
      },
    });
    // isClosed o'zgardi — qarzdorlikni qayta hisoblaymiz
    await recalculate(tx, contractId);
  } else if (num(c.remainingAmount) > 0 && c.isClosed && c.closeReason === 'bajarildi') {
    await tx.contract.update({
      where: { id: contractId },
      data: { isClosed: false, closeReason: '', closeNote: '', closedAt: null, closedById: null },
    });
    await recalculate(tx, contractId);
  }
}

export async function runImport(
  buffer: Buffer,
  user: SessionUser,
  dryRun: boolean,
): Promise<ImportResult> {
  const result = emptyResult(dryRun);

  let rows: CleanRow[];
  try {
    rows = await readRows(buffer);
  } catch (e: any) {
    result.errors.push([0, e?.message ? String(e.message) : `Faylni o'qib bo'lmadi`]);
    result.ok = false;
    return result;
  }
  result.totalRows = rows.length;

  try {
    await prisma.$transaction(
      async (tx: any) => {
        const tjmCache = new Map<string, any>();
        for (const t of await tx.tjm.findMany()) tjmCache.set(tjmKey(t.name), t);

        for (const r of rows) {
          result.fixes += r.problems.length;
          if (r.errors.length) {
            for (const e of r.errors) result.errors.push([r.rowNo, e]);
            continue;
          }
          if (r.duplicateOf) {
            result.skipped += 1;
            result.warnings.push([
              r.rowNo,
              `${r.number}: ${r.duplicateOf}-qatorning dublikati, o'tkazib yuborildi`,
            ]);
            continue;
          }

          const key = tjmKey(r.tjm);
          let tjm = tjmCache.get(key);
          if (!tjm) {
            tjm = await tx.tjm.create({ data: { name: r.tjm } });
            tjmCache.set(key, tjm);
            result.tjmsCreated.push(r.tjm);
          }

          let supplier = await tx.supplier.findFirst({ where: { searchKey: r.supplierKey } });
          if (!supplier) {
            supplier = await tx.supplier.create({
              data: { fullName: r.supplier, searchKey: searchKey(r.supplier) },
            });
            result.suppliersCreated += 1;
          }
          for (const phone of r.phones) {
            await tx.supplierPhone.upsert({
              where: { supplierId_phone: { supplierId: supplier.id, phone } },
              create: { supplierId: supplier.id, phone },
              update: {},
            });
          }

          let contract = await tx.contract.findFirst({ where: { tjmId: tjm.id, number: r.number } });
          if (!contract) {
            contract = await tx.contract.create({
              data: {
                supplierId: supplier.id,
                tjmId: tjm.id,
                number: r.number,
                contractDate: r.contractDate,
                totalAmount: round2(r.total),
                monthlyAmount: round2(r.monthly),
                debtSetAt: new Date(),
                materialType: r.material,
                materialGroup: r.materialGroup,
                supplyStatus: r.status,
                createdById: user.id,
              },
            });
            await syncOpening(tx, contract.id, r.paid, user.id);
            if (r.note) {
              await tx.note.create({
                data: { contractId: contract.id, kind: 'import', text: r.note, createdById: user.id },
              });
            }
            await recalculate(tx, contract.id);
            await syncClosed(tx, contract.id, user.id);
            result.created += 1;
          } else {
            if (contract.supplierId !== supplier.id) {
              const other = await tx.supplier.findUnique({ where: { id: contract.supplierId } });
              result.errors.push([
                r.rowNo,
                `${tjm.name} / ${r.number} tizimda boshqa barterchiga (${other?.fullName}) tegishli`,
              ]);
              continue;
            }
            const patch: any = {
              materialType: r.material || contract.materialType,
              materialGroup: r.materialGroup,
              supplyStatus: r.status,
            };
            if (num(contract.monthlyAmount) !== round2(r.monthly)) {
              patch.monthlyAmount = round2(r.monthly);
              patch.debtSetAt = new Date();
            }
            if (!contract.contractDate && r.contractDate) patch.contractDate = r.contractDate;

            const realCount = await tx.transaction.count({
              where: { contractId: contract.id, kind: { not: KIND_OPENING } },
            });
            if (realCount === 0) {
              patch.totalAmount = round2(r.total);
              await tx.contract.update({ where: { id: contract.id }, data: patch });
              await syncOpening(tx, contract.id, r.paid, user.id);
              await recalculate(tx, contract.id);
              await syncClosed(tx, contract.id, user.id);
            } else {
              await tx.contract.update({ where: { id: contract.id }, data: patch });
              if (num(contract.totalAmount) !== round2(r.total)) {
                result.warnings.push([
                  r.rowNo,
                  `${r.number}: tizimda tushumlar kiritilgan — summalar Exceldan yangilanmadi`,
                ]);
              }
              await recalculate(tx, contract.id);
            }
            if (r.note) {
              const exists = await tx.note.findFirst({
                where: { contractId: contract.id, kind: 'import', text: r.note },
              });
              if (!exists) {
                await tx.note.create({
                  data: { contractId: contract.id, kind: 'import', text: r.note, createdById: user.id },
                });
              }
            }
            result.updated += 1;
          }

          const fresh = await tx.contract.findUnique({ where: { id: contract.id } });
          if (fresh && !fresh.isClosed) {
            result.debtTotal += num(fresh.remainingAmount);
            result.arrearsTotal += num(fresh.debtAmount);
          }
        }

        if (dryRun) {
          // Tekshiruv rejimi — hech narsa saqlanmaydi
          throw new DryRunRollback();
        }
      },
      { timeout: 300000, maxWait: 20000 },
    );
  } catch (e) {
    if (!(e instanceof DryRunRollback)) {
      console.error(e);
      result.errors.push([0, `Import bajarilmadi: ${(e as any)?.message || e}`]);
    }
  }

  result.ok = result.errors.length === 0;

  if (!dryRun) {
    await logAction({
      action: A.IMPORT,
      user,
      detail:
        `Excel import: ${result.created} yangi, ${result.updated} yangilandi, ` +
        `${result.skipped} o'tkazildi, ${result.errors.length} xato`,
    });
  }
  return result;
}

class DryRunRollback extends Error {}
