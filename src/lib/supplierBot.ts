/**
 * Barterchilar boti (portal).
 *
 * Xavfsizlik: barterchi faqat Telegram tasdiqlagan O'Z telefon raqami orqali ulanadi
 * (request_contact, contact.user_id === from.id). Ruxsat — shu raqam yozilgan barcha
 * barterchilarning shartnomalari. Shartnoma raqamini terib boshqa birovnikini ko'rib bo'lmaydi.
 * Xodimlarning ichki izohlari barterchiga ko'rsatilmaydi.
 */
import prisma from './db';
import { call, sendMessage, sendDocument, broadcast, chatIdList } from './telegram';
import { dmy, dmyhm, fmtSom, fmtShort, num } from './format';
import { CURRENCY } from './constants';
import { dueInfo } from './reminders';
import { PdfDoc, PAGE_W, PAGE_H, fitText, toPdfText } from './pdf';

const BTN_SUMMARY = '💰 Qoldiq va qarzdorlik';
const BTN_SVERKA = '📋 Sverka';
const BTN_PDF = '📄 PDF akt';
const BTN_LIST = '📑 Shartnomalarim';

const MAIN_KB = {
  reply_markup: {
    keyboard: [[{ text: BTN_SUMMARY }, { text: BTN_SVERKA }], [{ text: BTN_PDF }, { text: BTN_LIST }]],
    resize_keyboard: true,
  },
};
const CONTACT_KB = {
  reply_markup: {
    keyboard: [[{ text: '📱 Raqamni yuborish', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

const KIND_LABEL: Record<string, string> = {
  boshlangich: "Boshlang'ich chek",
  material: 'Material',
  abyom: 'Ish hajmi (abyom)',
  pul: 'Pul',
};

function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cur(c: any): string {
  return CURRENCY[c.currency] || c.currency;
}

export function normalizePhone(raw: string): string {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 9) d = '998' + d;
  return '+' + d;
}

function normNumber(s: string): string {
  return String(s || '').toUpperCase().replace(/[\s\-_/.]/g, '');
}

async function contractsForPhone(phone: string) {
  return prisma.contract.findMany({
    where: { supplier: { phones: { some: { phone } } } },
    include: { tjm: true, supplier: true },
    orderBy: [{ isClosed: 'asc' }, { contractDate: 'desc' }, { id: 'desc' }],
  });
}

// ------------------------------------------------------------------ matnlar

function summaryText(c: any, dueDay: number): string {
  const lines = [
    `📄 <b>Shartnoma № ${esc(c.number)}</b>`,
    `🏗 ${esc(c.tjm.name)}`,
    `👤 ${esc(c.supplier.fullName)}`,
  ];
  if (c.contractDate) lines.push(`📅 Shartnoma sanasi: ${dmy(c.contractDate)}`);
  lines.push(
    '',
    `Umumiy summa: <b>${fmtSom(c.totalAmount)} ${cur(c)}</b>`,
    `Topshirilgan: <b>${fmtSom(c.paidAmount)} ${cur(c)}</b>`,
    `Qoldiq: <b>${fmtSom(c.remainingAmount)} ${cur(c)}</b>`,
  );
  if (!c.isClosed) {
    if (num(c.debtAmount) > 0) {
      const d = dueInfo(dueDay, new Date());
      lines.push(`Qarzdorlik: <b>${fmtSom(c.debtAmount)} ${cur(c)}</b>`, `Topshirish muddati: ${dmy(d.upcoming)}`);
    } else {
      lines.push('Qarzdorlik: <b>yo‘q</b> ✅');
    }
  }
  if (c.lastPaymentAt) lines.push(`Oxirgi topshirish: ${dmy(c.lastPaymentAt)}`);
  lines.push('', c.isClosed ? `Holati: ✅ Yopilgan${c.closedAt ? ` (${dmy(c.closedAt)})` : ''}` : 'Holati: 🟢 Faol');
  return lines.join('\n');
}

async function loadTxns(contractId: number) {
  return prisma.transaction.findMany({
    where: { contractId },
    orderBy: [{ operationDate: 'asc' }, { id: 'asc' }],
    select: { id: true, amount: true, kind: true, operationDate: true },
  });
}

const SVERKA_TEXT_LIMIT = 60;

function sverkaText(c: any, txns: any[]): string {
  const lines = [
    `📋 <b>Sverka — shartnoma № ${esc(c.number)}</b>`,
    `${esc(c.tjm.name)} · ${esc(c.supplier.fullName)}`,
    `Umumiy summa: <b>${fmtSom(c.totalAmount)} ${cur(c)}</b>`,
    '',
  ];
  if (!txns.length) {
    lines.push('Hozircha topshirilgan narsa qayd etilmagan.');
  } else {
    let running = num(c.totalAmount);
    const rows = txns.map((t, i) => {
      running -= num(t.amount);
      return `${i + 1}. ${dmy(t.operationDate)} · ${KIND_LABEL[t.kind] || t.kind} — <b>${fmtSom(t.amount)}</b>\n    qoldiq: ${fmtSom(running)}`;
    });
    if (rows.length > SVERKA_TEXT_LIMIT) {
      lines.push(`<i>Oxirgi ${SVERKA_TEXT_LIMIT} ta yozuv (hammasi — PDF aktda):</i>`);
      lines.push(...rows.slice(-SVERKA_TEXT_LIMIT));
    } else {
      lines.push(...rows);
    }
  }
  lines.push(
    '',
    `Jami topshirilgan: <b>${fmtSom(c.paidAmount)} ${cur(c)}</b>`,
    `Qoldiq: <b>${fmtSom(c.remainingAmount)} ${cur(c)}</b>`,
  );
  return lines.join('\n');
}

// ------------------------------------------------------------------ PDF akt

export function buildAktPdf(c: any, txns: any[]): Buffer {
  const doc = new PdfDoc();
  const L = 40;
  const R = PAGE_W - 40;
  const money = (v: any) => `${fmtSom(v)}`.replace(/−/g, '-');
  const currency = toPdfText(cur(c));

  let y = 50;
  doc.text(L, y, 'TXT BARTER', { size: 9, bold: true, gray: 0.45 });
  doc.text(R, y, `Tuzilgan: ${dmyhm(new Date())}`, { size: 9, align: 'right', gray: 0.45 });
  y += 30;
  doc.text(PAGE_W / 2, y, 'TAQQOSLASH AKTI (SVERKA)', { size: 16, bold: true, align: 'center' });
  y += 18;
  doc.text(PAGE_W / 2, y, `Barter shartnomasi No ${c.number} bo'yicha`, { size: 11, align: 'center', gray: 0.3 });
  y += 28;

  const info: [string, string][] = [
    ['Barterchi', c.supplier.fullName],
    ['TJM (obyekt)', c.tjm.name],
    ['Shartnoma sanasi', c.contractDate ? dmy(c.contractDate) : '-'],
    ['Holati', c.isClosed ? `Yopilgan${c.closedAt ? ` (${dmy(c.closedAt)})` : ''}` : 'Faol'],
    ['Valyuta', cur(c)],
  ];
  for (const [k, v] of info) {
    doc.text(L, y, k, { size: 10, gray: 0.4 });
    doc.text(L + 120, y, fitText(toPdfText(v), R - L - 120, 10, true), { size: 10, bold: true });
    y += 16;
  }
  y += 10;

  // Xulosa kataklari
  const boxes: [string, any][] = [
    ['Umumiy summa', c.totalAmount],
    ['Topshirilgan', c.paidAmount],
    ['Qoldiq', c.remainingAmount],
    ['Qarzdorlik', c.isClosed ? 0 : c.debtAmount],
  ];
  const bw = (R - L - 18) / 4;
  boxes.forEach(([label, v], i) => {
    const x = L + i * (bw + 6);
    doc.rect(x, y, bw, 44, { fill: 0.95, stroke: 0.8 });
    doc.text(x + 8, y + 15, label, { size: 8.5, gray: 0.4 });
    doc.text(x + 8, y + 33, `${money(v)} ${currency}`, { size: 10.5, bold: true });
  });
  y += 64;

  // Jadval
  const cols = [
    { title: 'No', w: 30, align: 'left' as const },
    { title: 'Sana', w: 75, align: 'left' as const },
    { title: 'Turi', w: 170, align: 'left' as const },
    { title: `Summa (${currency})`, w: 120, align: 'right' as const },
    { title: `Qoldiq (${currency})`, w: 120, align: 'right' as const },
  ];
  const rowH = 18;
  const bottomLimit = PAGE_H - 70;

  const drawHeader = () => {
    doc.rect(L, y, R - L, rowH + 2, { fill: 0.9 });
    let x = L;
    for (const col of cols) {
      const tx = col.align === 'right' ? x + col.w - 6 : x + 6;
      doc.text(tx, y + 13, col.title, { size: 9, bold: true, align: col.align });
      x += col.w;
    }
    y += rowH + 2;
  };
  drawHeader();

  let running = num(c.totalAmount);
  let total = 0;
  if (!txns.length) {
    doc.text(PAGE_W / 2, y + 14, "Topshirilgan narsa qayd etilmagan", { size: 10, align: 'center', gray: 0.45 });
    y += rowH + 4;
  }
  txns.forEach((t, i) => {
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = 50;
      drawHeader();
    }
    running -= num(t.amount);
    total += num(t.amount);
    if (i % 2 === 1) doc.rect(L, y, R - L, rowH, { fill: 0.97 });
    const cells = [String(i + 1), dmy(t.operationDate), KIND_LABEL[t.kind] || t.kind, money(t.amount), money(running)];
    let x = L;
    cols.forEach((col, ci) => {
      const tx = col.align === 'right' ? x + col.w - 6 : x + 6;
      doc.text(tx, y + 12.5, fitText(toPdfText(cells[ci]), col.w - 10, 9.5), { size: 9.5, align: col.align });
      x += col.w;
    });
    y += rowH;
    doc.line(L, y, R, y, 0.3, 0.85);
  });

  // Jami qatori
  if (y + rowH + 4 > bottomLimit) {
    doc.addPage();
    y = 50;
  }
  doc.rect(L, y, R - L, rowH + 2, { fill: 0.9 });
  doc.text(L + 6, y + 13, 'Jami topshirilgan', { size: 9.5, bold: true });
  const sumX = L + cols[0].w + cols[1].w + cols[2].w + cols[3].w - 6;
  doc.text(sumX, y + 13, money(total), { size: 9.5, bold: true, align: 'right' });
  doc.text(R - 6, y + 13, money(c.remainingAmount), { size: 9.5, bold: true, align: 'right' });
  y += rowH + 30;

  // Imzolar
  if (y + 90 > bottomLimit) {
    doc.addPage();
    y = 60;
  }
  const half = (R - L) / 2;
  doc.text(L, y, 'Kompaniya nomidan:', { size: 10, bold: true });
  doc.text(L + half + 10, y, 'Barterchi:', { size: 10, bold: true });
  y += 36;
  doc.line(L, y, L + half - 30, y, 0.5);
  doc.line(L + half + 10, y, R, y, 0.5);
  y += 13;
  doc.text(L, y, '(F.I.Sh., imzo)', { size: 8.5, gray: 0.45 });
  doc.text(L + half + 10, y, fitText(toPdfText(c.supplier.fullName), half - 10, 8.5), { size: 8.5, gray: 0.45 });

  doc.forEachPage((i, n) => {
    doc.line(L, PAGE_H - 45, R, PAGE_H - 45, 0.3, 0.8);
    doc.text(L, PAGE_H - 32, "Tizim ma'lumotlari asosida avtomatik tuzilgan.", { size: 8, gray: 0.5 });
    doc.text(R, PAGE_H - 32, `Sahifa ${i + 1} / ${n}`, { size: 8, align: 'right', gray: 0.5 });
  });
  return doc.toBuffer();
}

// ------------------------------------------------------------------ handlerlar

const pdfCooldown = new Map<string, number>();
const notFoundNotified = new Map<string, number>();

function contractButtons(contracts: any[]) {
  return {
    reply_markup: {
      inline_keyboard: contracts.slice(0, 40).map((c) => [
        {
          text: `${c.isClosed ? '✅' : '🟢'} № ${c.number} · ${c.tjm.name} · ${fmtShort(c.remainingAmount)}`.slice(0, 60),
          callback_data: `c:${c.id}`,
        },
      ]),
    },
  };
}

function contractActions(c: any) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: BTN_SVERKA, callback_data: `s:${c.id}` },
          { text: BTN_PDF, callback_data: `p:${c.id}` },
        ],
      ],
    },
  };
}

