// Django TextChoices larining aynan ekvivalenti.

export const SUPPLY_STATUS: Record<string, string> = {
  '': 'Belgilanmagan',
  doimiy: 'Doimiy',
  orta: "O'rta",
  toxtagan: "To'xtagan",
  yoq: 'Yetkazmayapti (NO)',
};
export const SUPPLY_STATUS_CHOICES = [
  ['doimiy', 'Doimiy'],
  ['orta', "O'rta"],
  ['toxtagan', "To'xtagan"],
  ['yoq', 'Yetkazmayapti (NO)'],
] as const;

export const GROUP_LABELS: Record<string, string> = {
  material: 'Qurilish materiali',
  texnika: 'Texnika',
  xizmat: 'Xizmat / ish hajmi',
  oziq_ovqat: 'Oziq-ovqat',
  boshqa: 'Boshqa',
};
export const MATERIAL_GROUP_CHOICES = Object.entries(GROUP_LABELS);

export const CURRENCY: Record<string, string> = { UZS: "so'm", USD: '$' };

export const CLOSE_REASON: Record<string, string> = {
  bajarildi: "Majburiyat to'liq bajarildi",
  uy_qaytarildi: "Uy (ko'chmas mulk) qaytarildi",
  bekor: 'Shartnoma bekor qilindi',
};
export const CLOSE_REASON_CHOICES = Object.entries(CLOSE_REASON);

export const TX_KIND: Record<string, string> = {
  material: 'Material yetkazildi',
  abyom: 'Ish hajmi (abyom)',
  pul: 'Pul (naqd / bank)',
  boshlangich: "Boshlang'ich chek (import)",
};
/** Qo'lda kiritiladigan turlar (boshlang'ich chek faqat import orqali) */
export const TX_KIND_CHOICES = [
  ['material', 'Material yetkazildi'],
  ['abyom', 'Ish hajmi (abyom)'],
  ['pul', 'Pul (naqd / bank)'],
] as const;
export const KIND_OPENING = 'boshlangich';

export const NOTE_KIND: Record<string, string> = {
  qongiroq: "Qo'ng'iroq qilindi",
  javobsiz: 'Javob bermadi',
  uchrashuv: "Uchrashuv bo'ldi",
  izoh: 'Izoh',
  import: 'Excel izohi',
};
export const NOTE_KIND_CHOICES = [
  ['qongiroq', "Qo'ng'iroq qilindi"],
  ['javobsiz', 'Javob bermadi'],
  ['uchrashuv', "Uchrashuv bo'ldi"],
  ['izoh', 'Izoh'],
] as const;
export const CALL_KINDS = ['qongiroq', 'javobsiz'];

export const AUDIT_ACTION: Record<string, string> = {
  kirish: 'Kirish',
  kirish_xato: 'Kirish xatosi',
  chiqish: 'Chiqish',
  tolov: 'Tushum',
  tolov_ochirish: "Tushum o'chirildi",
  izoh: 'Izoh',
  shartnoma_yangi: 'Yangi shartnoma',
  shartnoma_tahrir: 'Shartnoma tahriri',
  yopish: 'Shartnoma yopildi',
  qayta_ochish: 'Qayta ochildi',
  import: 'Import',
  export: 'Export',
  user_yangi: 'Yangi foydalanuvchi',
  user_tahrir: 'Foydalanuvchi tahriri',
  user_ochirish: "Foydalanuvchi o'chirildi",
  parol: "Parol o'zgartirildi",
  bot: 'Bot sozlamalari',
  bot_yuborish: 'Bot xabari',
};
export const AUDIT_ACTION_CHOICES = Object.entries(AUDIT_ACTION);

export const A = {
  LOGIN: 'kirish',
  LOGIN_FAILED: 'kirish_xato',
  LOGOUT: 'chiqish',
  PAYMENT: 'tolov',
  PAYMENT_DELETE: 'tolov_ochirish',
  NOTE: 'izoh',
  CONTRACT_CREATE: 'shartnoma_yangi',
  CONTRACT_EDIT: 'shartnoma_tahrir',
  CLOSE: 'yopish',
  REOPEN: 'qayta_ochish',
  IMPORT: 'import',
  EXPORT: 'export',
  USER_CREATE: 'user_yangi',
  USER_EDIT: 'user_tahrir',
  USER_DELETE: 'user_ochirish',
  PASSWORD: 'parol',
  BOT_SETTINGS: 'bot',
  BOT_SEND: 'bot_yuborish',
} as const;

export const WEEKDAYS = [
  [0, 'Dushanba'],
  [1, 'Seshanba'],
  [2, 'Chorshanba'],
  [3, 'Payshanba'],
  [4, 'Juma'],
  [5, 'Shanba'],
  [6, 'Yakshanba'],
] as const;

export const MONTHS_UZ = [
  '',
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentyabr',
  'Oktyabr',
  'Noyabr',
  'Dekabr',
];

export const PAGE_SIZE = 50;
