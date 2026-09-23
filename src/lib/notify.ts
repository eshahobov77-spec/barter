/**
 * Sayt ichidagi hodisalar haqida darhol Telegram xabari.
 * "Fire and forget" — so'rovni sekinlashtirmaydi, xato bo'lsa faqat logga yozadi.
 */
import { broadcast, isConfigured, loadSettings } from './telegram';
import { paymentMessage, newContractMessage, closedMessage } from './botReports';

function fire(fn: () => Promise<void>) {
  fn().catch((e) => console.error('Telegram xabarini yuborib bo‘lmadi:', e));
}

export function paymentCreated(txnId: number): void {
  fire(async () => {
    const settings = await loadSettings();
    if (!isConfigured(settings) || !settings.notifyPayments) return;
    const text = await paymentMessage(txnId);
    if (text) await broadcast(text, settings);
  });
}

export function contractCreated(contractId: number): void {
  fire(async () => {
    const settings = await loadSettings();
    if (!isConfigured(settings) || !settings.notifyNew) return;
    const text = await newContractMessage(contractId);
    if (text) await broadcast(text, settings);
  });
}

export function contractClosed(contractId: number): void {
  fire(async () => {
    const settings = await loadSettings();
    if (!isConfigured(settings) || !settings.notifyClosed) return;
    const text = await closedMessage(contractId);
    if (text) await broadcast(text, settings);
  });
}
