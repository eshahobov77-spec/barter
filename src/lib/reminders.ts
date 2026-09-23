/**
 * Barterchilarga muddat eslatmalari.
 *
 * Qoida (A variant): har bir ochiq shartnomadagi QARZDORLIK summasi har oyning
 * `remindDueDay`-sanasigacha topshirilishi kerak. Pul mantig'i (services.ts) o'zgarmaydi —
 * eslatma faqat hozirgi `debtAmount` ga qaraydi.
 *
 *  • oldin  — muddatdan `remindDaysBefore` kun oldin
 *  • bugun  — muddat kuni
 *  • otgan  — muddat o'tgan va qarzdorlik muddatdan OLDIN belgilangan bo'lsa;
 *             ertasi kuni, keyin har `remindOverdueEvery` kunda
 */
import prisma from './db';
import { sendMessage, broadcast, chatIdList, isChatGone } from './telegram';
import { dmy, fmtSom, num } from './format';
import { dayStart, nextDay, toDateOnly } from './dates';
import { CURRENCY } from './constants';

export type ReminderKind = 'oldin' | 'bugun' | 'otgan';

export const REMINDER_KIND: Record<string, string> = {
  oldin: 'Muddatdan oldin',
  bugun: 'Muddat kuni',
  otgan: "Muddat o'tgan",
};

function clampDay(year: number, monthIdx: number, day: number): Date {
  const last = new Date(year, monthIdx + 1, 0).getDate();
  return new Date(year, monthIdx, Math.min(Math.max(day, 1), last), 0, 0, 0, 0);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / 86400000);
}