async function sendList(settings: any, chatId: string, contracts: any[]) {
  await sendMessage(
    settings.token,
    chatId,
    `Sizning shartnomalaringiz (${contracts.length} ta). Keraklisini tanlang yoki raqamini yozing:`,
    contractButtons(contracts),
  );
}

async function sendSummary(settings: any, chatId: string, c: any) {
  await sendMessage(settings.token, chatId, summaryText(c, settings.remindDueDay), contractActions(c));
}

async function sendSverka(settings: any, chatId: string, c: any) {
  await sendMessage(settings.token, chatId, sverkaText(c, await loadTxns(c.id)), contractActions(c));
}

async function sendPdf(settings: any, chatId: string, c: any) {
  const last = pdfCooldown.get(chatId) || 0;
  if (Date.now() - last < 15000) {
    await sendMessage(settings.token, chatId, '⏳ Bir oz kuting, akt tayyorlanmoqda…');
    return;
  }
  pdfCooldown.set(chatId, Date.now());
  const pdf = buildAktPdf(c, await loadTxns(c.id));
  const safe = String(c.number).replace(/[^\w-]+/g, '_');
  await sendDocument(
    settings.token,
    chatId,
    pdf,
    `Sverka_${safe}_${dmy(new Date()).replace(/\./g, '-')}.pdf`,
    `📄 Taqqoslash akti — shartnoma № ${esc(c.number)}`,
  );
}

