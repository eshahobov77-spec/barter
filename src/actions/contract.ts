'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import { getCurrentUser, requireUser } from '@/lib/auth';
import { contractScope, canSeeTjm } from '@/lib/permissions';
import * as services from '@/lib/services';
import { ServiceError, has } from '@/lib/services';
import { fmtSom } from '@/lib/format';
import { parseIsoDate, parseDateTimeInput, today } from '@/lib/dates';
import {
  cleanContractNumber,
  cleanPersonName,
  parseMaterial,
  parseMoney,
  parsePhones,
} from '@/lib/cleaning';
import { CLOSE_REASON, GROUP_LABELS, NOTE_KIND, SUPPLY_STATUS, TX_KIND } from '@/lib/constants';

export type ActionResult = { ok: boolean; error?: string; flash?: string; id?: number };

async function assertVisible(contractId: number) {
  const user = await requireUser();
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, ...contractScope(user) },
    select: { id: true },
  });
  if (!contract) throw new ServiceError('Shartnoma topilmadi yoki ruxsat yo‘q.');
  return user;
}

/** redirect()/notFound() maxsus xatolarini yutib yubormaymiz. */
function isFrameworkError(e: any): boolean {
  const digest = e?.digest;
  return typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND');
}

function fail(e: unknown): ActionResult {
  if (isFrameworkError(e)) throw e;
  if (e instanceof ServiceError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: 'Kutilmagan xato. Qaytadan urinib ko‘ring.' };
}

// ------------------------------------------------------------------ tushum
export async function addPaymentAction(formData: FormData): Promise<ActionResult> {
  try {
    const contractId = Number(formData.get('contractId'));
    const user = await assertVisible(contractId);

    const amount = parseMoney(String(formData.get('amount') || ''));
    if (amount === null) throw new ServiceError("Summani to'g'ri kiriting (masalan: 1 250 000).");
    const kind = String(formData.get('kind') || 'material');
    const dateStr = String(formData.get('operationDate') || '');
    const operationDate = parseIsoDate(dateStr) || today();
    if (operationDate > today()) throw new ServiceError('Kelajak sanani kiritib bo‘lmaydi.');

    const res = await services.addPayment({
      contractId,
      user,
      amount,
      kind,
      operationDate,
      note: String(formData.get('note') || ''),
      closeIfZero: formData.get('closeIfZero') === 'on',
    });

    revalidatePath('/', 'layout');
    let flash = `Tushum saqlandi: ${fmtSom(res.amount)} so'm.`;
    if (res.closed) flash += ' Qoldiq 0 bo‘ldi — shartnoma yopildi.';
    return { ok: true, flash };
  } catch (e) {
    return fail(e);
  }
}

