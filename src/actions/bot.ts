'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { logAction } from '@/lib/audit';
import { A } from '@/lib/constants';
import { broadcast, call, chatIdList, isConfigured, loadSettings, TelegramError } from '@/lib/telegram';
import { dailyReport, debtReport, weeklyReport } from '@/lib/botReports';
import { runReminders, type ReminderRun } from '@/lib/reminders';

export type BotState = { ok?: boolean; message?: string; error?: string };

export async function saveBotSettingsAction(_prev: BotState, formData: FormData): Promise<BotState> {
  const admin = await requireAdmin();
  const current = await loadSettings();

  const tokenRaw = String(formData.get('token') || '').trim();
  const token = tokenRaw || current.token;

  const idsRaw = String(formData.get('chatIds') || '');
  const ids = idsRaw
    .replace(/;/g, ',')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  for (const c of ids) {
    if (!/^-?\d+$/.test(c)) {
      return { error: `Chat ID faqat raqamlardan iborat bo'lishi kerak: ${c}` };
    }
  }

  const dailyTime = String(formData.get('dailyTime') || '20:00');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) return { error: "Yuborish vaqti noto'g'ri." };

  const weeklyDay = Number(formData.get('weeklyDay'));
  if (!Number.isInteger(weeklyDay) || weeklyDay < 0 || weeklyDay > 6)
    return { error: 'Haftalik hisobot kunini tanlang.' };

  await prisma.botSettings.update({
    where: { id: 1 },
    data: {
      token,
      chatIds: ids.join(', '),
      dailyEnabled: formData.get('dailyEnabled') === 'on',
      dailyTime,
      weeklyEnabled: formData.get('weeklyEnabled') === 'on',
      weeklyDay,
      notifyPayments: formData.get('notifyPayments') === 'on',
      notifyNew: formData.get('notifyNew') === 'on',
      notifyClosed: formData.get('notifyClosed') === 'on',
      commandsEnabled: formData.get('commandsEnabled') === 'on',
    },
  });

  await logAction({ action: A.BOT_SETTINGS, user: admin, detail: 'Bot sozlamalari yangilandi' });
  revalidatePath('/bot');
  return { ok: true, message: 'Sozlamalar saqlandi.' };
}

export async function testBotAction(): Promise<BotState> {
  await requireAdmin();
  const settings = await loadSettings();
  let me: any;
  try {
    me = await call(settings.token, 'getMe');
  } catch (e: any) {
    return { error: `Bot token ishlamadi: ${e?.message || e}` };
  }
  const { sent, errors } = await broadcast(
    `✅ Test xabari. Bot @${me?.username} ishlayapti.`,
    settings,
  );
  if (errors.length && !sent) return { error: "Yuborilmadi: " + errors.join('; ') };
  if (sent) {
    return {
      ok: true,
      message:
        `@${me?.username} ulandi, ${sent} ta chatga test xabari yuborildi.` +
        (errors.length ? ` Xatolar: ${errors.join('; ')}` : ''),
    };
  }
  return { error: `@${me?.username} ulandi, lekin Chat ID kiritilmagan.` };
}

export async function sendReportAction(kind: string): Promise<BotState> {
  const admin = await requireAdmin();
  const builders: Record<string, () => Promise<string>> = {
    kunlik: () => dailyReport(),
    haftalik: () => weeklyReport(),
    qarz: () => debtReport(''),
  };
  if (!(kind in builders)) return { error: "Noma'lum hisobot turi." };

  const settings = await loadSettings();
  if (!isConfigured(settings)) return { error: 'Avval bot token va Chat ID ni kiriting.' };

  let text: string;
  try {
    text = await builders[kind]();
  } catch (e: any) {
    return { error: `Hisobotni tayyorlab bo'lmadi: ${e?.message || e}` };
  }
  const { sent, errors } = await broadcast(text, settings);
  await logAction({ action: A.BOT_SEND, user: admin, detail: `${kind} hisobot: ${sent} ta chat` });

  if (sent) {
    return {
      ok: true,
      message: `Hisobot ${sent} ta chatga yuborildi.` + (errors.length ? ` Xato: ${errors.join('; ')}` : ''),
    };
  }
  return { error: 'Xato: ' + (errors.join('; ') || 'chat topilmadi') };
}

