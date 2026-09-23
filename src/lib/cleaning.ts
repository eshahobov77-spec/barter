/**
 * Excel qatorlarini tozalash — Django'dagi barter/importer/cleaning.py ning
 * to'liq ekvivalenti. Bu fayl bazaga bog'liq emas (alohida test qilish mumkin).
 */
import { GROUP_LABELS } from './constants';

// ---------------------------------------------------------------- sarlavhalar
export const HEADER_ALIASES: Record<string, string[]> = {
  number: ['shartnoma raqami', 'shartnoma', 'shartnoma №', 'contract'],
  supplier: ['mijoz', 'barterchi', 'fish', 'f.i.sh'],
  phone: ['telefon raqam', 'telefon', 'phone'],
  date: ['sana', 'shartnoma sanasi', 'date'],
  tjm: ['tjm nomi', 'tjm', 'obyekt'],
  total: ['umumiy summa', 'umumiy', 'shartnoma summasi'],
  paid: ['berilgan chek', 'chek', 'tolangan', "to'langan"],
  remaining: ['qolgan summa', 'qoldiq', 'qolgan'],
  monthly: ['oylik qarzdorlik', 'oylik'],
  note: ['izox', 'izoh'],
  material: ['hom ashyo', 'xom ashyo', 'material'],
  material_group: ['hom guruhi', 'xom ashyo guruhi', 'guruh'],
  status: ['holati', 'holat'],
};
const REQUIRED = ['number', 'supplier', 'tjm', 'total'];

function normHeader(value: any): string {
  let s = String(value ?? '').trim().toLowerCase();
  s = s.replace(/[‘’ʻʼ]/g, "'");
  return s.replace(/\s+/g, ' ');
}

export function mapHeaders(headerRow: any[]): Record<string, number> {
  const result: Record<string, number> = {};
  const normalized = (headerRow || []).map(normHeader);
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    for (let idx = 0; idx < normalized.length; idx++) {
      if (aliases.includes(normalized[idx])) {
        result[key] = idx;
        break;
      }
    }
  }
  const missing = REQUIRED.filter((k) => !(k in result));
  if (missing.length) {
    throw new Error('Excelda majburiy ustunlar topilmadi: ' + missing.join(', '));
  }
  return result;
}

