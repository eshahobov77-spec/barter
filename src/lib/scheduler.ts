/**
 * Telegram bot jarayoni: rejali hisobotlar + buyruqlar.
 * Next server ichida `instrumentation.ts` orqali ishga tushadi (ENABLE_BOT=true bo'lsa).
 */
import prisma from './db';
import { call, chatIdList, sendMessage, broadcast, TelegramError } from './telegram';
import { loadSettings } from './telegram';
import { dailyReport, debtReport, weeklyReport, HELP_TEXT } from './botReports';
import { isoDate, localHM, localParts } from './format';
import { dayStart } from './dates';
import { runReminders } from './reminders';
import { handleSupplierCallback, handleSupplierMessage } from './supplierBot';

let started = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function checkSchedule(settings: any) {
  if (!chatIdList(settings).length) return;
  const nowHM = localHM();
  if (nowHM < settings.dailyTime) return;

  const today = dayStart(new Date());
  const todayIso = isoDate(today);

  if (settings.dailyEnabled && (!settings.lastDailySent || isoDate(settings.lastDailySent) !== todayIso)) {
    const { sent, errors } = await broadcast(await dailyReport(today), settings);
    await prisma.botSettings.update({ where: { id: 1 }, data: { lastDailySent: today } });
    console.log(`[bot] Kunlik hisobot: ${sent} ta chat`, errors.length ? errors : '');
  }

  const weekday = localParts().weekday;
  if (
    settings.weeklyEnabled &&
    weekday === settings.weeklyDay &&
    (!settings.lastWeeklySent || isoDate(settings.lastWeeklySent) !== todayIso)
  ) {
    const { sent, errors } = await broadcast(await weeklyReport(today), settings);
    await prisma.botSettings.update({ where: { id: 1 }, data: { lastWeeklySent: today } });
    console.log(`[bot] Haftalik hisobot: ${sent} ta chat`, errors.length ? errors : '');
  }
}

async function checkReminders(settings: any) {
  if (!settings.supplierBotEnabled || !settings.remindEnabled) return;
  if (localHM() < settings.remindTime) return;
  const today = dayStart(new Date());
  if (settings.lastRemindRun && isoDate(settings.lastRemindRun) === isoDate(today)) return;

  const res = await runReminders(settings, { today });
  await prisma.botSettings.update({ where: { id: 1 }, data: { lastRemindRun: today } });
  console.log(
    `[bot] Eslatmalar: ${res.sent} yuborildi, ${res.failed} xato, ${res.notLinked} ulanmagan, ${res.already} avval yuborilgan`,
  );
}

async function handleMessage(settings: any, message: any) {
  const text = String(message?.text || '').trim();
  const chatId = String(message?.chat?.id ?? '');
  if (!chatId) return;

  const [rawCommand, ...rest] = text.split(' ');
  const command = rawCommand.split('@')[0].toLowerCase();
  const arg = rest.join(' ').trim();

  // Chat ID ni bilish — hamma uchun (xodimlarni ulashda kerak)
  if (command === '/id') {
    await sendMessage(settings.token, chatId, `Chat ID: <code>${chatId}</code>`);
    return;
  }

  const isStaff = chatIdList(settings).includes(chatId);
  const isPrivate = message?.chat?.type === 'private';

  // Barterchilar portali — faqat shaxsiy chatda va xodim bo'lmaganlar uchun
  if (!isStaff && isPrivate && settings.supplierBotEnabled) {
    await handleSupplierMessage(settings, message);
    return;
  }

  if (!text.startsWith('/')) return;
  if (isStaff && !settings.commandsEnabled) return;

  if (!isStaff) {
    await sendMessage(
      settings.token,
      chatId,
      `⛔️ Bu chatga ruxsat berilmagan.\nChat ID: <code>${chatId}</code>\n` +
        'Admin uni saytdagi «Bot sozlamalari» bo‘limiga qo‘shishi kerak.',
    );
    return;
  }

  const today = dayStart(new Date());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  let reply: string;
  if (['/start', '/help', '/yordam'].includes(command)) reply = HELP_TEXT;
  else if (command === '/bugun') reply = await dailyReport(today);
  else if (command === '/kecha') reply = await dailyReport(yesterday);
  else if (command === '/hafta') reply = await weeklyReport(today);
  else if (command === '/qarz') reply = await debtReport(arg);
  else reply = "Noma'lum buyruq.\n\n" + HELP_TEXT;

  await sendMessage(settings.token, chatId, reply);
}

async function loop() {
  let offset: number | undefined;
  let webhookClearedFor: string | null = null;

  console.log('[bot] Telegram bot ishga tushdi.');
  for (;;) {
    try {
      const settings = await loadSettings();
      if (!settings.token) {
        await sleep(30000);
        continue;
      }

      try {
        await checkSchedule(settings);
      } catch (e) {
        console.error('[bot] Rejali hisobotda xato:', e);
      }
      try {
        await checkReminders(settings);
      } catch (e) {
        console.error('[bot] Eslatmalarda xato:', e);
      }

      if (!settings.commandsEnabled && !settings.supplierBotEnabled) {
        await sleep(30000);
        continue;
      }

      try {
        if (webhookClearedFor !== settings.token) {
          await call(settings.token, 'deleteWebhook');
          webhookClearedFor = settings.token;
        }
        const updates = await call(
          settings.token,
          'getUpdates',
          { timeout: 25, offset, allowed_updates: ['message', 'callback_query'] },
          35000,
        );
        for (const upd of updates || []) {
          offset = upd.update_id + 1;
          try {
            if (upd.callback_query) {
              if (settings.supplierBotEnabled) await handleSupplierCallback(settings, upd.callback_query);
            } else if (upd.message) {
              await handleMessage(settings, upd.message);
            }
          } catch (e) {
            console.error('[bot] Buyruqni bajarishda xato:', e);
          }
        }
      } catch (e) {
        if (e instanceof TelegramError) {
          console.warn('[bot] getUpdates:', e.message);
          await sleep(10000);
        } else {
          throw e;
        }
      }
    } catch (e) {
      console.error('[bot] Kutilmagan xato:', e);
      await sleep(15000);
    }
  }
}

export function startBot() {
  if (started) return;
  started = true;
  loop().catch((e) => console.error('[bot] To‘xtadi:', e));
}
