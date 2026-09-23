/**
 * Provayder webhooklari: /api/telephony/webhook/<provayder>?token=<token>
 *   zadarma   — NOTIFY_END / NOTIFY_OUT_END / NOTIFY_RECORD (yozuv havolasi API orqali olinadi)
 *   onlinepbx, beeline, generic yoki istalgan nom — maydonlar moslashtirish (mapping) orqali o'qiladi
 * Provayder tez javob kutadi: og'ir ish (yuklash, STT, AI) fon jarayonida bajariladi.
 */
import { NextResponse } from 'next/server';
import { checkToken, clientIp, loadTelSettings } from '@/lib/telephony/auth';
import { BodyError, normalize, parseBody } from '@/lib/telephony/normalize';
import { parseZadarma } from '@/lib/telephony/zadarma';
import { ingestCall, logInbox, redact } from '@/lib/telephony/ingest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function providerName(raw: string): string {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || 'generic';
}

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const sp = new URL(req.url).searchParams;
  // Zadarma manzilni tekshirganda ?zd_echo=... yuboradi va aynan shu qiymatni kutadi
  const echo = sp.get('zd_echo');
  if (echo) return new Response(echo.slice(0, 200), { headers: { 'Content-Type': 'text/plain' } });
  const s = await loadTelSettings();
  const provider = providerName((await ctx.params).provider);
  return NextResponse.json({ ok: s.enabled && checkToken(req, s), provider });
}

export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const provider = providerName((await ctx.params).provider);
  const s = await loadTelSettings();
  const ip = clientIp(req);
  const ct = req.headers.get('content-type') || '';

  if (!s.enabled) return NextResponse.json({ ok: false, error: "o'chirilgan" }, { status: 503 });
  if (!checkToken(req, s)) {
    await logInbox({ provider, ip, contentType: ct, body: '', ok: false, message: "Token noto'g'ri yoki yo'q" });
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = await parseBody(req, s.maxMb * 1048576);
  } catch (e: any) {
    await logInbox({ provider, ip, contentType: ct, body: '', ok: false, message: e?.message || "o'qilmadi" });
    return NextResponse.json({ ok: false, error: e?.message }, { status: e instanceof BodyError ? e.status : 400 });
  }
  const body = redact(parsed.raw);

  try {
    if (provider === 'zadarma') {
      const ev = parseZadarma(parsed.data);
      if (ev.kind === 'ignore') {
        await logInbox({ provider, ip, contentType: ct, body, ok: true, message: `e'tiborsiz: ${ev.event || '—'}` });
        return NextResponse.json({ ok: true });
      }
      const r = ev.kind === 'end'
        ? await ingestCall(provider, ev.call, { settings: s, waitAudio: ev.recorded })
        : await ingestCall(provider, ev.call, { settings: s, delaySec: 45 });
      await logInbox({ provider, ip, contentType: ct, body, ok: true, message: `${ev.call.event}: #${r.id} ${r.status}`, callId: r.id });
      return NextResponse.json({ ok: true });
    }

    const items: Record<string, any>[] = Array.isArray(parsed.data.items) ? parsed.data.items : [parsed.data];
    const out: any[] = [];
    for (const item of items.slice(0, 50)) {
      const n = normalize(provider, item, s.mappings);
      if (!n.externalId && !n.audioUrl && !parsed.file) {
        out.push({ skipped: true, reason: "call_id ham, audio ham yo'q" });
        continue;
      }
      const r = await ingestCall(provider, n, { settings: s, file: items.length === 1 ? parsed.file : null, waitAudio: !!n.externalId });
      out.push(r);
    }
    await logInbox({
      provider, ip, contentType: ct, body, ok: true,
      message: out.map((r) => (r.id ? `#${r.id} ${r.status}` : r.reason)).join('; ') || "bo'sh",
      callId: out.find((r) => r.id)?.id ?? null,
    });
    return NextResponse.json({ ok: true, calls: out });
  } catch (e: any) {
    await logInbox({ provider, ip, contentType: ct, body, ok: false, message: String(e?.message || e) });
    return NextResponse.json({ ok: false, error: e?.message }, { status: 400 });
  }
}
