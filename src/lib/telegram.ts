/** Telegram Bot API — qo'shimcha kutubxonasiz (fetch orqali). */
import prisma from './db';

const API_URL = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;
const LIMIT = 4000;

export class TelegramError extends Error {}

export async function call(
  token: string,
  method: string,
  params: Record<string, any> = {},
  httpTimeoutMs = 15000,
): Promise<any> {
  if (!token) throw new TelegramError('Bot token kiritilmagan');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), httpTimeoutMs);
  let resp: Response;
  try {
    resp = await fetch(API_URL(token, method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (e: any) {
    throw new TelegramError(`Telegramga ulanib bo'lmadi: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
  let data: any;
  try {
    data = await resp.json();
  } catch {
    throw new TelegramError("Telegram javobi noto'g'ri");
  }
  if (!data.ok) throw new TelegramError(data.description || "Noma'lum xato");
  return data.result;
}

export function splitMessage(text: string, limit = LIMIT): string[] {
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > limit && current) {
      parts.push(current);
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** `extra` (masalan reply_markup) faqat oxirgi qismga qo'shiladi. */
export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
  extra: Record<string, any> = {},
): Promise<void> {
  const parts = splitMessage(text);
  for (let i = 0; i < parts.length; i++) {
    await call(token, 'sendMessage', {
      chat_id: chatId,
      text: parts[i],
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(i === parts.length - 1 ? extra : {}),
    });
  }
}

/** Fayl yuborish (multipart/form-data). */
export async function sendDocument(
  token: string,
  chatId: string,
  file: Buffer,
  filename: string,
  caption = '',
): Promise<void> {
  if (!token) throw new TelegramError('Bot token kiritilmagan');
  const form = new FormData();
  form.append('chat_id', chatId);
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
  }
  form.append('document', new Blob([new Uint8Array(file)], { type: 'application/pdf' }), filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let data: any;
  try {
    const resp = await fetch(API_URL(token, 'sendDocument'), {
      method: 'POST',
      body: form,
      signal: controller.signal,
      cache: 'no-store',
    });
    data = await resp.json();
  } catch (e: any) {
    throw new TelegramError(`Faylni yuborib bo'lmadi: ${e?.message || e}`);
  } finally {
    clearTimeout(timer);
  }
  if (!data?.ok) throw new TelegramError(data?.description || "Noma'lum xato");
}

/** Foydalanuvchi botni bloklagan / chat yo'q — qayta urinish befoyda. */
export function isChatGone(e: any): boolean {
  const m = String(e?.message || e || '').toLowerCase();
  return m.includes('blocked') || m.includes('chat not found') || m.includes('user is deactivated');
}

export function chatIdList(settings: { chatIds: string }): string[] {
  return (settings.chatIds || '')
    .replace(/;/g, ',')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

export function isConfigured(settings: { token: string; chatIds: string } | null): boolean {
  return !!(settings && settings.token && chatIdList(settings).length);
}

export function maskedToken(token: string): string {
  if (!token) return '';
  if (token.length < 10) return '•'.repeat(token.length);
  return `${token.slice(0, 4)}${'•'.repeat(12)}${token.slice(-4)}`;
}

/** Barcha chat ID larga yuboradi. Qaytaradi: {sent, errors} */
export async function broadcast(
  text: string,
  settings?: any,
): Promise<{ sent: number; errors: string[] }> {
  const s = settings || (await loadSettings());
  let sent = 0;
  const errors: string[] = [];
  for (const chatId of chatIdList(s)) {
    try {
      await sendMessage(s.token, chatId, text);
      sent += 1;
    } catch (e: any) {
      errors.push(`${chatId}: ${e?.message || e}`);
    }
  }
  return { sent, errors };
}

/** Yagona sozlamalar yozuvi (id = 1). */
export async function loadSettings(): Promise<any> {
  return prisma.botSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}
