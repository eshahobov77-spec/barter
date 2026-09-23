/**
 * Fon jarayoni: navbatdagi qo'ng'iroqni oladi → audio yuklaydi → matnga o'giradi →
 * barterchi va shartnomani topadi → AI xulosasi → shartnomaga izoh (va'da bilan) yozadi.
 */
import prisma from '../db';
import { loadTelSettings } from './auth';
import { downloadAudio, saveAudio, removeAudio, audioExists } from './storage';
import { zadarmaRecordLink } from './zadarma';
import { transcribe, analyze, type AnalysisContext } from './ai';
import { normPhone } from './normalize';
import { fmtSom, num, isoDate } from '../format';
import { toDateOnly } from '../dates';

let started = false;
let lastCleanup = 0;
const BACKOFF_MIN = [1, 5, 30, 120, 360];
const MAX_ATTEMPTS = 5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function ownSet(s: any): Set<string> {
  return new Set(String(s.ownNumbers || '').split(/[,;\s]+/).map(normPhone).filter(Boolean));
}

/** Barterchi raqami: kompaniya raqami bo'lmagan, bazada topilgan tomon. */
async function findClient(call: any, s: any) {
  const own = ownSet(s);
  const order = call.direction === 'out' ? [call.toPhone, call.fromPhone] : [call.fromPhone, call.toPhone];
  const cands = [call.clientPhone, ...order].map(normPhone).filter((p) => p && p.startsWith('+') && !own.has(p));
  for (const phone of [...new Set(cands)]) {
    const rows = await prisma.supplierPhone.findMany({ where: { phone }, select: { supplierId: true } });
    if (rows.length) return { phone, supplierIds: [...new Set(rows.map((r) => r.supplierId))] };
  }
  return { phone: cands[0] || '', supplierIds: [] as number[] };
}

