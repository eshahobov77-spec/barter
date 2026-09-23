/**
 * Provayderdan kelgan so'rovni yagona ko'rinishga keltirish.
 * Har qanday provayder: maydonlar nuqtali yo'l (dot-path) nomzodlari bilan qidiriladi,
 * admin «Telefoniya» sahifasida o'z moslashtirishini (JSON) berishi mumkin.
 */

export type FieldMap = Partial<Record<MapKey, string[]>>;
export type MapKey = 'externalId' | 'from' | 'to' | 'direction' | 'startedAt' | 'duration' | 'audioUrl' | 'event';

export type NormalizedCall = {
  externalId: string;
  direction: '' | 'in' | 'out';
  from: string;
  to: string;
  startedAt: Date | null;
  durationSec: number;
  audioUrl: string;
  event: string;
  meta: Record<string, any>;
};

/** Standart nomzodlar. Provayder hujjati bo'yicha aniq maydon bilinsa — sozlamada almashtiring. */
export const DEFAULT_MAPPINGS: Record<string, FieldMap> = {
  generic: {
    externalId: ['call_id', 'callId', 'id', 'uuid', 'data.call_id', 'data.uuid'],
    from: ['from', 'caller', 'caller_id', 'caller_number', 'src', 'data.from', 'data.caller_number'],
    to: ['to', 'callee', 'callee_number', 'destination', 'dst', 'data.to', 'data.callee_number'],
    direction: ['direction', 'call_direction', 'type', 'data.direction'],
    startedAt: ['started_at', 'start_time', 'call_start', 'start', 'date', 'data.started_at'],
    duration: ['duration', 'duration_sec', 'billsec', 'talk_time', 'data.duration', 'data.call_duration'],
    audioUrl: ['audio_url', 'record_url', 'recording_url', 'record', 'recording', 'link', 'data.record_url'],
    event: ['event', 'type_event', 'data.event'],
  },
  // OnlinePBX va Beeline VTS: ommaviy hujjatdagi aniq maydon nomlari provayder kabinetida
  // ko'rsatiladi. Birinchi kelgan so'rovni «Kelgan so'rovlar» jurnalida ko'rib, kerak bo'lsa moslang.
  onlinepbx: {
    externalId: ['uuid', 'call_uuid', 'call_id', 'id', 'data.uuid'],
    from: ['caller', 'caller_number', 'from', 'src', 'data.caller'],
    to: ['callee', 'callee_number', 'to', 'dst', 'data.callee'],
    direction: ['direction', 'type', 'call_type', 'data.direction'],
    startedAt: ['date', 'start_stamp', 'start', 'started_at', 'data.date'],
    duration: ['billsec', 'user_talk_time', 'duration', 'data.billsec'],
    audioUrl: ['record', 'download_url', 'record_url', 'recording', 'data.record'],
    event: ['event', 'type_event'],
  },
  beeline: {
    externalId: ['callId', 'call_id', 'extTrackingId', 'id', 'data.callId'],
    from: ['phone', 'from', 'caller', 'abonent', 'data.phone'],
    to: ['to', 'callee', 'destination', 'user', 'data.to'],
    direction: ['direction', 'callType', 'type', 'data.direction'],
    startedAt: ['startDate', 'date', 'start', 'data.startDate'],
    duration: ['duration', 'callDuration', 'data.duration'],
    audioUrl: ['recordUrl', 'record_url', 'fileUrl', 'link', 'data.recordUrl'],
    event: ['eventType', 'event'],
  },
};

