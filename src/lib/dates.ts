/**
 * Sana yordamchilari.
 * Jarayonning TZ o'zgaruvchisi Asia/Tashkent bo'lishi kutiladi
 * (Dockerfile va docker-compose da o'rnatilgan).
 */

/** Oy boshi — mahalliy yarim tun */
export function monthStart(year: number, month: number): Date {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

/** n oy qo'shish (month 1..12) */
export function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const m = month - 1 + n;
  return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 + 1 };
}

/** Kun boshi */
export function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Kun oxiri (keyingi kun boshi) */
export function nextDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
}

/** "YYYY-MM-DD" -> mahalliy Date (yarim tun). Noto'g'ri bo'lsa null. */
export function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM" -> {year, month}. Noto'g'ri bo'lsa null. */
export function parseMonth(s: string | null | undefined): { year: number; month: number } | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const month = +m[2];
  if (month < 1 || month > 12) return null;
  return { year: +m[1], month };
}

/** "YYYY-MM-DDTHH:MM" yoki "DD.MM.YYYY [HH:MM]" -> Date | null */
export function parseDateTimeInput(s: string | null | undefined): Date | null {
  if (!s) return null;
  const v = s.trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(v);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ](\d{1,2}):(\d{2}))?$/.exec(v);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Bugungi kun (mahalliy, yarim tun) */
export function today(): Date {
  return dayStart(new Date());
}

/** Prisma @db.Date maydoni uchun: faqat kun, UTC yarim tun */
export function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
}

/** @db.Date dan o'qilgan qiymatni mahalliy kunga aylantiradi */
export function fromDateOnly(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}
