/**
 * Nutqni matnga o'girish (STT) va suhbat xulosasi (LLM).
 * STT: OpenAI-mos /audio/transcriptions — OpenAI Whisper, Groq yoki o'z serveringizdagi
 *      Whisper (faster-whisper-server, whisper.cpp server) — hammasi shu formatni qo'llaydi.
 * LLM: Anthropic Messages API yoki OpenAI-mos /chat/completions.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fullAudioPath, MIME_BY_EXT } from './storage';

async function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal, cache: 'no-store' });
  } catch (e: any) {
    throw new Error(e?.name === 'AbortError' ? `Vaqt tugadi: ${new URL(url).host}` : `Ulanib bo'lmadi: ${e?.message || e}`);
  } finally {
    clearTimeout(t);
  }
}

export async function transcribe(s: any, relPath: string): Promise<string> {
  if (!s.sttUrl) throw new Error('STT manzili kiritilmagan');
  const buf = await readFile(fullAudioPath(relPath));
  const ext = path.extname(relPath).slice(1);
  if (buf.length > 25 * 1048576 && /api\.openai\.com/.test(s.sttUrl)) {
    throw new Error("OpenAI Whisper 25 MB dan katta faylni qabul qilmaydi — o'z Whisper serveringizni ishlating");
  }
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: MIME_BY_EXT[ext] || 'audio/mpeg' }), `call.${ext || 'mp3'}`);
  form.append('model', s.sttModel || 'whisper-1');
  if (s.sttLanguage) form.append('language', s.sttLanguage);
  form.append('response_format', 'json');
  form.append('temperature', '0');
  const headers: Record<string, string> = {};
  if (s.sttKey) headers.Authorization = `Bearer ${s.sttKey}`;
  const resp = await timedFetch(s.sttUrl, { method: 'POST', body: form, headers }, 600_000);
  const text = await resp.text();
  if (!resp.ok) throw new Error(`STT xatosi (HTTP ${resp.status}): ${text.slice(0, 300)}`);
  try {
    const j = JSON.parse(text);
    return String(j.text ?? j.transcript ?? '').trim();
  } catch {
    return text.trim();
  }
}

export type CallAnalysis = {
  summary: string;
  promiseDate: string; // YYYY-MM-DD yoki ''
  promiseWhat: string;
  promiseAmount: number;
  contractNumber: string;
};

export type AnalysisContext = {
  today: string;
  direction: string;
  supplierName: string;
  contracts: { number: string; tjm: string; material: string; debt: string; remaining: string }[];
};

function buildPrompt(transcript: string, ctx: AnalysisContext): string {
  return (
    `Bugungi sana: ${ctx.today}. Qo'ng'iroq yo'nalishi: ${ctx.direction === 'in' ? 'barterchi qo\'ng\'iroq qildi' : ctx.direction === 'out' ? 'kompaniya qo\'ng\'iroq qildi' : 'noma\'lum'}.\n` +
    (ctx.supplierName ? `Barterchi: ${ctx.supplierName}.\n` : 'Barterchi aniqlanmagan.\n') +
    (ctx.contracts.length
      ? 'Barterchining ochiq shartnomalari:\n' +
        ctx.contracts.map((c) => `- № ${c.number} (${c.tjm}), hom ashyo: ${c.material || '—'}, qarzdorlik: ${c.debt}, qoldiq: ${c.remaining}`).join('\n') + '\n'
      : '') +
    `\nSuhbat matni (avtomatik transkripsiya, xatolar bo'lishi mumkin):\n"""\n${transcript.slice(0, 15000)}\n"""\n\n` +
    'Faqat JSON qaytar, boshqa hech narsa yozma:\n' +
    '{"summary": "o\'zbek (lotin) tilida 1-3 gapli xulosa: kim, nima haqida, qanday kelishildi. Masalan: Barterchi 25.10.2026 kuni 10 tonna sement keltirishga va\'da berdi.",\n' +
    ' "promise_date": "YYYY-MM-DD — barterchi va\'da qilgan sana (\'ertaga\', \'25-sana\', \'dushanba\' kabilarni bugungi sanaga nisbatan hisobla) yoki bo\'sh",\n' +
    ' "promise_what": "nima va qancha (masalan: 10 tonna sement) yoki bo\'sh",\n' +
    ' "promise_amount": "so\'mdagi summa (son), aytilmagan bo\'lsa 0",\n' +
    ' "contract_number": "suhbatda qaysi shartnoma haqida gap ketgani aniq bo\'lsa — ro\'yxatdagi raqam, aks holda bo\'sh"}\n' +
    "Matnda yo'q narsani o'ylab topma. Va'da bo'lmasa promise_* maydonlari bo'sh/0 bo'lsin."
  );
}

const SYSTEM = "Sen qurilish kompaniyasining barter bo'limi uchun telefon suhbatlarini tahlil qiladigan yordamchisan. Aniq va qisqa yoz.";

function parseJson(text: string): any {
  const clean = text.replace(/```json|```/g, '').trim();
  const i = clean.indexOf('{');
  const j = clean.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('AI JSON qaytarmadi');
  return JSON.parse(clean.slice(i, j + 1));
}

export async function analyze(s: any, transcript: string, ctx: AnalysisContext): Promise<CallAnalysis> {
  if (!s.llmKey) return heuristic(transcript, ctx);
  const prompt = buildPrompt(transcript, ctx);
  let text = '';
  if ((s.llmProvider || 'anthropic') === 'anthropic') {
    const resp = await timedFetch(
      s.llmUrl || 'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': s.llmKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: s.llmModel, max_tokens: 1024, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
      },
      120_000,
    );
    const j: any = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`AI xatosi (HTTP ${resp.status}): ${j?.error?.message || ''}`);
    text = (j.content || []).map((c: any) => (c.type === 'text' ? c.text : '')).join('');
  } else {
    const resp = await timedFetch(
      s.llmUrl || 'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${s.llmKey}` },
        body: JSON.stringify({ model: s.llmModel, temperature: 0, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
      },
      120_000,
    );
    const j: any = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`AI xatosi (HTTP ${resp.status}): ${j?.error?.message || ''}`);
    text = j.choices?.[0]?.message?.content || '';
  }
  const r = parseJson(text);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(r.promise_date || '')) ? String(r.promise_date) : '';
  return {
    summary: String(r.summary || '').trim().slice(0, 1500),
    promiseDate: date,
    promiseWhat: String(r.promise_what || '').trim().slice(0, 200),
    promiseAmount: Math.max(0, Math.round(Number(String(r.promise_amount || 0).replace(/[^\d.]/g, '')) || 0)),
    contractNumber: String(r.contract_number || '').trim(),
  };
}

/** AI kaliti bo'lmasa: oddiy qoidalar bilan sana va miqdorni ajratish. */
export function heuristic(transcript: string, ctx: AnalysisContext): CallAnalysis {
  const low = transcript.toLowerCase().replace(/[‘’ʻʼ`]/g, "'");
  const today = new Date(ctx.today + 'T00:00');
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let date = '';
  let m: RegExpExecArray | null;
  if ((m = /(\d{1,2})\s*[-]?\s*(?:sana|chisl|inchi|nchi|chi)/.exec(low))) {
    const d = new Date(today.getFullYear(), today.getMonth(), +m[1]);
    if (d < today) d.setMonth(d.getMonth() + 1);
    date = iso(d);
  } else if (/indin/.test(low)) date = iso(new Date(today.getTime() + 2 * 86400000));
  else if (/ertaga/.test(low)) date = iso(new Date(today.getTime() + 86400000));
  const q = /(\d+(?:[.,]\d+)?)\s*(tonna|kub|dona|qop|mashina|kamaz|reys|metr|kg|litr)/.exec(low);
  const mat = ctx.contracts.find((c) => c.material && low.includes(c.material.toLowerCase()))?.material || ctx.contracts[0]?.material || '';
  const what = q ? `${q[1]} ${q[2]}${mat ? ' ' + mat.toLowerCase() : ''}` : '';
  const who = ctx.supplierName || 'Barterchi';
  const summary = date || what
    ? `${who} ${date ? date.split('-').reverse().join('.') + ' kuni ' : ''}${what || 'material'} keltirishga va'da berdi (avtomatik ajratildi, AI ulanmagan).`
    : transcript.slice(0, 400);
  return { summary, promiseDate: date, promiseWhat: what, promiseAmount: 0, contractNumber: '' };
}
