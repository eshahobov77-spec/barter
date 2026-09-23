'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/db';
import { requireAdmin, requireUser } from '@/lib/auth';
import { logAction } from '@/lib/audit';
import { A } from '@/lib/constants';
import { contractScope } from '@/lib/permissions';
import { loadTelSettings, newToken } from '@/lib/telephony/auth';
import { removeAudio } from '@/lib/telephony/storage';
import { relinkCall } from '@/lib/telephony/worker';

export type TelState = { ok?: boolean; message?: string; error?: string; token?: string };

function intIn(v: FormDataEntryValue | null, min: number, max: number, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label}: ${min}–${max} oralig'ida butun son.`);
  return n;
}

/** Maxfiy maydon: bo'sh qoldirilsa eskisi saqlanadi, "-" yozilsa o'chiriladi. */
function secret(v: FormDataEntryValue | null, old: string): string {
  const s = String(v ?? '').trim();
  if (!s) return old;
  if (s === '-') return '';
  return s;
}

export async function saveTelephonyAction(_prev: TelState, fd: FormData): Promise<TelState> {
  const admin = await requireAdmin();
  const cur = await loadTelSettings();
  let mappings: any = cur.mappings ?? null;
  const mapRaw = String(fd.get('mappings') || '').trim();
  try {
    if (mapRaw) {
      mappings = JSON.parse(mapRaw);
      if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new Error();
    } else mappings = null;
  } catch {
    return { error: "Maydon moslashtirish JSON noto'g'ri. Namuna: {\"onlinepbx\": {\"externalId\": \"uuid\", \"audioUrl\": \"record\"}}" };
  }
  try {
    const sttUrl = String(fd.get('sttUrl') || '').trim();
    if (sttUrl && !/^https?:\/\//.test(sttUrl)) throw new Error("STT manzili http(s):// bilan boshlanishi kerak.");
    const llmUrl = String(fd.get('llmUrl') || '').trim();
    if (llmUrl && !/^https?:\/\//.test(llmUrl)) throw new Error("AI manzili http(s):// bilan boshlanishi kerak.");
    await prisma.telephonySettings.update({
      where: { id: 1 },
      data: {
        enabled: fd.get('enabled') === 'on',
        autoNote: fd.get('autoNote') === 'on',
        ownNumbers: String(fd.get('ownNumbers') || '').slice(0, 1000),
        sttUrl,
        sttKey: secret(fd.get('sttKey'), cur.sttKey),
        sttModel: String(fd.get('sttModel') || 'whisper-1').trim().slice(0, 100),
        sttLanguage: String(fd.get('sttLanguage') || '').trim().slice(0, 10),
        llmProvider: fd.get('llmProvider') === 'openai' ? 'openai' : 'anthropic',
        llmUrl,
        llmKey: secret(fd.get('llmKey'), cur.llmKey),
        llmModel: String(fd.get('llmModel') || '').trim().slice(0, 100) || cur.llmModel,
        hmacSecret: secret(fd.get('hmacSecret'), cur.hmacSecret),
        zadarmaKey: secret(fd.get('zadarmaKey'), cur.zadarmaKey),
        zadarmaSecret: secret(fd.get('zadarmaSecret'), cur.zadarmaSecret),
        minDurationSec: intIn(fd.get('minDurationSec'), 0, 600, 'Eng qisqa suhbat'),
        maxMb: intIn(fd.get('maxMb'), 1, 500, 'Fayl hajmi'),
        keepDays: intIn(fd.get('keepDays'), 7, 3650, 'Saqlash muddati'),
        mappings,
      },
    });
  } catch (e: any) {
    return { error: e?.message || 'Saqlanmadi' };
  }
  await logAction({ action: A.BOT_SETTINGS, user: admin, detail: 'Telefoniya sozlamalari yangilandi' });
  revalidatePath('/telefoniya');
  return { ok: true, message: 'Sozlamalar saqlandi.' };
}

export async function newTokenAction(): Promise<TelState> {
  const admin = await requireAdmin();
  await loadTelSettings();
  const t = newToken();
  await prisma.telephonySettings.update({ where: { id: 1 }, data: { tokenHash: t.hash, tokenHint: t.hint } });
  await logAction({ action: A.BOT_SETTINGS, user: admin, detail: 'Telefoniya: yangi API token yaratildi (eskisi bekor)' });
  revalidatePath('/telefoniya');
  return { ok: true, token: t.token, message: "Yangi token yaratildi. Uni hozir nusxalab oling — keyin ko'rsatilmaydi. Eski token endi ishlamaydi." };
}

export async function clearInboxAction(): Promise<void> {
  await requireAdmin();
  await prisma.telephonyInbox.deleteMany({});
  revalidatePath('/telefoniya');
}

async function visibleCall(callId: number) {
  const user = await requireUser();
  const call = await prisma.callRecord.findUnique({ where: { id: callId }, include: { contract: true } });
  if (!call) throw new Error("Qo'ng'iroq topilmadi");
  if (!user.isAdmin && !(call.contract && user.tjmIds.includes(call.contract.tjmId))) throw new Error("Ruxsat yo'q");
  return { user, call };
}

export async function linkCallAction(fd: FormData): Promise<void> {
  const callId = Number(fd.get('callId'));
  const contractId = Number(fd.get('contractId'));
  const { user } = await visibleCall(callId);
  const ok = await prisma.contract.findFirst({ where: { id: contractId, ...contractScope(user) }, select: { id: true, number: true } });
  if (!ok) throw new Error('Shartnoma topilmadi yoki ruxsat yo\'q');
  await relinkCall(callId, contractId);
  await logAction({ action: A.NOTE, user, detail: `Qo'ng'iroq #${callId} → shartnoma ${ok.number}`, objectType: 'call', objectId: callId });
  revalidatePath('/qongiroqlar');
  revalidatePath(`/qongiroqlar/${callId}`);
}

export async function retryCallAction(fd: FormData): Promise<void> {
  const callId = Number(fd.get('callId'));
  await visibleCall(callId);
  const full = fd.get('full') === '1';
  await prisma.callRecord.update({
    where: { id: callId },
    data: { status: 'received', attempts: 0, error: '', stage: '', nextTryAt: new Date(), ...(full ? { transcript: '', summary: '' } : {}) },
  });
  revalidatePath(`/qongiroqlar/${callId}`);
  revalidatePath('/qongiroqlar');
}

export async function deleteCallAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const callId = Number(fd.get('callId'));
  const call = await prisma.callRecord.findUnique({ where: { id: callId } });
  if (!call) return;
  await removeAudio(call.audioPath);
  await prisma.callRecord.delete({ where: { id: callId } });
  await logAction({ action: A.NOTE, user: admin, detail: `Qo'ng'iroq #${callId} o'chirildi`, objectType: 'call', objectId: callId });
  revalidatePath('/qongiroqlar');
}
