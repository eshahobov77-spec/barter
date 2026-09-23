/**
 * Pul bilan bog'liq barcha o'zgarishlar faqat shu yerdan o'tadi
 * (Django'dagi barter/services.py ning ekvivalenti — bitta haqiqat manbai).
 */
import prisma from './db';
import { logAction } from './audit';
import { searchKey } from './cleaning';
import { fmtSom, num, round2 } from './format';
import { toDateOnly, today } from './dates';
import { A, CLOSE_REASON, KIND_OPENING, TX_KIND } from './constants';
import type { SessionUser } from './auth';
import * as notify from './notify';

export class ServiceError extends Error {}

/** Prototip kalitlari (constructor, toString…) qiymat sifatida o'tib ketmasligi uchun. */
export function has(obj: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

type Tx = any; // Prisma tranzaksiya klienti

/** Qatorni qulflash (Postgres). */
async function lockContract(tx: Tx, id: number): Promise<void> {
  try {
    await tx.$queryRawUnsafe('SELECT id FROM "Contract" WHERE id = $1 FOR UPDATE', id);
  } catch {
    // SQLite yoki boshqa baza — qulflashsiz davom etamiz
  }
}

/**
 * paid / remaining / debt / lastPaymentAt ni tranzaksiyalardan qayta hisoblaydi.
 * Django Contract.recalculate() bilan bir xil.
 */
export async function recalculate(tx: Tx, contractId: number): Promise<any> {
  const contract = await tx.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new ServiceError('Shartnoma topilmadi.');

  const txns = await tx.transaction.findMany({
    where: { contractId },
    select: { amount: true, kind: true, createdAt: true },
  });
  const real = txns.filter((t: any) => t.kind !== KIND_OPENING);

  const totalPaid = round2(txns.reduce((s: number, t: any) => s + num(t.amount), 0));
  const total = num(contract.totalAmount);
  const remaining = round2(total - totalPaid);

  let lastPaymentAt: Date | null = null;
  for (const t of real) {
    if (!lastPaymentAt || t.createdAt > lastPaymentAt) lastPaymentAt = t.createdAt;
  }

  const since: Date | null = contract.debtSetAt || contract.createdAt || null;
  let paidAfter = 0;
  if (since) {
    paidAfter = round2(
      real.filter((t: any) => t.createdAt > since).reduce((s: number, t: any) => s + num(t.amount), 0),
    );
  }

  const monthly = num(contract.monthlyAmount);
  const debt = contract.isClosed ? 0 : Math.max(0, Math.min(remaining, round2(monthly - paidAfter)));

  return tx.contract.update({
    where: { id: contractId },
    data: {
      paidAmount: totalPaid,
      remainingAmount: remaining,
      debtAmount: debt,
      lastPaymentAt,
    },
  });
}

async function closeInternal(
  tx: Tx,
  contractId: number,
  userId: number | null,
  reason: string,
  note: string,
) {
  await tx.contract.update({
    where: { id: contractId },
    data: {
      isClosed: true,
      closedAt: new Date(),
      closedById: userId,
      closeReason: reason,
      closeNote: note,
    },
  });
  return recalculate(tx, contractId);
}

async function reopenInternal(tx: Tx, contractId: number) {
  await tx.contract.update({
    where: { id: contractId },
    data: { isClosed: false, closedAt: null, closedById: null, closeReason: '', closeNote: '' },
  });
  return recalculate(tx, contractId);
}

/** Qarzdorlik hisobiga yopilgan qism (shartnoma oynasi uchun). */
export function debtPaidAmount(contract: any, transactions: any[]): number {
  const since: Date | null = contract.debtSetAt || contract.createdAt || null;
  const monthly = num(contract.monthlyAmount);
  if (!since || !monthly) return 0;
  const paid = round2(
    transactions
      .filter((t) => t.kind !== KIND_OPENING && new Date(t.createdAt) > new Date(since))
      .reduce((s, t) => s + num(t.amount), 0),
  );
  return Math.min(monthly, paid);
}

// ================================================================== TUSHUM

export type AddPaymentInput = {
  contractId: number;
  user: SessionUser;
  amount: number;
  kind: string;
  operationDate: Date;
  note?: string;
  closeIfZero?: boolean;
};

export async function addPayment(input: AddPaymentInput): Promise<{ txnId: number; closed: boolean; amount: number }> {
  const { contractId, user } = input;
  const result = await prisma.$transaction(async (tx: Tx) => {
    await lockContract(tx, contractId);
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { supplier: true, tjm: true },
    });
    if (!contract) throw new ServiceError('Shartnoma topilmadi.');

    const amount = round2(input.amount);
    if (contract.isClosed)
      throw new ServiceError('Shartnoma yopilgan. Tushum kiritish uchun avval uni qayta oching.');
    if (!(amount > 0)) throw new ServiceError("Summa 0 dan katta bo'lishi kerak.");
    if (amount > num(contract.remainingAmount) + 0.001)
      throw new ServiceError(
        `Summa qoldiq qarzdan (${fmtSom(contract.remainingAmount)} so'm) katta bo'lishi mumkin emas.`,
      );
    if (input.kind === KIND_OPENING)
      throw new ServiceError('Bu turdagi yozuv faqat import orqali yaratiladi.');
    if (!has(TX_KIND, input.kind)) throw new ServiceError("Tushum turi noto'g'ri.");

    const txn = await tx.transaction.create({
      data: {
        contractId,
        amount,
        kind: input.kind,
        operationDate: toDateOnly(input.operationDate),
        note: (input.note || '').trim().slice(0, 255),
        createdById: user.id,
      },
    });

    let updated = await recalculate(tx, contractId);
    let closed = false;
    if (input.closeIfZero !== false && num(updated.remainingAmount) <= 0) {
      updated = await closeInternal(tx, contractId, user.id, 'bajarildi', "Qoldiq 0 bo'ldi — avtomatik yopildi");
      closed = true;
    }
    return { txn, contract, updated, closed, amount };
  });

  await logAction({
    action: A.PAYMENT,
    user,
    objectType: 'contract',
    objectId: contractId,
    detail:
      `${result.contract.supplier.fullName} | ${result.contract.tjm.name} | ${result.contract.number} | ` +
      `${fmtSom(result.amount)} so'm | ${TX_KIND[input.kind] || input.kind}`,
  });
  notify.paymentCreated(result.txn.id);
  if (result.closed) {
    await logAction({
      action: A.CLOSE,
      user,
      objectType: 'contract',
      objectId: contractId,
      detail: `${result.contract.number}: qoldiq 0 — avtomatik`,
    });
    notify.contractClosed(contractId);
  }
  return { txnId: result.txn.id, closed: result.closed, amount: result.amount };
}

