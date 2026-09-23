/**
 * Universal REST API: istalgan tizim (PBX, skript, provayder) qo'ng'iroq yozuvini yuboradi.
 *
 * POST /api/telephony/calls
 *   Kirish: Authorization: Bearer <token>  (yoki X-Api-Key, yoki ?token=)
 *   multipart/form-data: audio=<fayl>, call_id, from, to, direction, started_at, duration, provider, metadata(JSON)
 *   application/json:     {"call_id", "from", "to", "direction", "started_at", "duration", "audio_url" | "audio_base64", ...}
 *   Javob: 202 {"id", "status", "duplicate"}
 */
import { NextResponse } from 'next/server';
import { checkHmac, checkToken, clientIp, loadTelSettings } from '@/lib/telephony/auth';
import { BodyError, normalize, parseBody } from '@/lib/telephony/normalize';
import { ingestCall, logInbox, redact } from '@/lib/telephony/ingest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const s = await loadTelSettings();
  if (!s.enabled) return NextResponse.json({ error: "Telefoniya moduli o'chirilgan" }, { status: 503 });
  if (!checkToken(req, s)) return NextResponse.json({ error: "Token noto'g'ri yoki yo'q" }, { status: 401 });

  const ct = (req.headers.get('content-type') || '').toLowerCase();
  if (s.hmacSecret && !ct.includes('multipart')) {
    const raw = await req.clone().text();
    if (!checkHmac(raw, req.headers.get('x-signature'), s.hmacSecret)) {
      return NextResponse.json({ error: "X-Signature imzosi noto'g'ri" }, { status: 401 });
    }
  }

  let parsed;
  try {
    parsed = await parseBody(req, s.maxMb * 1048576);
  } catch (e: any) {
    const status = e instanceof BodyError ? e.status : 400;
    return NextResponse.json({ error: e?.message || "So'rov o'qilmadi" }, { status });
  }

  const provider = String(parsed.data.provider || 'api').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'api';
  const n = normalize(provider, parsed.data, s.mappings);
  if (!parsed.file && !n.audioUrl) {
    return NextResponse.json({ error: "Audio kerak: 'audio' fayli, 'audio_url' yoki 'audio_base64'" }, { status: 422 });
  }
  try {
    const r = await ingestCall(provider, n, { file: parsed.file, settings: s });
    await logInbox({ provider: 'api:' + provider, ip: clientIp(req), contentType: parsed.contentType, body: redact(parsed.raw), ok: true, message: `#${r.id} ${r.status}`, callId: r.id });
    return NextResponse.json(r, { status: r.duplicate ? 200 : 202 });
  } catch (e: any) {
    await logInbox({ provider: 'api:' + provider, ip: clientIp(req), contentType: parsed.contentType, body: redact(parsed.raw), ok: false, message: String(e?.message || e) });
    return NextResponse.json({ error: e?.message || 'Saqlab bo\'lmadi' }, { status: 400 });
  }
}