/** Bugungi kunga nisbatan: keyingi (yoki bugungi) muddat va oxirgi o'tgan muddat. */
export function dueInfo(dueDay: number, today: Date) {
  const t = dayStart(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  const thisMonth = clampDay(y, m, dueDay);
  let upcoming: Date;
  let lastPassed: Date;
  if (t.getTime() <= thisMonth.getTime()) {
    upcoming = thisMonth;
    lastPassed = clampDay(y, m - 1, dueDay);
  } else {
    upcoming = clampDay(y, m + 1, dueDay);
    lastPassed = thisMonth;
  }
  return {
    upcoming,
    daysLeft: diffDays(t, upcoming),
    lastPassed,
    overdueDays: diffDays(lastPassed, t),
  };
}

/** Shartnoma uchun bugun qaysi eslatma kerak (yoki null). */
export function reminderFor(
  contract: { debtAmount: any; isClosed: boolean; debtSetAt: Date | null; createdAt: Date },
  settings: { remindDueDay: number; remindDaysBefore: number; remindOverdueEvery: number },
  today: Date,
): { kind: ReminderKind; dueDate: Date; days: number } | null {
  if (contract.isClosed || num(contract.debtAmount) <= 0) return null;
  const d = dueInfo(settings.remindDueDay, today);

  if (settings.remindDaysBefore > 0 && d.daysLeft === settings.remindDaysBefore) {
    return { kind: 'oldin', dueDate: d.upcoming, days: d.daysLeft };
  }
  if (d.daysLeft === 0) return { kind: 'bugun', dueDate: d.upcoming, days: 0 };
  // Yangi muddat eslatmasi yuborilgan — "muddat o'tdi" xabarlari shu oraliqda to'xtaydi
  if (settings.remindDaysBefore > 0 && d.daysLeft < settings.remindDaysBefore) return null;

  // Qarzdorlik o'tgan muddatgacha mavjud bo'lganmi?
  const since = contract.debtSetAt || contract.createdAt;
  if (!since || since.getTime() >= nextDay(d.lastPassed).getTime()) return null;
  const od = d.overdueDays;
  const every = settings.remindOverdueEvery;
  const due = every > 0 ? (od - 1) % every === 0 : od === 1;
  return due ? { kind: 'otgan', dueDate: d.lastPassed, days: od } : null;
}

function reminderText(kind: ReminderKind, c: any, dueDate: Date, days: number, supportPhone: string): string {
  const cur = CURRENCY[c.currency] || c.currency;
  const head =
    kind === 'oldin'
      ? `🔔 <b>Eslatma</b> — muddatga ${days} kun qoldi`
      : kind === 'bugun'
        ? '⏰ <b>Bugun — topshirish muddatining oxirgi kuni</b>'
        : `⚠️ <b>Muddat o'tdi</b> (${days} kun)`;
  const lines = [
    head,
    '',
    `Hurmatli ${c.supplier.fullName}!`,
    `Shartnoma № <b>${c.number}</b> (${c.tjm.name}) bo'yicha`,
    `qarzdorlik: <b>${fmtSom(c.debtAmount)} ${cur}</b>`,
    `Topshirish muddati: <b>${dmy(dueDate)}</b>`,
    '',
    `Shartnoma bo'yicha umumiy qoldiq: ${fmtSom(c.remainingAmount)} ${cur}`,
  ];
  if (kind === 'otgan') lines.push('', "Iltimos, qarzdorlikni imkon qadar tezroq topshiring.");
  if (supportPhone) lines.push('', `📞 Savollar bo'yicha: ${supportPhone}`);
  lines.push('', '«💰 Qoldiq va qarzdorlik» tugmasi orqali batafsil ko\'rishingiz mumkin.');
  return lines.join('\n');
}

export type ReminderRun = {
  candidates: number; // bugun eslatma kerak bo'lgan shartnomalar
  notLinked: number; // ulardan barterchisi botga ulanmaganlari
  sent: number;
  failed: number;
  already: number; // bugun allaqachon yuborilgan
  errors: string[];
  preview: { number: string; tjm: string; supplier: string; kind: ReminderKind; amount: number; chats: number }[];
};

export async function runReminders(settings: any, opts: { dryRun?: boolean; today?: Date } = {}): Promise<ReminderRun> {
  const today = dayStart(opts.today || new Date());
  const res: ReminderRun = { candidates: 0, notLinked: 0, sent: 0, failed: 0, already: 0, errors: [], preview: [] };

  const chats = await prisma.supplierChat.findMany({ where: { isActive: true } });
  const byPhone = new Map<string, string[]>();
  for (const ch of chats) byPhone.set(ch.phone, [...(byPhone.get(ch.phone) || []), ch.chatId]);

  const contracts = await prisma.contract.findMany({
    where: { isClosed: false, debtAmount: { gt: 0 } },
    include: { tjm: true, supplier: { include: { phones: true } } },
    orderBy: { id: 'asc' },
  });

  const sentOn = toDateOnly(today);
  for (const c of contracts) {
    const r = reminderFor(c, settings, today);
    if (!r) continue;
    res.candidates += 1;

    const chatIds = [...new Set(c.supplier.phones.flatMap((p) => byPhone.get(p.phone) || []))];
    res.preview.push({
      number: c.number,
      tjm: c.tjm.name,
      supplier: c.supplier.fullName,
      kind: r.kind,
      amount: num(c.debtAmount),
      chats: chatIds.length,
    });
    if (!chatIds.length) {
      res.notLinked += 1;
      continue;
    }

    const dueDate = toDateOnly(r.dueDate);
    for (const chatId of chatIds) {
      const exists = await prisma.reminderLog.findUnique({
        where: {
          contractId_chatId_kind_dueDate_sentOn: { contractId: c.id, chatId, kind: r.kind, dueDate, sentOn },
        },
      });
      if (exists) {
        res.already += 1;
        continue;
      }
      if (opts.dryRun) continue;

      let ok = true;
      let error = '';
      try {
        await sendMessage(settings.token, chatId, reminderText(r.kind, c, r.dueDate, r.days, settings.supportPhone));
        res.sent += 1;
      } catch (e: any) {
        ok = false;
        error = String(e?.message || e).slice(0, 500);
        res.failed += 1;
        res.errors.push(`${c.number} → ${chatId}: ${error}`);
        if (isChatGone(e)) {
          await prisma.supplierChat.update({ where: { chatId }, data: { isActive: false } }).catch(() => {});
        }
      }
      await prisma.reminderLog
        .create({
          data: { contractId: c.id, chatId, kind: r.kind, dueDate, sentOn, amount: c.debtAmount, ok, error },
        })
        .catch(() => {});
      await new Promise((r2) => setTimeout(r2, 60)); // Telegram limiti (~30 xabar/s)
    }
  }

  // Xodimlarga qisqa hisobot
  if (!opts.dryRun && (res.sent || res.failed) && chatIdList(settings).length) {
    await broadcast(
      `🔔 <b>Barterchilarga eslatmalar</b>\n` +
        `Yuborildi: <b>${res.sent}</b>` +
        (res.failed ? `, xato: <b>${res.failed}</b>` : '') +
        (res.notLinked ? `\nBotga ulanmagan (eslatma bormadi): ${res.notLinked} ta shartnoma` : ''),
      settings,
    ).catch(() => {});
  }
  return res;
}