/** Xato kiritilgan tushumni o'chiradi va qoldiqni qaytaradi (faqat admin). */
export async function deletePayment(txnId: number, user: SessionUser): Promise<{ contractId: number; reopened: boolean }> {
  const out = await prisma.$transaction(async (tx: Tx) => {
    const txn = await tx.transaction.findUnique({
      where: { id: txnId },
      include: { contract: { include: { supplier: true, tjm: true } } },
    });
    if (!txn) throw new ServiceError('Tushum topilmadi.');
    const contractId = txn.contractId;
    await lockContract(tx, contractId);

    const amount = num(txn.amount);
    const kindLabel = TX_KIND[txn.kind] || txn.kind;
    await tx.transaction.delete({ where: { id: txnId } });
    let contract = await recalculate(tx, contractId);

    let reopened = false;
    if (contract.isClosed && num(contract.remainingAmount) > 0 && contract.closeReason === 'bajarildi') {
      contract = await reopenInternal(tx, contractId);
      reopened = true;
    }
    return { contractId, amount, kindLabel, reopened, contract, old: txn.contract };
  });

  await logAction({
    action: A.PAYMENT_DELETE,
    user,
    objectType: 'contract',
    objectId: out.contractId,
    detail:
      `${out.old.supplier.fullName} | ${out.old.number} | −${fmtSom(out.amount)} so'm (${out.kindLabel}). ` +
      `Yangi qoldiq: ${fmtSom(out.contract.remainingAmount)}` +
      (out.reopened ? ' | shartnoma qayta ochildi' : ''),
  });
  return { contractId: out.contractId, reopened: out.reopened };
}

// ================================================================== IZOH

export async function addNote(opts: {
  contractId: number;
  user: SessionUser;
  kind: string;
  text: string;
}): Promise<void> {
  const text = (opts.text || '').trim();
  if (opts.kind === 'izoh' && !text) throw new ServiceError('Izoh matnini yozing.');
  const contract = await prisma.contract.findUnique({ where: { id: opts.contractId } });
  if (!contract) throw new ServiceError('Shartnoma topilmadi.');

  await prisma.note.create({
    data: { contractId: opts.contractId, kind: opts.kind, text, createdById: opts.user.id },
  });
  const { NOTE_KIND } = await import('./constants');
  await logAction({
    action: A.NOTE,
    user: opts.user,
    objectType: 'contract',
    objectId: opts.contractId,
    detail: `${contract.number} | ${NOTE_KIND[opts.kind] || opts.kind}` + (text ? `: ${text.slice(0, 200)}` : ''),
  });
}

// ================================================================== YOPISH

