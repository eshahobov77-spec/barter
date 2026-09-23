import { MONTHS_UZ } from './constants';

export const TZ = process.env.APP_TIMEZONE || 'Asia/Tashkent';

/** Prisma Decimal | number | string | null -> number */
export function num(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value) || 0;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
}

/** Pul uchun 2 xona aniqlikda yaxlitlash (float xatolarini oldini oladi). */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** 1234567.5 -> "1 234 568" */
export function fmtSom(value: any): string {
  const v = num(value);
  const rounded = Math.round(v);
  const sign = rounded < 0 ? '−' : '';
  return sign + Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Katta summalar: 12.08 mlrd, 584.9 mln, 12 ming */
export function fmtShort(value: any): string {
  const raw = num(value);
  const sign = raw < 0 ? '−' : '';
  const v = Math.abs(raw);
  if (v >= 1_000_000_000) return `${sign}${(v / 1_000_000_000).toFixed(2)} mlrd`;
  if (v >= 1_000_000) return `${sign}${(v / 1_000_000).toFixed(1)} mln`;
  if (v >= 1_000) return `${sign}${(v / 1_000).toFixed(0)} ming`;
  return `${sign}${v.toFixed(0)}`;
}

/** +998901234567 -> +998 90 123 45 67 */
export function phoneFmt(p: string | null | undefined): string {
  if (p && p.startsWith('+998') && p.length === 13) {
    return `+998 ${p.slice(4, 6)} ${p.slice(6, 9)} ${p.slice(9, 11)} ${p.slice(11, 13)}`;
  }
  return p || '';
}

export function initial(name: string | null | undefined): string {
  const s = (name || '').trim();
  return s ? s[0].toUpperCase() : '?';
}

export function signedPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value > 0 ? `+${value}%` : `${value}%`;
}

export function pctChange(current: any, previous: any): number | null {
  const c = num(current);
  const p = num(previous);
  if (p === 0) return null;
  return Math.round(((c - p) / p) * 100);
}

// ------------------------------------------------------------------ sanalar

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmtr(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = partsCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts });
    partsCache.set(key, f);
  }
  return f;
}

function parts(d: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of fmtr(opts).formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** 22.09.2026 */
export function dmy(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const p = parts(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.day}.${p.month}.${p.year}`;
}

/** 22.09.2026 14:35 */
export function dmyhm(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const p = parts(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

/** 22.09.2026 14:35:07 */
export function dmyhms(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const p = parts(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

/** 22.09 14:35 */
export function dmhm(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const p = parts(date, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

/** <input type="date"> uchun YYYY-MM-DD (mahalliy vaqt mintaqasida) */
export function isoDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const p = parts(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** <input type="datetime-local"> uchun YYYY-MM-DDTHH:MM */
export function isoDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const p = parts(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Mahalliy (Asia/Tashkent) bugungi kun — YYYY-MM-DD */
export function todayIso(): string {
  return isoDate(new Date());
}

/** Mahalliy kun raqamlari {y, m, d} */
export function localParts(d: Date = new Date()): { y: number; m: number; d: number; weekday: number } {
  const p = parts(d, { day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short' });
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { y: +p.year, m: +p.month, d: +p.day, weekday: map[p.weekday] ?? 0 };
}

/** Mahalliy soat/daqiqa "HH:MM" */
export function localHM(d: Date = new Date()): string {
  const p = parts(d, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${p.hour}:${p.minute}`;
}

export function daysSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

export function monthLabel(year: number, month: number): string {
  return `${MONTHS_UZ[month]} ${year}`;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