/** Tanlangan shartnoma; bir nechta bo'lsa va tanlanmagan bo'lsa — ro'yxat yuboradi. */
async function pickContract(settings: any, chatId: string, link: any, contracts: any[]) {
  const sel = contracts.find((c) => c.id === link.selectedContractId);
  if (sel) return sel;
  if (contracts.length === 1) return contracts[0];
  await sendList(settings, chatId, contracts);
  return null;
}

async function onContact(settings: any, message: any) {
  const chatId = String(message.chat.id);
  const contact = message.contact;
  if (!contact?.user_id || contact.user_id !== message.from?.id) {
    await sendMessage(
      settings.token,
      chatId,
      "Iltimos, <b>o'zingizning</b> raqamingizni pastdagi tugma orqali yuboring.",
      CONTACT_KB,
    );
    return;
  }
  const phone = normalizePhone(contact.phone_number);
  const contracts = await contractsForPhone(phone);
  const tgName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ');
  const tgUsername = message.from?.username || '';

  if (!contracts.length) {
    await sendMessage(
      settings.token,
      chatId,
      `❌ ${phone} raqamiga bog'langan shartnoma topilmadi.\n\n` +
        'Shartnomada boshqa raqam ko‘rsatilgan bo‘lishi mumkin. Menejeringizga murojaat qiling — ' +
        'u raqamingizni tizimga qo‘shgach, qayta urinib ko‘ring.' +
        (settings.supportPhone ? `\n\n📞 ${esc(settings.supportPhone)}` : ''),
      CONTACT_KB,
    );
    const last = notFoundNotified.get(phone) || 0;
    if (Date.now() - last > 3600_000 && chatIdList(settings).length) {
      notFoundNotified.set(phone, Date.now());
      await broadcast(
        `👤 Barterchi botga ulanmoqchi bo'ldi, lekin raqami tizimda topilmadi:\n` +
          `📱 ${phone}\nTelegram: ${esc(tgName)}${tgUsername ? ` @${esc(tgUsername)}` : ''}`,
        settings,
      ).catch(() => {});
    }
    return;
  }

  await prisma.supplierChat.upsert({
    where: { chatId },
    create: {
      chatId,
      phone,
      tgName,
      tgUsername,
      selectedContractId: contracts.length === 1 ? contracts[0].id : null,
    },
    update: {
      phone,
      tgName,
      tgUsername,
      isActive: true,
      lastSeenAt: new Date(),
      selectedContractId: contracts.length === 1 ? contracts[0].id : null,
    },
  });

  const names = [...new Set(contracts.map((c) => c.supplier.fullName))].join(', ');
  await sendMessage(
    settings.token,
    chatId,
    `✅ Tasdiqlandi. Xush kelibsiz, <b>${esc(names)}</b>!\n\n` +
      'Endi pastdagi tugmalar orqali qoldiq, qarzdorlik va sverkani istalgan vaqtda ko‘rishingiz mumkin. ' +
      'Topshirish muddati yaqinlashganda bot sizga o‘zi eslatadi.',
    MAIN_KB,
  );
  if (contracts.length === 1) await sendSummary(settings, chatId, contracts[0]);
  else await sendList(settings, chatId, contracts);
}