export async function closeContract(opts: {
  contractId: number;
  user: SessionUser;
  reason: string;
  note?: string;
}): Promise<void> {
  const note = (opts.note || '').trim();
  const res = await prisma.$transaction(async (tx: Tx) => {
    await lockContract(tx, opts.contractId);
    const contract = await tx.contract.findUnique({
      where: { id: opts.contractId },
      include: { supplier: true, tjm: true },
    });
    if (!contract) throw new ServiceError('Shartnoma topilmadi.');
    if (contract.isClosed) throw new ServiceError('Shartnoma allaqachon yopilgan.');
    if (!has(CLOSE_REASON, opts.reason)) throw new ServiceError("Yopish sababi noto'g'ri.");
    if (opts.reason === 'bajarildi' && num(contract.remainingAmount) > 0) {
      throw new ServiceError(
        `Qoldiq qarz ${fmtSom(contract.remainingAmount)} so'm. «Majburiyat bajarildi» faqat qoldiq 0 bo'lganda ` +
          'tanlanadi — aks holda boshqa sababni tanlang.',
      );
    }
    if (opts.reason !== 'bajarildi' && !note)
      throw new ServiceError('Bu sabab bilan yopishda izoh yozish majburiy.');

    const updated = await closeInternal(tx, opts.contractId, opts.user.id, opts.reason, note);
    return { contract, updated };
  });

  await logAction({
    action: A.CLOSE,
    user: opts.user,
    objectType: 'contract',
    objectId: opts.contractId,
    detail:
      `${res.contract.supplier.fullName} | ${res.contract.number} | ${CLOSE_REASON[opts.reason]} | ` +
      `yopilgan: ${fmtSom(res.updated.paidAmount)}, qoldiq: ${fmtSom(res.updated.remainingAmount)}` +
      (note ? ` | ${note}` : ''),
  });
  notify.contractClosed(opts.contractId);
}

export async function reopenContract(contractId: number, user: SessionUser): Promise<void> {
  const res = await prisma.$transaction(async (tx: Tx) => {
    await lockContract(tx, contractId);
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { supplier: true, tjm: true },
    });
    if (!contract) throw new ServiceError('Shartnoma topilmadi.');
    if (!contract.isClosed) throw new ServiceError('Shartnoma ochiq.');
    await reopenInternal(tx, contractId);
    return contract;
  });
  await logAction({
    action: A.REOPEN,
    user,
    objectType: 'contract',
    objectId: contractId,
    detail: `${res.supplier.fullName} | ${res.number}`,
  });
}

// ================================================================== SHARTNOMA

export async function getOrCreateSupplier(tx: Tx, fullName: string, phones: string[] = []) {
  const key = searchKey(fullName);
  let supplier = await tx.supplier.findFirst({ where: { searchKey: key } });
  if (!supplier) supplier = await tx.supplier.create({ data: { fullName, searchKey: key } });
  for (const phone of phones) {
    await tx.supplierPhone.upsert({
      where: { supplierId_phone: { supplierId: supplier.id, phone } },
      create: { supplierId: supplier.id, phone },
      update: {},
    });
  }
  return supplier;
}

export type ContractInput = {
  supplierName: string;
  phones: string[];
  tjmId: number;
  number: string;
  contractDate: Date | null;
  totalAmount: number;
  openingPaid?: number;
  monthlyAmount?: number;
  materialType: string;
  materialGroup: string;
  supplyStatus: string;
  note?: string;
};

export async function createContract(data: ContractInput, user: SessionUser): Promise<number> {
  const res = await prisma.$transaction(async (tx: Tx) => {
    const supplier = await getOrCreateSupplier(tx, data.supplierName, data.phones);
    const contract = await tx.contract.create({
      data: {
        supplierId: supplier.id,
        tjmId: data.tjmId,
        number: data.number,
        contractDate: data.contractDate,
        totalAmount: round2(data.totalAmount),
        monthlyAmount: round2(data.monthlyAmount || 0),
        debtSetAt: new Date(),
        materialType: data.materialType || '',
        materialGroup: data.materialGroup || 'boshqa',
        supplyStatus: data.supplyStatus || '',
        createdById: user.id,
      },
      include: { tjm: true },
    });
    const opening = round2(data.openingPaid || 0);
    if (opening > 0) {
      await tx.transaction.create({
        data: {
          contractId: contract.id,
          amount: opening,
          kind: KIND_OPENING,
          operationDate: toDateOnly(data.contractDate || today()),
          note: 'Shartnoma kiritilganda berilgan chek',
          createdById: user.id,
        },
      });
    }
    if (data.note) {
      await tx.note.create({
        data: { contractId: contract.id, kind: 'izoh', text: data.note, createdById: user.id },
      });
    }
    const updated = await recalculate(tx, contract.id);
    return { contract, updated, supplier };
  });

  await logAction({
    action: A.CONTRACT_CREATE,
    user,
    objectType: 'contract',
    objectId: res.contract.id,
    detail: `${res.supplier.fullName} | ${res.contract.tjm.name} | ${res.contract.number} | ${fmtSom(
      res.contract.totalAmount,
    )} so'm`,
  });
  notify.contractCreated(res.contract.id);
  return res.contract.id;
}