// -------------------------------------------------------------------- izoh
export async function addNoteAction(formData: FormData): Promise<ActionResult> {
  try {
    const contractId = Number(formData.get('contractId'));
    const user = await assertVisible(contractId);
    const kind = String(formData.get('kind') || 'izoh');
    if (!has(NOTE_KIND, kind) || kind === 'import') throw new ServiceError("Izoh turi noto'g'ri.");
    await services.addNote({ contractId, user, kind, text: String(formData.get('text') || '') });
    revalidatePath('/', 'layout');
    return { ok: true, flash: 'Izoh saqlandi.' };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ yopish
export async function closeContractAction(formData: FormData): Promise<ActionResult> {
  try {
    const contractId = Number(formData.get('contractId'));
    const user = await assertVisible(contractId);
    const reason = String(formData.get('reason') || '');
    if (!has(CLOSE_REASON, reason)) throw new ServiceError('Yopish sababini tanlang.');
    await services.closeContract({
      contractId,
      user,
      reason,
      note: String(formData.get('note') || ''),
    });
    revalidatePath('/', 'layout');
    return { ok: true, flash: 'Shartnoma yopildi va arxivga o‘tkazildi.' };
  } catch (e) {
    return fail(e);
  }
}

export async function reopenContractAction(formData: FormData): Promise<ActionResult> {
  try {
    const contractId = Number(formData.get('contractId'));
    const user = await assertVisible(contractId);
    if (!user.isAdmin) throw new ServiceError('Bu amal faqat admin uchun.');
    await services.reopenContract(contractId, user);
    revalidatePath('/', 'layout');
    return { ok: true, flash: 'Shartnoma qayta ochildi.' };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePaymentAction(formData: FormData): Promise<ActionResult> {
  try {
    const txnId = Number(formData.get('txnId'));
    const user = await requireUser();
    if (!user.isAdmin) throw new ServiceError('Tushumni faqat admin o‘chira oladi.');
    const txn = await prisma.transaction.findFirst({
      where: { id: txnId, contract: contractScope(user) },
      select: { id: true },
    });
    if (!txn) throw new ServiceError('Tushum topilmadi yoki ruxsat yo‘q.');

    const res = await services.deletePayment(txnId, user);
    revalidatePath('/', 'layout');
    let flash = 'Tushum o‘chirildi, qoldiq qarz qayta tiklandi.';
    if (res.reopened) flash += ' Shartnoma qayta ochildi.';
    return { ok: true, flash };
  } catch (e) {
    return fail(e);
  }
}

// -------------------------------------------------------- shartnoma formasi
function readContractForm(formData: FormData) {
  const errors: Record<string, string> = {};

  const supplierName = cleanPersonName(String(formData.get('supplierName') || ''));
  if (!supplierName) errors.supplierName = 'Barterchi F.I.SH ni kiriting.';

  const [phones, phoneProblem] = parsePhones(String(formData.get('phones') || ''));
  if (phoneProblem && String(formData.get('phones') || '').trim()) errors.phones = phoneProblem;

  const tjmId = Number(formData.get('tjmId'));
  if (!Number.isInteger(tjmId) || tjmId <= 0) errors.tjmId = 'TJM ni tanlang.';

  const number = cleanContractNumber(String(formData.get('number') || ''));
  if (!number) errors.number = 'Shartnoma raqamini kiriting.';

  const contractDate = parseDateTimeInput(String(formData.get('contractDate') || ''));

  const totalAmount = parseMoney(String(formData.get('totalAmount') || ''));
  if (totalAmount === null || totalAmount <= 0) errors.totalAmount = "Umumiy summa 0 dan katta bo'lishi kerak.";

  const openingRaw = String(formData.get('openingPaid') || '');
  const openingPaid = openingRaw.trim() ? parseMoney(openingRaw) : 0;
  if (openingPaid === null) errors.openingPaid = "Berilgan chekni to'g'ri kiriting.";

  const monthlyRaw = String(formData.get('monthlyAmount') || '');
  const monthlyAmount = monthlyRaw.trim() ? parseMoney(monthlyRaw) : 0;
  if (monthlyAmount === null) errors.monthlyAmount = "Qarzdorlik summasini to'g'ri kiriting.";

  const materialType = parseMaterial(String(formData.get('materialType') || ''));
  const materialGroup = String(formData.get('materialGroup') || 'boshqa');
  if (!has(GROUP_LABELS, materialGroup)) errors.materialGroup = 'Guruhni tanlang.';
  const supplyStatus = String(formData.get('supplyStatus') || '');
  if (supplyStatus && !has(SUPPLY_STATUS, supplyStatus)) errors.supplyStatus = 'Holatni tanlang.';

  return {
    errors,
    data: {
      supplierName,
      phones,
      tjmId,
      number,
      contractDate,
      totalAmount: totalAmount ?? 0,
      openingPaid: openingPaid ?? 0,
      monthlyAmount: monthlyAmount ?? 0,
      materialType,
      materialGroup,
      supplyStatus,
      note: String(formData.get('note') || '').trim(),
    },
  };
}

export type ContractFormState = {
  errors?: Record<string, string>;
  error?: string;
  values?: Record<string, string>;
};

function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [
    'supplierName', 'phones', 'tjmId', 'number', 'contractDate', 'totalAmount',
    'openingPaid', 'monthlyAmount', 'materialType', 'materialGroup', 'supplyStatus', 'note',
  ]) {
    out[key] = String(formData.get(key) ?? '');
  }
  return out;
}

export async function saveContractAction(
  _prev: ContractFormState,
  formData: FormData,
): Promise<ContractFormState> {
  const user = await requireUser();
  const editId = Number(formData.get('editId') || 0);
  const { errors, data } = readContractForm(formData);
  const values = echo(formData);

  if (data.tjmId && !canSeeTjm(user, data.tjmId)) errors.tjmId = 'Bu TJM sizga biriktirilmagan.';

  // Raqam takrorlanmasin
  if (!errors.number && !errors.tjmId) {
    const clash = await prisma.contract.findFirst({
      where: { tjmId: data.tjmId, number: data.number, ...(editId ? { id: { not: editId } } : {}) },
      include: { tjm: true },
    });
    if (clash) errors.number = `${clash.tjm.name} da ${data.number} raqamli shartnoma allaqachon bor.`;
  }
  if (!editId && !errors.totalAmount && data.openingPaid > data.totalAmount) {
    errors.openingPaid = "Berilgan chek umumiy summadan katta bo'lishi mumkin emas.";
  }
  if (!errors.totalAmount && data.monthlyAmount) {
    let paid = data.openingPaid;
    if (editId) {
      const cur = await prisma.contract.findUnique({ where: { id: editId }, select: { paidAmount: true } });
      paid = cur ? Number(cur.paidAmount) : 0;
    }
    if (data.monthlyAmount > data.totalAmount - paid) {
      errors.monthlyAmount = "Qarzdorlik qoldiq summadan katta bo'lishi mumkin emas.";
    }
  }

  if (Object.keys(errors).length) return { errors, values };

  let contractId = editId;
  try {
    if (editId) {
      await assertVisible(editId);
      await services.updateContract(editId, data as any, user);
    } else {
      contractId = await services.createContract(data as any, user);
    }
  } catch (e) {
    if (isFrameworkError(e)) throw e;
    if (e instanceof ServiceError) return { error: e.message, values };
    console.error(e);
    return { error: 'Kutilmagan xato. Qaytadan urinib ko‘ring.', values };
  }

  revalidatePath('/', 'layout');
  redirect(`/barterlar?yopilgan=1&open=${contractId}`);
}
