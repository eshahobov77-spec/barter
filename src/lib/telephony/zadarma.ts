/**
 * Zadarma: qo'ng'iroq yakunida NOTIFY_END / NOTIFY_OUT_END, yozuv tayyor bo'lganda NOTIFY_RECORD
 * webhooklari keladi. Yozuv havolasi GET /v1/pbx/record/request/ orqali olinadi
 * (Zadarma yozuv saqlanishi uchun ~40 soniya kutishni tavsiya qiladi).
 */
import { createHash, createHmac } from 'node:crypto';
import { normPhone, parseDateAny, type NormalizedCall } from './normalize';

const API = 'https://api.zadarma.com';

function phpQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&');
}

/** Zadarma imzosi: base64( hex( HMAC-SHA1(method + params + md5(params), secret) ) ) */
function sign(method: string, paramsStr: string, secret: string): string {
  const md5 = createHash('md5').update(paramsStr).digest('hex');
  const hex = createHmac('sha1', secret).update(method + paramsStr + md5).digest('hex');
  return Buffer.from(hex).toString('base64');
}

export async function zadarmaRecordLink(key: string, secret: string, callIdWithRec: string, pbxCallId: string): Promise<string> {
  if (!key || !secret) throw new Error('Zadarma API kaliti (Key/Secret) kiritilmagan');
  const method = '/v1/pbx/record/request/';
  const params: Record<string, string> = { lifetime: '3600' };
  if (callIdWithRec) params.call_id = callIdWithRec;
  else params.pbx_call_id = pbxCallId;
  const qs = phpQuery(params);
  const resp = await fetch(`${API}${method}?${qs}`, {
    headers: { Authorization: `${key}:${sign(method, qs, secret)}` },
    cache: 'no-store',
  });
  const data: any = await resp.json().catch(() => ({}));
  if (data?.status !== 'success') throw new Error('Zadarma: ' + (data?.message || `HTTP ${resp.status}`));
  const link = data.link || (Array.isArray(data.links) ? data.links[0] : '');
  if (!link) throw new Error('Zadarma: yozuv havolasi qaytmadi');
  return link;
}

export type ZadarmaEvent =
  | { kind: 'end'; call: NormalizedCall; recorded: boolean }
  | { kind: 'record'; call: NormalizedCall; callIdWithRec: string }
  | { kind: 'ignore'; event: string };

export function parseZadarma(body: Record<string, any>): ZadarmaEvent {
  const ev = String(body.event || '').toUpperCase();
  const base = {
    externalId: String(body.pbx_call_id || '').slice(0, 200),
    from: '', to: '', direction: '' as const, startedAt: null as Date | null, durationSec: 0, audioUrl: '', event: ev, meta: body,
  };
  if (ev === 'NOTIFY_END' || ev === 'NOTIFY_OUT_END') {
    const out = ev === 'NOTIFY_OUT_END';
    return {
      kind: 'end',
      recorded: String(body.is_recorded) === '1',
      call: {
        ...base,
        direction: out ? 'out' : 'in',
        from: normPhone(out ? body.caller_id || body.internal : body.caller_id),
        to: normPhone(out ? body.destination : body.called_did || body.internal),
        startedAt: parseDateAny(body.call_start),
        durationSec: Math.max(0, Math.round(Number(body.duration) || 0)),
      },
    };
  }
  if (ev === 'NOTIFY_RECORD') {
    return { kind: 'record', callIdWithRec: String(body.call_id_with_rec || ''), call: { ...base, audioUrl: 'zadarma:' + String(body.call_id_with_rec || '') } };
  }
  return { kind: 'ignore', event: ev };
}