// ------------------------------------------------------------------ matnlar
const APOSTROPHES = /[‘’ʻʼ`´′]/g;

export function cleanText(value: any): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (s.toLowerCase() === 'nan') return '';
  s = s.normalize('NFC').replace(APOSTROPHES, "'").replace(/ /g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export function cleanPersonName(value: any): string {
  return cleanText(value).toUpperCase();
}

/** Qidiruv kaliti: katta harf, apostrofsiz, faqat harf/raqam/probel. */
export function searchKey(value: any): string {
  const s = cleanText(value).toUpperCase().replace(/'/g, '');
  return s.replace(/[^0-9A-ZА-ЯЁЎҚҒҲ ]/g, '');
}

export function cleanTjm(value: any): string {
  let s = cleanText(value);
  s = s.replace(/^["'«»“”„\s]+|["'«»“”„\s]+$/g, '');
  s = s.replace(/["«»“”]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

export function tjmKey(value: any): string {
  return cleanTjm(value).toUpperCase();
}

const CYR_TO_LAT: Record<string, string> = {
  П: 'P', С: 'C', А: 'A', К: 'K', Р: 'P', М: 'M',
  Н: 'H', Т: 'T', О: 'O', Е: 'E', В: 'B', Х: 'X',
};

export function cleanContractNumber(value: any): string {
  let s = cleanText(value);
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  s = s.replace(/[ПСАКРМНТОЕВХ]/g, (ch) => CYR_TO_LAT[ch] || ch);
  return s.toUpperCase();
}

// ------------------------------------------------------------------- pullar
/** "1 250 000", "1250000,50", 1250000 -> number | null */
export function parseMoney(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'number') return isFinite(value) ? Math.round(value * 100) / 100 : null;
  let s = String(value).replace(/ /g, '').replace(/\s/g, '').trim();
  if (s === '' || s.toLowerCase() === 'nan') return null;
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const i = s.lastIndexOf(',');
    const head = s.slice(0, i);
    const tail = s.slice(i + 1);
    s = tail.length <= 2 ? `${head.replace(/,/g, '')}.${tail}` : s.replace(/,/g, '');
  }
  if (!/^-?\d*\.?\d*$/.test(s) || s === '' || s === '-' || s === '.') return null;
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// ------------------------------------------------------------------ sanalar
export function parseExcelDate(value: any): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    // Excel seriya raqami (1900 tizimi)
    if (value < 1 || value > 100000) return null;
    const ms = Math.round((value - 25569) * 86400000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = cleanText(value).replace(/,/g, '.').replace(/\//g, '.');
  if (!s) return null;
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return isNaN(d.getTime()) ? null : d;
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ---------------------------------------------------------------- telefonlar
/** Qaytaradi: [telefonlar, muammo_matni | null] */
export function parsePhones(value: any): [string[], string | null] {
  if (value === null || value === undefined) return [[], null];
  if (typeof value === 'number') value = String(Math.trunc(value));
  const raw = cleanText(value).replace(/^=+/, '');
  if (!raw) return [[], null];
  const phones: string[] = [];
  let problem: string | null = null;
  for (const part of raw.split(/[,;/]/)) {
    let digits = part.replace(/\D/g, '');
    if (part.trim().startsWith('+') && !digits.startsWith('998') && digits.length >= 10 && digits.length <= 15) {
      const phone = '+' + digits;
      if (!phones.includes(phone)) phones.push(phone);
      continue;
    }
    while (digits) {
      let chunk: string;
      if (digits.startsWith('998') && digits.length >= 12) {
        chunk = digits.slice(0, 12);
        digits = digits.slice(12);
      } else if (digits.length >= 9) {
        chunk = '998' + digits.slice(0, 9);
        digits = digits.slice(9);
      } else {
        problem = `Telefonning bir qismi o'qilmadi: ${digits}`;
        break;
      }
      const phone = '+' + chunk;
      if (!phones.includes(phone)) phones.push(phone);
    }
  }
  if (!phones.length && problem === null) problem = `Telefon o'qilmadi: ${raw}`;
  return [phones, problem];
}

// -------------------------------------------------------------- holat/material
const STATUS_MAP: Record<string, string> = {
  DOIMIY: 'doimiy',
  ORTA: 'orta',
  "O'RTA": 'orta',
  TOXTAGAN: 'toxtagan',
  "TO'XTAGAN": 'toxtagan',
  NO: 'yoq',
  YOQ: 'yoq',
  "YO'Q": 'yoq',
};
const STATUS_CODES = ['doimiy', 'orta', 'toxtagan', 'yoq', ''];

function own(obj: Record<string, any>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function parseStatus(value: any): string {
  const s = cleanText(value).toUpperCase();
  if (own(STATUS_MAP, s)) return STATUS_MAP[s];
  if (STATUS_CODES.includes(s.toLowerCase())) return s.toLowerCase();
  return '';
}

const MATERIAL_ALIASES: Record<string, string> = {
  GAZABLOK: 'GAZOBLOK',
  SALYARKA: 'SOLYARKA',
  KRAYNSHTEYN: 'KRANSHTEYN',
  NO: '',
  'НОН': 'NON',
};

export const MATERIAL_GROUPS: Record<string, string[]> = {
  material: [
    'AKFA', 'ALKAFON', 'APOLAFKA', 'ASFALT', 'BAZALT', 'BETON', 'BETONZAVOD', 'BLOK',
    'ESHIK', 'FASAD', "G'ISHT", 'GAZOBLOK', 'IZOLYATSIYA', 'KABEL', 'KAFEL',
    'KANALIZATSIYA', 'KRANSHTEYN', 'MDF', 'MEBEL', 'METAL', 'MRAMR', 'OYNA', 'PANEL',
    'PERILLA', 'PLITA', 'PROFIL', 'PROFNASTIL', 'QUM', 'ROTBAND', 'SANTEXNIKA', 'SEMENT',
    'SETKA', "SHAG'AL", 'SHEBEN', 'SHIT', 'SOLYARKA', 'SVITILNIK', 'TAXTA', 'TOSH',
    'XIM DOBAVKA', 'ELEKTR', 'KONDITSIONER', 'VENTILYATSIYA', 'LIFT', 'ZAPCHAST',
    'XOZMAK', 'KARYER', 'GAZON', 'DARAXT',
  ],
  texnika: ['TEXNIKA', 'KRAN', 'EKSKOVATOR', 'DAMKRAT', 'BITOVOY'],
  xizmat: [
    'ABYOM', 'KOTLOVAN', 'MALYAR', 'STYASHKA', 'SVARSHIK', 'REKLAMA', 'BILBOARD',
    'ARENDA', 'MAKLER', 'OYLIK', 'LOYXA',
  ],
  oziq_ovqat: ["GO'SHT", 'NON', 'GURUCH', 'TUXUM', 'PRODUKTA', 'ZIRAVOR'],
};

const GROUP_BY_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(GROUP_LABELS).map(([k, v]) => [v.toUpperCase(), k]),
);