// ------------------------------------------------ barterchilar boti va eslatmalar

export async function saveSupplierBotAction(_prev: BotState, formData: FormData): Promise<BotState> {
  const admin = await requireAdmin();

  const int = (name: string, min: number, max: number, label: string) => {
    const v = Number(formData.get(name));
    if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${label}: ${min}–${max} oralig'ida butun son kiriting.`);
    return v;
  };

  let remindDueDay: number, remindDaysBefore: number, remindOverdueEvery: number;
  try {
    remindDueDay = int('remindDueDay', 1, 31, 'Muddat sanasi');
    remindDaysBefore = int('remindDaysBefore', 0, 15, 'Necha kun oldin');
    remindOverdueEvery = int('remindOverdueEvery', 0, 30, 'Takrorlash oralig\'i');
  } catch (e: any) {
    return { error: e.message };
  }
  const remindTime = String(formData.get('remindTime') || '10:00');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(remindTime)) return { error: "Eslatma vaqti noto'g'ri." };
  const supportPhone = String(formData.get('supportPhone') || '').trim().slice(0, 100);

  await loadSettings();
  await prisma.botSettings.update({
    where: { id: 1 },
    data: {
      supplierBotEnabled: formData.get('supplierBotEnabled') === 'on',
      remindEnabled: formData.get('remindEnabled') === 'on',
      remindDueDay,
      remindDaysBefore,
      remindOverdueEvery,
      remindTime,
      supportPhone,
    },
  });
  await logAction({ action: A.BOT_SETTINGS, user: admin, detail: 'Barterchilar boti / eslatma sozlamalari yangilandi' });
  revalidatePath('/bot');
  return { ok: true, message: 'Barterchilar boti sozlamalari saqlandi.' };
}

export type ReminderPreviewState = BotState & { run?: ReminderRun };

/** Bugun kimga eslatma ketishini ko'rsatadi — hech narsa yubormaydi. */
export async function previewRemindersAction(): Promise<ReminderPreviewState> {
  await requireAdmin();
  const settings = await loadSettings();
  try {
    const run = await runReminders(settings, { dryRun: true });
    return {
      ok: true,
      run,
      message:
        `Bugun ${run.candidates} ta shartnoma bo'yicha eslatma kerak: ` +
        `${run.candidates - run.notLinked} tasining barterchisi botga ulangan, ${run.notLinked} tasi ulanmagan` +
        (run.already ? `, ${run.already} ta xabar bugun allaqachon yuborilgan` : '') +
        '.',
    };
  } catch (e: any) {
    return { error: `Tekshirib bo'lmadi: ${e?.message || e}` };
  }
}

/** Bugungi eslatmalarni hozir yuborish (bugun yuborilganlari qayta ketmaydi). */
export async function sendRemindersNowAction(): Promise<ReminderPreviewState> {
  const admin = await requireAdmin();
  const settings = await loadSettings();
  if (!settings.token) return { error: 'Avval bot tokenini kiriting.' };
  if (!settings.supplierBotEnabled) return { error: 'Avval barterchilar botini yoqing.' };
  const run = await runReminders(settings);
  await prisma.botSettings.update({ where: { id: 1 }, data: { lastRemindRun: new Date() } });
  await logAction({
    action: A.BOT_SEND,
    user: admin,
    detail: `Eslatmalar qo'lda: ${run.sent} yuborildi, ${run.failed} xato`,
  });
  revalidatePath('/bot');
  if (run.failed && !run.sent) return { error: `Yuborilmadi: ${run.errors.slice(0, 3).join('; ')}`, run };
  return {
    ok: true,
    run,
    message: `${run.sent} ta eslatma yuborildi` + (run.failed ? `, ${run.failed} ta xato` : '') + '.',
  };
}

export async function unlinkSupplierChatAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get('id'));
  const chat = await prisma.supplierChat.findUnique({ where: { id } });
  if (!chat) return;
  await prisma.supplierChat.delete({ where: { id } });
  await logAction({
    action: A.BOT_SETTINGS,
    user: admin,
    detail: `Barterchi chati botdan uzildi: ${chat.phone} (${chat.tgName})`,
  });
  revalidatePath('/bot');
}
