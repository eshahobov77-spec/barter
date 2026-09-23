/** Audio fayllarni yuklab olish va serverda saqlash. */
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';

export const CALLS_DIR = process.env.CALLS_DIR || path.join(process.cwd(), 'data', 'calls');

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
};
export const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
};

/** Fayl boshidagi baytlar bo'yicha audio turini aniqlaydi (HTML xato sahifasini audio deb olmaslik uchun). */
export function sniffAudio(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  const s4 = buf.subarray(0, 4).toString('latin1');
  if (s4 === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav';
  if (s4.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  if (s4 === 'OggS') return 'ogg';
  if (s4 === 'fLaC') return 'flac';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'webm';
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return 'aac';
  return null;
}

export function extFor(mime: string, name = ''): string {
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  if (EXT_BY_MIME[m]) return EXT_BY_MIME[m];
  const e = /\.([a-z0-9]{2,4})(?:\?|$)/i.exec(name)?.[1]?.toLowerCase();
  return e && MIME_BY_EXT[e] ? e : 'mp3';
}

export async function saveAudio(callId: number, buf: Buffer, mime: string, name = ''): Promise<{ path: string; mime: string; bytes: number }> {
  const sniffed = sniffAudio(buf);
  if (!sniffed) throw new Error("Fayl audio emas (MP3/WAV/OGG/M4A kutilgan edi)");
  const ext = sniffed || extFor(mime, name);
  const now = new Date();
  const rel = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), `${callId}.${ext}`);
  const full = path.join(CALLS_DIR, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  return { path: rel, mime: MIME_BY_EXT[ext] || 'audio/mpeg', bytes: buf.length };
}

export function fullAudioPath(rel: string): string {
  const full = path.resolve(CALLS_DIR, rel);
  if (!full.startsWith(path.resolve(CALLS_DIR) + path.sep)) throw new Error("Noto'g'ri fayl yo'li");
  return full;
}

export async function removeAudio(rel: string) {
  if (!rel) return;
  try {
    await unlink(fullAudioPath(rel));
  } catch {
    /* allaqachon yo'q */
  }
}

export async function audioExists(rel: string): Promise<boolean> {
  try {
    await stat(fullAudioPath(rel));
    return true;
  } catch {
    return false;
  }
}

/** Ichki tarmoq manzillariga so'rov yuborishni to'sish (SSRF). */
function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  if (isIP(h) === 4) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(h) === 6) return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  return false;
}

export async function downloadAudio(url: string, maxBytes: number, headers: Record<string, string> = {}): Promise<{ buf: Buffer; mime: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Audio havolasi noto'g'ri: " + url.slice(0, 120));
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Faqat http/https havolalar qabul qilinadi');
  if (isPrivateHost(u.hostname) && process.env.ALLOW_PRIVATE_AUDIO !== 'true') {
    throw new Error("Ichki tarmoq manzilidan yuklab olish o'chirilgan (ALLOW_PRIVATE_AUDIO=true bilan yoqiladi)");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const resp = await fetch(u, { headers, signal: controller.signal, redirect: 'follow', cache: 'no-store' });
    if (!resp.ok) throw new Error(`Audio yuklanmadi: HTTP ${resp.status}`);
    const declared = Number(resp.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error(`Audio juda katta (${Math.round(declared / 1048576)} MB)`);
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("Audio bo'sh");
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        controller.abort();
        throw new Error(`Audio juda katta (> ${Math.round(maxBytes / 1048576)} MB)`);
      }
      chunks.push(Buffer.from(value));
    }
    return { buf: Buffer.concat(chunks), mime: resp.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}