export function parseMaterial(value: any): string {
  const s = cleanText(value).toUpperCase();
  return own(MATERIAL_ALIASES, s) ? MATERIAL_ALIASES[s] : s;
}

export function materialGroup(material: string, explicit?: any): string {
  if (explicit) {
    const e = cleanText(explicit);
    if (own(GROUP_LABELS, e.toLowerCase())) return e.toLowerCase();
    if (own(GROUP_BY_LABEL, e.toUpperCase())) return GROUP_BY_LABEL[e.toUpperCase()];
  }
  for (const [group, names] of Object.entries(MATERIAL_GROUPS)) {
    if (names.includes(material)) return group;
  }
  return 'boshqa';
}

// --------------------------------------------------------------- qator natijasi
export type CleanRow = {
  rowNo: number;
  number: string;
  supplier: string;
  supplierKey: string;
  phones: string[];
  contractDate: Date | null;
  tjm: string;
  total: number;
  paid: number;
  remaining: number;
  monthly: number;
  note: string;
  material: string;
  materialGroup: string;
  status: string;
  problems: string[];
  errors: string[];
  duplicateOf: number | null;
};

function cell(row: any[], mapping: Record<string, number>, key: string): any {
  const idx = mapping[key];
  if (idx === undefined || idx >= row.length) return null;
  return row[idx];
}

