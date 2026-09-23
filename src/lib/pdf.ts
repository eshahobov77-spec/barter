/**
 * Minimal PDF yozuvchi — qo'shimcha npm paketisiz.
 * A4, standart Helvetica / Helvetica-Bold shriftlari (WinAnsi).
 * Kirill harflari lotinga o'giriladi, maxsus belgilar ASCII ga soddalashtiriladi.
 */
import { deflateSync } from 'node:zlib';

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

// Helvetica AFM kengliklari, ASCII 32..126 (1000 birlikda)
const W_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778,
  722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778,
  722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const CYR: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo', Ж: 'J', З: 'Z', И: 'I', Й: 'Y', К: 'K',
  Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'X', Ц: 'Ts',
  Ч: 'Ch', Ш: 'Sh', Щ: 'Sh', Ъ: "'", Ы: 'I', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya', Ў: "O'", Қ: 'Q',
  Ғ: "G'", Ҳ: 'H',
};

/** Matnni Helvetica/WinAnsi chiza oladigan ASCII ga keltiradi. */
export function toPdfText(input: any): string {
  let s = String(input ?? '');
  s = s.replace(/[ʻʼ‘’`´]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—−]/g, '-').replace(/№/g, 'No');
  s = s.replace(/[\u00A0\u202F\u2009]/g, ' ');
  let out = '';
  for (const ch of s) {
    const up = ch.toUpperCase();
    if (CYR[up] !== undefined) {
      const t = CYR[up];
      out += ch === up ? t : t.toLowerCase();
    } else if (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) {
      out += ch;
    } else if (ch === '\n' || ch === '\t') {
      out += ' ';
    } else {
      out += '?';
    }
  }
  return out;
}

export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? table[c - 32] : 556;
  }
  return (w * size) / 1000;
}

/** Kenglikka sig'masa, oxirini "..." bilan qisqartiradi. */
export function fitText(text: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && textWidth(t + '...', size, bold) > maxWidth) t = t.slice(0, -1);
  return t + '...';
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function n(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

export type Align = 'left' | 'right' | 'center';

export class PdfDoc {
  private pages: string[][] = [];
  private cur: string[] = [];

  constructor() {
    this.addPage();
  }

  addPage() {
    this.cur = [];
    this.pages.push(this.cur);
  }

  get pageCount() {
    return this.pages.length;
  }

  /** y — sahifaning yuqorisidan (tepadan pastga) o'lchanadi. */
  text(x: number, y: number, raw: string, opts: { size?: number; bold?: boolean; align?: Align; gray?: number } = {}) {
    const size = opts.size ?? 10;
    const bold = !!opts.bold;
    const t = toPdfText(raw);
    let px = x;
    if (opts.align === 'right') px = x - textWidth(t, size, bold);
    else if (opts.align === 'center') px = x - textWidth(t, size, bold) / 2;
    const g = opts.gray ?? 0;
    this.cur.push(
      `BT ${n(g)} g /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(px)} ${n(PAGE_H - y)} Td (${esc(t)}) Tj ET`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5, gray = 0) {
    this.cur.push(`${n(gray)} G ${n(width)} w ${n(x1)} ${n(PAGE_H - y1)} m ${n(x2)} ${n(PAGE_H - y2)} l S`);
  }

  rect(x: number, y: number, w: number, h: number, opts: { fill?: number; stroke?: number; width?: number } = {}) {
    const parts: string[] = [];
    if (opts.fill !== undefined) parts.push(`${n(opts.fill)} g`);
    if (opts.stroke !== undefined) parts.push(`${n(opts.stroke)} G ${n(opts.width ?? 0.5)} w`);
    parts.push(`${n(x)} ${n(PAGE_H - y - h)} ${n(w)} ${n(h)} re`);
    if (opts.fill !== undefined && opts.stroke !== undefined) parts.push('B');
    else if (opts.fill !== undefined) parts.push('f');
    else parts.push('S');
    this.cur.push(parts.join(' '));
  }

  /** Har bir sahifaga keyinroq yoziladigan narsalar (masalan "Sahifa 1 / 3"). */
  forEachPage(fn: (index: number, total: number) => void) {
    const saved = this.cur;
    this.pages.forEach((p, i) => {
      this.cur = p;
      fn(i, this.pages.length);
    });
    this.cur = saved;
  }

  toBuffer(): Buffer {
    const objects: Buffer[] = [];
    const add = (b: Buffer | string) => {
      objects.push(typeof b === 'string' ? Buffer.from(b, 'latin1') : b);
      return objects.length; // obyekt raqami
    };

    // 1 — katalog, 2 — sahifalar (keyin to'ldiriladi), 3/4 — shriftlar
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // joy egallab turadi
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const kids: number[] = [];
    for (const ops of this.pages) {
      const raw = Buffer.from(ops.join('\n'), 'latin1');
      const z = deflateSync(raw);
      const streamNo = add(
        Buffer.concat([
          Buffer.from(`<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
          z,
          Buffer.from('\nendstream', 'latin1'),
        ]),
      );
      const pageNo = add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(PAGE_W)} ${n(PAGE_H)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamNo} 0 R >>`,
      );
      kids.push(pageNo);
    }
    objects[1] = Buffer.from(
      `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`,
      'latin1',
    );

    const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let offset = chunks[0].length;
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(offset);
      const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
      chunks.push(b);
      offset += b.length;
    });
    const xrefStart = offset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    chunks.push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(chunks);
  }
}