export async function updateContract(
  contractId: number,
  data: ContractInput,
  user: SessionUser,
): Promise<void> {
  const changes: string[] = [];
  await prisma.$transaction(async (tx: Tx) => {
    await lockContract(tx, contractId);
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      include: { supplier: { include: { phones: true } }, tjm: true },
    });
    if (!contract) throw new ServiceError('Shartnoma topilmadi.');

    if (round2(data.totalAmount) < num(contract.paidAmount)) {
      throw new ServiceError(
        `Umumiy summa allaqachon yopilgan summadan (${fmtSom(contract.paidAmount)}) kam bo'lishi mumkin emas.`,
      );
    }

    const patch: Record<string, any> = {};
    if (contract.number !== data.number) {
      changes.push(`raqam: ${contract.number} → ${data.number}`);
      patch.number = data.number;
    }
    if (contract.tjmId !== data.tjmId) {
      const newTjm = await tx.tjm.findUnique({ where: { id: data.tjmId } });
      changes.push(`TJM: ${contract.tjm.name} → ${newTjm?.name ?? data.tjmId}`);
      patch.tjmId = data.tjmId;
    }
    const oldDate = contract.contractDate ? contract.contractDate.getTime() : null;
    const newDate = data.contractDate ? data.contractDate.getTime() : null;
    if (oldDate !== newDate) {
      changes.push('sana o‘zgardi');
      patch.contractDate = data.contractDate;
    }
    if (num(contract.totalAmount) !== round2(data.totalAmount)) {
      changes.push(`umumiy summa: ${fmtSom(contract.totalAmount)} → ${fmtSom(data.totalAmount)}`);
      patch.totalAmount = round2(data.totalAmount);
    }
    if ((contract.materialType || '') !== (data.materialType || '')) {
      changes.push(`hom ashyo: ${contract.materialType || '—'} → ${data.materialType || '—'}`);
      patch.materialType = data.materialType || '';
    }
    if (contract.materialGroup !== data.materialGroup) {
      changes.push(`guruh: ${contract.materialGroup} → ${data.materialGroup}`);
      patch.materialGroup = data.materialGroup;
    }
    if ((contract.supplyStatus || '') !== (data.supplyStatus || '')) {
      changes.push(`holat: ${contract.supplyStatus || '—'} → ${data.supplyStatus || '—'}`);
      patch.supplyStatus = data.supplyStatus || '';
    }

    const newDebt = data.monthlyAmount;
    if (newDebt !== undefined && newDebt !== null && Math.abs(newDebt - num(contract.debtAmount)) > 0.01) {
      changes.push(`qarzdorlik: ${fmtSom(contract.debtAmount)} → ${fmtSom(newDebt)}`);
      patch.monthlyAmount = round2(newDebt);
      patch.debtSetAt = new Date();
    }

    // Barterchi nomi
    const newName = data.supplierName;
    if (searchKey(newName) !== contract.supplier.searchKey || newName !== contract.supplier.fullName) {
      changes.push(`barterchi: ${contract.supplier.fullName} → ${newName}`);
      await tx.supplier.update({
        where: { id: contract.supplierId },
        data: { fullName: newName, searchKey: searchKey(newName) },
      });
    }

    // Telefonlar
    const oldPhones = contract.supplier.phones.map((p: any) => p.phone).sort();
    const newPhones = [...new Set(data.phones)].sort();
    if (JSON.stringify(oldPhones) !== JSON.stringify(newPhones)) {
      await tx.supplierPhone.deleteMany({
        where: { supplierId: contract.supplierId, phone: { notIn: newPhones.length ? newPhones : ['—'] } },
      });
      for (const p of newPhones) {
        if (!oldPhones.includes(p)) {
          await tx.supplierPhone.upsert({
            where: { supplierId_phone: { supplierId: contract.supplierId, phone: p } },
            create: { supplierId: contract.supplierId, phone: p },
            update: {},
          });
        }
      }
      changes.push('telefonlar yangilandi');
    }

    if (Object.keys(patch).length) {
      await tx.contract.update({ where: { id: contractId }, data: patch });
    }
    await recalculate(tx, contractId);
  });

  if (changes.length) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    await logAction({
      action: A.CONTRACT_EDIT,
      user,
      objectType: 'contract',
      objectId: contractId,
      detail: `${contract?.number}: ` + changes.join('; '),
    });
  }
}
