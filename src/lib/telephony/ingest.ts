/** Kelgan qo'ng'iroqni bazaga yozish (takroriy yuborishga chidamli). */
import prisma from '../db';
import { saveAudio } from './storage';
import type { NormalizedCall } from './normalize';

export type IngestResult = { id: number; status: string; duplicate: boolean };

export async function ingestCall(
  provider: string,
  n: NormalizedCall,
  opts: { file?: { buf: Buffer; mime: string; name: string } | null; waitAudio?: boolean; delaySec?: number; settings: any },
): Promise<IngestResult> {
  const s = opts.settings;
  const externalId = n.externalId || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = await prisma.callRecord.findUnique({ where: { provider_externalId: { provider, externalId } } });

  const base: any = {};
  if (n.direction) base.direction = n.direction;
  if (n.from) base.fromPhone = n.from;
  if (n.to) base.toPhone = n.to;
  if (n.startedAt) base.startedAt = n.startedAt;
  if (n.durationSec) base.durationSec = n.durationSec;
  if (n.audioUrl) base.audioUrl = n.audioUrl.slice(0, 2000);
  base.meta = { ...((existing?.meta as any) || {}), ...(n.meta || {}) };

  const hasAudio = !!(opts.file || n.audioUrl || existing?.audioPath || existing?.audioUrl);
  const tooShort = (n.durationSec || existing?.durationSec || 0) > 0 && (n.durationSec || existing!.durationSec) < s.minDurationSec;
  let status: string;
  if (existing && ['done', 'failed'].includes(existing.status) && !opts.file && !n.audioUrl) {
    // tugagan yozuvga faqat metadata qo'shiladi
    await prisma.callRecord.update({ where: { id: existing.id }, data: base });
    return { id: existing.id, status: existing.status, duplicate: true };
  }
  if (tooShort) status = 'skipped';
  else if (hasAudio) status = 'received';
  else status = opts.waitAudio ? 'waiting_audio' : 'skipped';

  const data: any = {
    ...base,
    status,
    error: status === 'skipped' ? (tooShort ? `Qo'ng'iroq juda qisqa (${n.durationSec || existing?.durationSec} s)` : "Audio yozuv yo'q") : '',
    nextTryAt: new Date(Date.now() + (opts.delaySec || 0) * 1000),
  };
  if (status === 'received' && existing?.status !== 'received') {
    data.attempts = 0;
    data.stage = '';
  }

  const rec = existing
    ? await prisma.callRecord.update({ where: { id: existing.id }, data })
    : await prisma.callRecord.create({ data: { provider, externalId, ...data } });

  if (opts.file && status !== 'skipped') {
    const saved = await saveAudio(rec.id, opts.file.buf, opts.file.mime, opts.file.name);
    await prisma.callRecord.update({
      where: { id: rec.id },
      data: { audioPath: saved.path, audioMime: saved.mime, audioBytes: saved.bytes },
    });
  }
  return { id: rec.id, status, duplicate: !!existing };
}

export async function logInbox(entry: { provider: string; ip: string; contentType: string; body: string; ok: boolean; message: string; callId?: number | null }) {
  try {
    await prisma.telephonyInbox.create({
      data: { ...entry, body: entry.body.slice(0, 20000), message: entry.message.slice(0, 500), callId: entry.callId ?? null },
    });
    if (Math.random() < 0.05) {
      const keep = await prisma.telephonyInbox.findMany({ orderBy: { id: 'desc' }, skip: 300, take: 1, select: { id: true } });
      if (keep[0]) await prisma.telephonyInbox.deleteMany({ where: { id: { lte: keep[0].id } } });
    }
  } catch (e) {
    console.error('[telefoniya] jurnalga yozilmadi', e);
  }
}

/** Token va maxfiy qiymatlarni jurnalga yozmaslik. */
export function redact(text: string): string {
  return text
    .replace(/(token|api_key|apikey|secret|password)(["'=:\s]+)([^"'&\s,}]+)/gi, '$1$2***')
    .replace(/tlp_[A-Za-z0-9_-]{10,}/g, 'tlp_***');
}