async function processCall(id: number) {
  const s = await loadTelSettings();
  let call = await prisma.callRecord.findUnique({ where: { id } });
  if (!call) return;
  const maxBytes = Math.max(1, s.maxMb) * 1048576;
  let stage = 'download';
  try {
    // 1) audio
    if (!call.audioPath || !(await audioExists(call.audioPath))) {
      let url = call.audioUrl;
      if (!url) throw new Error("Audio manbasi yo'q");
      if (url.startsWith('zadarma:')) {
        url = await zadarmaRecordLink(s.zadarmaKey, s.zadarmaSecret, url.slice(8), call.externalId);
      }
      const { buf, mime } = await downloadAudio(url, maxBytes);
      const saved = await saveAudio(call.id, buf, mime, url);
      call = await prisma.callRecord.update({
        where: { id },
        data: { audioPath: saved.path, audioMime: saved.mime, audioBytes: saved.bytes },
      });
    }

    // 2) matnga o'girish
    stage = 'stt';
    if (!call.transcript) {
      const text = await transcribe(s, call.audioPath);
      call = await prisma.callRecord.update({ where: { id }, data: { transcript: text || '(bo\'sh)' } });
    }

    // 3) barterchi va shartnoma
    stage = 'analyze';
    const client = await findClient(call, s);
    const contracts = client.supplierIds.length
      ? await prisma.contract.findMany({
          where: { supplierId: { in: client.supplierIds }, isClosed: false },
          include: { tjm: true, supplier: true },
          orderBy: [{ debtAmount: 'desc' }, { remainingAmount: 'desc' }],
          take: 20,
        })
      : [];
    const supplier = contracts[0]?.supplier ||
      (client.supplierIds[0] ? await prisma.supplier.findUnique({ where: { id: client.supplierIds[0] } }) : null);

    const ctx: AnalysisContext = {
      today: isoDate(new Date()),
      direction: call.direction,
      supplierName: supplier?.fullName || '',
      contracts: contracts.map((c) => ({
        number: c.number, tjm: c.tjm.name, material: c.materialType, debt: fmtSom(c.debtAmount) + " so'm", remaining: fmtSom(c.remainingAmount) + " so'm",
      })),
    };
    const trimmed = call.transcript.replace(/\(bo'sh\)/, '').trim();
    const a = trimmed.length < 8
      ? { summary: "Suhbat matni bo'sh yoki eshitilmadi.", promiseDate: '', promiseWhat: '', promiseAmount: 0, contractNumber: '' }
      : await analyze(s, trimmed, ctx);

    // Shartnoma: AI aytgan raqam → aks holda qarzdorligi eng kattasi (sahifada o'zgartirish mumkin)
    const key = (v: string) => v.toUpperCase().replace(/[\s\-_/.№]/g, '');
    const chosen = (call.contractId && contracts.find((c) => c.id === call!.contractId)) ||
      (a.contractNumber && contracts.find((c) => key(c.number) === key(a.contractNumber))) ||
      contracts[0] || null;

    const promiseDate = a.promiseDate ? toDateOnly(new Date(a.promiseDate + 'T00:00')) : null;
    call = await prisma.callRecord.update({
      where: { id },
      data: {
        clientPhone: client.phone,
        supplierId: supplier?.id ?? null,
        contractId: chosen?.id ?? call.contractId ?? null,
        summary: a.summary,
        promiseDate,
        promiseWhat: a.promiseWhat,
        promiseAmount: a.promiseAmount,
      },
    });

    // 4) shartnomaga izoh
    if (s.autoNote && call.contractId && !call.noteId) {
      const mins = call.durationSec ? ` (${Math.floor(call.durationSec / 60)}:${String(call.durationSec % 60).padStart(2, '0')})` : '';
      const more = contracts.length > 1 && !a.contractNumber ? `\nBarterchining ${contracts.length} ta ochiq shartnomasi bor — kerak bo'lsa «Qo'ng'iroqlar» sahifasida boshqasiga ko'chiring.` : '';
      const note = await prisma.note.create({
        data: {
          contractId: call.contractId,
          kind: 'qongiroq',
          text: `📞 ${call.direction === 'in' ? 'Kiruvchi' : call.direction === 'out' ? 'Chiquvchi' : ''} qo'ng'iroq${mins}: ${a.summary}${more}`.slice(0, 2000),
          promiseDate,
          promiseWhat: a.promiseWhat,
          promiseAmount: a.promiseAmount,
          callId: call.id,
        },
      });
      await prisma.callRecord.update({ where: { id }, data: { noteId: note.id } });
    }

    await prisma.callRecord.update({ where: { id }, data: { status: 'done', stage: '', error: '' } });
    console.log(`[telefoniya] #${id} tayyor: ${a.summary.slice(0, 80)}`);
  } catch (e: any) {
    const attempts = (call?.attempts || 0) + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await prisma.callRecord.update({
      where: { id },
      data: {
        attempts,
        stage,
        status: failed ? 'failed' : 'received',
        error: String(e?.message || e).slice(0, 1000),
        nextTryAt: new Date(Date.now() + BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60_000),
      },
    });
    console.warn(`[telefoniya] #${id} (${stage}) xato, urinish ${attempts}:`, e?.message || e);
  }
}

async function cleanup(s: any) {
  if (Date.now() - lastCleanup < 6 * 3600_000) return;
  lastCleanup = Date.now();
  const before = new Date(Date.now() - Math.max(7, s.keepDays) * 86400_000);
  const old = await prisma.callRecord.findMany({ where: { createdAt: { lt: before }, audioPath: { not: '' } }, select: { id: true, audioPath: true }, take: 500 });
  for (const r of old) {
    await removeAudio(r.audioPath);
    await prisma.callRecord.update({ where: { id: r.id }, data: { audioPath: '' } });
  }
  // Yozuvi kelmay qolgan qo'ng'iroqlar (2 soatdan ortiq kutilgan)
  await prisma.callRecord.updateMany({
    where: { status: 'waiting_audio', createdAt: { lt: new Date(Date.now() - 2 * 3600_000) } },
    data: { status: 'skipped', error: 'Audio yozuv kelmadi' },
  });
}

async function loop() {
  console.log('[telefoniya] Fon jarayoni ishga tushdi.');
  for (;;) {
    try {
      const s = await loadTelSettings();
      if (!s.enabled) {
        await sleep(20_000);
        continue;
      }
      await cleanup(s).catch((e) => console.warn('[telefoniya] tozalash:', e?.message || e));
      const job = await prisma.callRecord.findFirst({
        where: { status: 'received', nextTryAt: { lte: new Date() } },
        orderBy: { nextTryAt: 'asc' },
        select: { id: true, nextTryAt: true },
      });
      if (!job) {
        await sleep(5_000);
        continue;
      }
      // Band qilish (bir nechta jarayon bo'lsa ham bitta yozuv bir marta ishlanadi)
      const lease = await prisma.callRecord.updateMany({
        where: { id: job.id, status: 'received', nextTryAt: job.nextTryAt },
        data: { nextTryAt: new Date(Date.now() + 20 * 60_000) },
      });
      if (lease.count) await processCall(job.id);
    } catch (e) {
      console.error('[telefoniya] kutilmagan xato:', e);
      await sleep(15_000);
    }
  }
}

export function startTelephonyWorker() {
  if (started) return;
  started = true;
  loop().catch((e) => console.error("[telefoniya] to'xtadi:", e));
}

/** Shartnomani qo'lda almashtirish: izoh ham ko'chadi (yoki yaratiladi). */
export async function relinkCall(callId: number, contractId: number) {
  const call = await prisma.callRecord.findUnique({ where: { id: callId } });
  if (!call) throw new Error("Qo'ng'iroq topilmadi");
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) throw new Error('Shartnoma topilmadi');
  await prisma.callRecord.update({ where: { id: callId }, data: { contractId, supplierId: contract.supplierId } });
  if (call.noteId) {
    await prisma.note.update({ where: { id: call.noteId }, data: { contractId } }).catch(async () => {
      await prisma.callRecord.update({ where: { id: callId }, data: { noteId: null } });
    });
  }
  const fresh = await prisma.callRecord.findUnique({ where: { id: callId } });
  if (fresh && !fresh.noteId && fresh.summary) {
    const note = await prisma.note.create({
      data: {
        contractId, kind: 'qongiroq', text: `📞 Qo'ng'iroq: ${fresh.summary}`.slice(0, 2000),
        promiseDate: fresh.promiseDate, promiseWhat: fresh.promiseWhat, promiseAmount: fresh.promiseAmount, callId,
      },
    });
    await prisma.callRecord.update({ where: { id: callId }, data: { noteId: note.id } });
  }
  return num(contract.id);
}
