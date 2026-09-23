export const CALL_STATUS: Record<string, [string, string]> = {
  received: ['Navbatda', 'warn'],
  waiting_audio: ['Yozuv kutilmoqda', 'warn'],
  done: ['Tayyor', 'ok'],
  skipped: ["O'tkazildi", 'plain'],
  failed: ['Xato', 'bad'],
};
export const STAGE: Record<string, string> = { download: 'yuklash', stt: 'matnga o‘girish', analyze: 'AI tahlil' };
export function dur(sec: number) {
  if (!sec) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