export function getPath(obj: any, path: string): any {
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

function pick(obj: any, paths: string[] | undefined): any {
  for (const p of paths || []) {
    const v = getPath(obj, p);
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return undefined;
}

export function mappingFor(provider: string, custom: any): FieldMap {
  const base = DEFAULT_MAPPINGS[provider] || DEFAULT_MAPPINGS.generic;
  const own = custom && typeof custom === 'object' ? custom[provider] : null;
  if (!own || typeof own !== 'object') return base;
  const out: FieldMap = { ...base };
  for (const [k, v] of Object.entries(own)) {
    const list = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : null;
    if (list && list.length) (out as any)[k] = [...list, ...((base as any)[k] || [])];
  }
  return out;
}

/** Telefon: +998901234567 ko'rinishiga; ichki raqam (101) o'zgarmaydi. */
export function normPhone(v: any): string {
  const raw = String(v ?? '').trim();
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 9) return '+998' + d;
  if (d.length === 12 && d.startsWith('998')) return '+' + d;
  if (d.length >= 10) return '+' + d;
  return d; // ichki (extension) raqam
}

export function normDirection(v: any): '' | 'in' | 'out' {
  const s = String(v ?? '').toLowerCase();
  if (/^(in|incoming|inbound|входящ|kiruvchi|1)/.test(s) || s === 'notify_end') return 'in';
  if (/^(out|outgoing|outbound|исходящ|chiquvchi|2)/.test(s) || s === 'notify_out_end') return 'out';
  return '';
}

export function parseDateAny(v: any): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) {
    const n = Number(v);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)); // mahalliy vaqt
  const m2 = /^(\d{2})\.(\d{2})\.(\d{4})[ T]?(\d{2})?:?(\d{2})?/.exec(s);
  if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1], +(m2[4] || 0), +(m2[5] || 0));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function normalize(provider: string, body: Record<string, any>, custom: any): NormalizedCall {
  const map = mappingFor(provider, custom);
  const dur = Number(String(pick(body, map.duration) ?? '0').replace(',', '.'));
  return {
    externalId: String(pick(body, map.externalId) ?? '').trim().slice(0, 200),
    direction: normDirection(pick(body, map.direction)),
    from: normPhone(pick(body, map.from)),
    to: normPhone(pick(body, map.to)),
    startedAt: parseDateAny(pick(body, map.startedAt)),
    durationSec: Number.isFinite(dur) ? Math.max(0, Math.round(dur)) : 0,
    audioUrl: String(pick(body, map.audioUrl) ?? '').trim(),
    event: String(pick(body, map.event) ?? '').trim(),
    meta: body,
  };
}

export type ParsedBody = {
  data: Record<string, any>;
  file: { buf: Buffer; mime: string; name: string } | null;
  raw: string;
  contentType: string;
};

const FILE_FIELDS = ['audio', 'file', 'record', 'recording', 'audio_file'];

/** JSON, x-www-form-urlencoded va multipart/form-data ni o'qiydi. */
export async function parseBody(req: Request, maxBytes: number): Promise<ParsedBody> {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  const len = Number(req.headers.get('content-length') || 0);
  if (len && len > maxBytes + 1024 * 1024) throw new BodyError(`So'rov juda katta (${Math.round(len / 1048576)} MB)`, 413);

  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const data: Record<string, any> = {};
    let file: ParsedBody['file'] = null;
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string') data[k] = v;
      else if (!file && (FILE_FIELDS.includes(k) || (v as any).type?.startsWith('audio/'))) {
        const ab = await (v as Blob).arrayBuffer();
        if (ab.byteLength > maxBytes) throw new BodyError(`Audio juda katta (${Math.round(ab.byteLength / 1048576)} MB)`, 413);
        file = { buf: Buffer.from(ab), mime: (v as Blob).type || '', name: (v as any).name || 'audio' };
      }
    }
    mergeMeta(data);
    return { data, file, raw: JSON.stringify({ ...data, [file ? 'audio' : '_']: file ? `<${file.name}, ${file.buf.length} bayt>` : undefined }), contentType: ct };
  }

  const text = await req.text();
  if (text.length > maxBytes * 1.4 + 1024 * 1024) throw new BodyError("So'rov juda katta", 413);
  let data: Record<string, any> = {};
  if (ct.includes('json') || /^\s*[{[]/.test(text)) {
    try {
      const j = JSON.parse(text || '{}');
      data = Array.isArray(j) ? { items: j } : j && typeof j === 'object' ? j : {};
    } catch {
      throw new BodyError("JSON o'qilmadi", 400);
    }
  } else {
    const sp = new URLSearchParams(text);
    sp.forEach((v, k) => {
      data[k] = v;
    });
  }
  mergeMeta(data);
  let file: ParsedBody['file'] = null;
  if (typeof data.audio_base64 === 'string' && data.audio_base64) {
    const b64 = data.audio_base64.replace(/^data:[^,]+,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > maxBytes) throw new BodyError('Audio juda katta', 413);
    file = { buf, mime: String(data.audio_mime || ''), name: String(data.audio_name || 'audio') };
    data.audio_base64 = `<${buf.length} bayt>`;
  }
  return { data, file, raw: text.length > 20000 ? JSON.stringify(data).slice(0, 20000) : text, contentType: ct };
}

function mergeMeta(data: Record<string, any>) {
  for (const key of ['metadata', 'meta', 'json']) {
    if (typeof data[key] === 'string' && /^\s*{/.test(data[key])) {
      try {
        const extra = JSON.parse(data[key]);
        for (const [k, v] of Object.entries(extra)) if (data[k] === undefined) data[k] = v;
      } catch {
        /* e'tiborsiz */
      }
    }
  }
}

export class BodyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