const WELCOME =
  '👋 Assalomu alaykum! Bu <b>TXT Barter</b> boti.\n\n' +
  "Shartnomangiz bo'yicha qoldiq, qarzdorlik va sverkani ko'rish uchun telefon raqamingizni " +
  'tasdiqlang — pastdagi <b>«📱 Raqamni yuborish»</b> tugmasini bosing.\n\n' +
  "Raqam shartnomada ko'rsatilgan raqam bilan bir xil bo'lishi kerak.";

export async function handleSupplierMessage(settings: any, message: any) {
  const chatId = String(message.chat.id);
  if (message.contact) return onContact(settings, message);

  const text = String(message.text || '').trim();
  const link = await prisma.supplierChat.findUnique({ where: { chatId } });
  if (!link) {
    await sendMessage(settings.token, chatId, WELCOME, CONTACT_KB);
    return;
  }
  await prisma.supplierChat.update({ where: { chatId }, data: { lastSeenAt: new Date(), isActive: true } });

  if (text === '/chiqish') {
    await prisma.supplierChat.delete({ where: { chatId } });
    await sendMessage(settings.token, chatId, 'Ulanish bekor qilindi. Qayta ulanish uchun /start bosing.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  const contracts = await contractsForPhone(link.phone);
  if (!contracts.length) {
    await sendMessage(
      settings.token,
      chatId,
      "Raqamingizga bog'langan shartnoma endi topilmadi. Menejeringizga murojaat qiling yoki raqamni qayta yuboring.",
      CONTACT_KB,
    );
    return;
  }

  const cmd = text.split('@')[0].toLowerCase();
  if (cmd === '/start' || text === BTN_LIST || cmd === '/shartnomalar') {
    if (contracts.length === 1) {
      await sendMessage(settings.token, chatId, 'Asosiy menyu 👇', MAIN_KB);
      await sendSummary(settings, chatId, contracts[0]);
    } else {
      await sendMessage(settings.token, chatId, 'Asosiy menyu 👇', MAIN_KB);
      await sendList(settings, chatId, contracts);
    }
    return;
  }
  if (text === BTN_SUMMARY || cmd === '/qoldiq') {
    const c = await pickContract(settings, chatId, link, contracts);
    if (c) await sendSummary(settings, chatId, c);
    return;
  }
  if (text === BTN_SVERKA || cmd === '/sverka') {
    const c = await pickContract(settings, chatId, link, contracts);
    if (c) await sendSverka(settings, chatId, c);
    return;
  }
  if (text === BTN_PDF || cmd === '/akt') {
    const c = await pickContract(settings, chatId, link, contracts);
    if (c) await sendPdf(settings, chatId, c);
    return;
  }

  // Shartnoma raqami yozilgan bo'lsa — faqat o'z shartnomalari ichidan qidiriladi
  const key = normNumber(text.replace(/^№|^no\.?/i, ''));
  const found = key ? contracts.filter((c) => normNumber(c.number) === key) : [];
  if (found.length === 1) {
    await prisma.supplierChat.update({ where: { chatId }, data: { selectedContractId: found[0].id } });
    await sendSummary(settings, chatId, found[0]);
    return;
  }
  if (found.length > 1) {
    await sendList(settings, chatId, found);
    return;
  }
  await sendMessage(
    settings.token,
    chatId,
    'Tushunmadim 🙂 Pastdagi tugmalardan foydalaning yoki shartnoma raqamini yozing.\n' +
      "Sizning shartnomalaringiz ichida bunday raqam yo'q bo'lishi mumkin.",
    MAIN_KB,
  );
}

export async function handleSupplierCallback(settings: any, cq: any) {
  const chatId = String(cq.message?.chat?.id ?? '');
  const data = String(cq.data || '');
  await call(settings.token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
  if (!chatId) return;

  const link = await prisma.supplierChat.findUnique({ where: { chatId } });
  if (!link) {
    await sendMessage(settings.token, chatId, WELCOME, CONTACT_KB);
    return;
  }
  const m = /^([csp]):(\d+)$/.exec(data);
  if (!m) return;
  const contracts = await contractsForPhone(link.phone);
  const c = contracts.find((x) => x.id === Number(m[2]));
  if (!c) {
    await sendMessage(settings.token, chatId, 'Bu shartnoma sizga tegishli emas yoki topilmadi.');
    return;
  }
  await prisma.supplierChat.update({
    where: { chatId },
    data: { selectedContractId: c.id, lastSeenAt: new Date(), isActive: true },
  });
  if (m[1] === 'c') await sendSummary(settings, chatId, c);
  else if (m[1] === 's') await sendSverka(settings, chatId, c);
  else await sendPdf(settings, chatId, c);
}