function groupSep(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function cleanRow(row: any[], mapping: Record<string, number>, rowNo: number): CleanRow {
  const problems: string[] = [];
  const errors: string[] = [];

  const numberRaw = cell(row, mapping, 'number');
  const number = cleanContractNumber(numberRaw);
  if (cleanText(numberRaw) && number !== cleanText(numberRaw).toUpperCase()) {
    problems.push(`Shartnoma raqami o'zgartirildi: ${cleanText(numberRaw)} → ${number}`);
  }
  const supplier = cleanPersonName(cell(row, mapping, 'supplier'));
  const tjm = cleanTjm(cell(row, mapping, 'tjm'));
  const rawTjm = cleanText(cell(row, mapping, 'tjm'));
  if (rawTjm && rawTjm !== tjm) problems.push(`TJM nomi tozalandi: ${rawTjm} → ${tjm}`);

  if (!number) errors.push("Shartnoma raqami bo'sh");
  if (!supplier) errors.push("Barterchi ismi bo'sh");
  if (!tjm) errors.push("TJM bo'sh");

  const [phones, phoneProblem] = parsePhones(cell(row, mapping, 'phone'));
  if (phoneProblem) problems.push(phoneProblem);

  const rawDate = cell(row, mapping, 'date');
  const contractDate = parseExcelDate(rawDate);
  if (contractDate === null && cleanText(rawDate)) {
    problems.push(`Sana o'qilmadi: ${cleanText(rawDate)}`);
  } else if (
    typeof rawDate === 'string' &&
    contractDate &&
    !/^\d{1,2}\.\d{1,2}\.\d{4} \d{1,2}:\d{2}$/.test(cleanText(rawDate))
  ) {
    problems.push(`Sana formati tuzatildi: ${cleanText(rawDate)}`);
  }

  let total = parseMoney(cell(row, mapping, 'total'));
  let paid = parseMoney(cell(row, mapping, 'paid'));
  const remainingFile = parseMoney(cell(row, mapping, 'remaining'));
  const monthly = parseMoney(cell(row, mapping, 'monthly')) ?? 0;

  if (total === null) {
    errors.push("Umumiy summa o'qilmadi");
    total = 0;
  }
  if (paid === null) paid = remainingFile !== null ? Math.round((total - remainingFile) * 100) / 100 : 0;
  const remaining = Math.round((total - paid) * 100) / 100;

  if (remainingFile !== null && Math.abs(remainingFile - remaining) > 1) {
    problems.push(
      `Qolgan summa mos emas: faylda ${groupSep(remainingFile)}, hisob bo'yicha ${groupSep(remaining)}`,
    );
  }
  if (paid < 0) errors.push('Berilgan chek manfiy');
  if (remaining < 0) errors.push('Berilgan chek umumiy summadan katta');
  if (monthly > remaining && remaining >= 0) problems.push("Oylik qarzdorlik qoldiqdan katta");

  const materialRaw = cleanText(cell(row, mapping, 'material')).toUpperCase();
  const material = parseMaterial(materialRaw);
  if (materialRaw && material !== materialRaw) {
    problems.push(`Hom ashyo nomi birxillashtirildi: ${materialRaw} → ${material || '—'}`);
  }
  if (!material) problems.push("Hom ashyo ko'rsatilmagan");
  const group = materialGroup(material, cell(row, mapping, 'material_group'));

  const statusRaw = cell(row, mapping, 'status');
  const status = parseStatus(statusRaw);
  if (cleanText(statusRaw) && !status) problems.push(`Holat tanilmadi: ${cleanText(statusRaw)}`);

  return {
    rowNo,
    number,
    supplier,
    supplierKey: searchKey(supplier),
    phones,
    contractDate,
    tjm,
    total,
    paid,
    remaining,
    monthly,
    note: cleanText(cell(row, mapping, 'note')),
    material,
    materialGroup: group,
    status,
    problems,
    errors,
    duplicateOf: null,
  };
}

/**
 * rows: sarlavha qatori + ma'lumot qatorlari.
 * rowOffset — Excel faylida sarlavhagacha tashlab yuborilgan qatorlar soni
 * (xato xabarlarida haqiqiy qator raqami ko'rinishi uchun).
 */
export function cleanRows(rows: any[][], rowOffset = 0): CleanRow[] {
  const list = rows || [];
  if (!list.length) throw new Error("Excel fayl bo'sh");
  const mapping = mapHeaders(list[0]);
  const result: CleanRow[] = [];
  const seen = new Map<string, CleanRow>();

  for (let i = 1; i < list.length; i++) {
    const row = list[i] || [];
    const rowNo = rowOffset + i + 1;
    if (!row.length || row.every((c) => cleanText(c) === '')) continue;
    // "JAMI" kabi yig'indi qatorlari
    if (!cleanText(cell(row, mapping, 'number')) && !cleanText(cell(row, mapping, 'supplier'))) continue;

    const item = cleanRow(row, mapping, rowNo);
    const key = `${tjmKey(item.tjm)}||${item.number}`;
    if (item.number && seen.has(key)) {
      const first = seen.get(key)!;
      const same =
        first.supplierKey === item.supplierKey && first.total === item.total && first.paid === item.paid;
      if (same) {
        item.duplicateOf = first.rowNo;
        item.problems.push(`To'liq dublikat (${first.rowNo}-qator bilan bir xil) — import qilinmaydi`);
        for (const p of item.phones) if (!first.phones.includes(p)) first.phones.push(p);
      } else {
        item.errors.push(
          `Shartnoma raqami ${item.number} shu TJMda ${first.rowNo}-qatorda boshqa ma'lumot bilan bor`,
        );
      }
    } else if (item.number) {
      seen.set(key, item);
    }
    result.push(item);
  }
  return result;
}
