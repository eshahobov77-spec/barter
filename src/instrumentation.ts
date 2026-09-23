/**
 * Server ishga tushganda bir marta bajariladi.
 * ENABLE_BOT=true bo'lsa, Telegram bot jarayonini shu yerda ishga tushiramiz.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // IP-telefoniya fon jarayoni (sozlamada o'chiq bo'lsa, shunchaki kutib turadi)
  if (process.env.ENABLE_TELEPHONY !== 'false') {
    try {
      const { startTelephonyWorker } = await import('./lib/telephony/worker');
      startTelephonyWorker();
    } catch (e) {
      console.error('[telefoniya] Ishga tushirib bo‘lmadi:', e);
    }
  }

  if (process.env.ENABLE_BOT !== 'true') return;

  try {
    const { startBot } = await import('./lib/scheduler');
    startBot();
  } catch (e) {
    console.error('[bot] Ishga tushirib bo‘lmadi:', e);
  }
}
