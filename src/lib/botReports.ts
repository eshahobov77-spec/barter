/** Telegramga yuboriladigan hisobot matnlari (Django telegram_bot/reports.py). */
import prisma from './db';
import { fmtShort, fmtSom, num, dmy } from './format';
import { KIND_OPENING, TX_KIND, CLOSE_REASON } from './constants';
import { dayStart, nextDay, toDateOnly } from './dates';

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function debtTotals() {
  const rows = await prisma.contract.findMany({
    where: { isClosed: false },
    select: { remainingAmount: true, debtAmount: true },
  });
  return {
    count: rows.length,
    remaining: rows.reduce((s, r) => s + num(r.remainingAmount), 0),
    debt: rows.reduce((s, r) => s + num(r.debtAmount), 0),
    debtors: rows.filter((r) => num(r.debtAmount) > 0).length,
  };
}

async function periodBlock(start: Date, end: Date): Promise<string[]> {
  const pays = await prisma.transaction.findMany({
    where: {
      kind: { not: KIND_OPENING },
      operationDate: { gte: toDateOnly(start), lte: toDateOnly(end) },
    },
    select: { amount: true, kind: true, contract: { select: { tjm: { select: { name: true } } } } },
  });
  const paySum = pays.reduce((s, p) => s + num(p.amount), 0);

  const byKind = new Map<string, number>();
  const byTjm = new Map<string, { s: number; c: number }>();
  for (const p of pays) {
    byKind.set(p.kind, (byKind.get(p.kind) || 0) + num(p.amount));
    const name = p.contract.tjm.name;
    const cur = byTjm.get(name) || { s: 0, c: 0 };
    cur.s += num(p.amount);
    cur.c += 1;
    byTjm.set(name, cur);
  }

  const endNext = nextDay(end);
  const closed = await prisma.contract.findMany({
    where: { closedAt: { gte: dayStart(start), lt: endNext } },
    select: { totalAmount: true },
  });
  const created = await prisma.contract.findMany({
    where: { contractDate: { gte: dayStart(start), lt: endNext } },
    select: { totalAmount: true },
  });

  const lines = [`💵 Tushumlar: <b>${pays.length}</b> ta — <b>${fmtSom(paySum)} so'm</b>`];
  for (const [kind, sum] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`   • ${esc(TX_KIND[kind] || kind)}: ${fmtShort(sum)}`);
  }
  lines.push(
    `✅ Yopilgan shartnomalar: <b>${closed.length}</b> ta (${fmtShort(
      closed.reduce((s, c) => s + num(c.totalAmount), 0),
    )})`,
  );
  lines.push(
    `🆕 Yangi shartnomalar: <b>${created.length}</b> ta (${fmtShort(
      created.reduce((s, c) => s + num(c.totalAmount), 0),
    )})`,
  );
  const topTjm = [...byTjm.entries()].sort((a, b) => b[1].s - a[1].s).slice(0, 10);
  if (topTjm.length) {
    lines.push('');
    lines.push('🏗 <b>TJM bo\'yicha tushum</b>');
    topTjm.forEach(([name, v], i) => {
      lines.push(`${i + 1}. ${esc(name)} — ${fmtShort(v.s)} (${v.c} ta)`);
    });
  }
  return lines;
}

export async function dailyReport(day?: Date): Promise<string> {
  const d = day || new Date();
  const debt = await debtTotals();
  const lines = [`📊 <b>TXT Barter — kunlik hisobot — ${dmy(d)}</b>`, ''];
  lines.push(...(await periodBlock(d, d)));
  lines.push(
    '',
    `📌 Aktiv shartnomalar: <b>${debt.count}</b> ta`,
    `💰 Qoldiq summa: <b>${fmtShort(debt.remaining)}</b>`,
    `🔴 Qarzdorlik (grafik bo'yicha): <b>${fmtShort(debt.debt)}</b> — ${debt.debtors} ta qarzdor`,
  );
  return lines.join('\n');
}

export async function weeklyReport(end?: Date): Promise<string> {
  const e = end || new Date();
  const start = new Date(e.getFullYear(), e.getMonth(), e.getDate() - 6);
  const debt = await debtTotals();
  const lines = [`📈 <b>TXT Barter — haftalik hisobot</b>\n${dmy(start)} — ${dmy(e)}`, ''];
  lines.push(...(await periodBlock(start, e)));

  const top = await prisma.contract.findMany({
    where: { isClosed: false, debtAmount: { gt: 0 } },
    include: { supplier: true, tjm: true },
    orderBy: { debtAmount: 'desc' },
    take: 10,
  });
  lines.push('', "🔴 <b>Eng katta qarzdorlar (grafik bo'yicha)</b>");
  top.forEach((c, i) => {
    lines.push(
      `${i + 1}. ${esc(c.supplier.fullName)} (${esc(c.tjm.name)}, ${esc(c.number)}) — ${fmtShort(c.debtAmount)}`,
    );
  });
  lines.push(
    '',
    `📌 Aktiv shartnomalar: <b>${debt.count}</b> ta`,
    `💰 Qoldiq summa: <b>${fmtShort(debt.remaining)}</b>`,
    `🔴 Qarzdorlik: <b>${fmtShort(debt.debt)}</b> — ${debt.debtors} ta qarzdor`,
  );
  return lines.join('\n');
}

export async function debtReport(tjmQuery = ''): Promise<string> {
  const contracts = await prisma.contract.findMany({
    where: {
      isClosed: false,
      ...(tjmQuery ? { tjm: { name: { contains: tjmQuery, mode: 'insensitive' } } } : {}),
    },
    select: { remainingAmount: true, debtAmount: true, tjm: { select: { name: true } } },
  });
  if (!contracts.length) return `«${esc(tjmQuery)}» bo'yicha aktiv shartnoma topilmadi.`;

  const byTjm = new Map<string, { c: number; s: number; debt: number; debtors: number }>();
  for (const c of contracts) {
    const name = c.tjm.name;
    const cur = byTjm.get(name) || { c: 0, s: 0, debt: 0, debtors: 0 };
    cur.c += 1;
    cur.s += num(c.remainingAmount);
    cur.debt += num(c.debtAmount);
    if (num(c.debtAmount) > 0) cur.debtors += 1;
    byTjm.set(name, cur);
  }
  const rows = [...byTjm.entries()].sort((a, b) => b[1].debt - a[1].debt || b[1].s - a[1].s);
  const totalRem = rows.reduce((s, r) => s + r[1].s, 0);
  const totalDebt = rows.reduce((s, r) => s + r[1].debt, 0);

  const lines = ["🏗 <b>TJM bo'yicha qarzdorlik</b>", ''];
  rows.forEach(([name, r], i) => {
    lines.push(
      `${i + 1}. ${esc(name)} — qarzdorlik <b>${fmtShort(r.debt)}</b> (${r.debtors} ta), qoldiq ${fmtShort(r.s)}`,
    );
  });
  lines.push('', `Jami qarzdorlik: <b>${fmtShort(totalDebt)}</b>`, `Jami qoldiq summa: <b>${fmtShort(totalRem)}</b>`);
  return lines.join('\n');
}

export async function paymentMessage(txnId: number): Promise<string | null> {
  const t = await prisma.transaction.findUnique({
    where: { id: txnId },
    include: { contract: { include: { supplier: true, tjm: true } }, createdBy: true },
  });
  if (!t) return null;
  const c = t.contract;
  const who = t.createdBy ? t.createdBy.fullName || t.createdBy.username : '—';
  return (
    `💵 <b>Yangi tushum</b>\n` +
    `${esc(c.supplier.fullName)}\n` +
    `🏗 ${esc(c.tjm.name)} · ${esc(c.number)}\n` +
    `Summa: <b>${fmtSom(t.amount)} so'm</b> (${esc(TX_KIND[t.kind] || t.kind)})\n` +
    `Qoldiq: ${fmtSom(c.remainingAmount)} so'm` +
    (num(c.debtAmount) ? ` · qarzdorlik: ${fmtSom(c.debtAmount)} so'm` : '') +
    `\n👤 ${esc(who)}` +
    (t.note ? `\n📝 ${esc(t.note)}` : '')
  );
}

export async function newContractMessage(contractId: number): Promise<string | null> {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { supplier: { include: { phones: true } }, tjm: true, createdBy: true },
  });
  if (!c) return null;
  const who = c.createdBy ? c.createdBy.fullName || c.createdBy.username : '—';
  const lines = [
    '🆕 <b>Yangi barter shartnomasi</b>',
    esc(c.supplier.fullName),
    `🏗 ${esc(c.tjm.name)} · ${esc(c.number)}`,
    `Umumiy summa: <b>${fmtSom(c.totalAmount)} so'm</b>`,
  ];
  if (c.materialType) lines.push(`Hom ashyo: ${esc(c.materialType)}`);
  if (num(c.paidAmount)) lines.push(`Berilgan chek: ${fmtSom(c.paidAmount)} so'm`);
  lines.push(`Qoldiq: ${fmtSom(c.remainingAmount)} so'm`);
  if (num(c.debtAmount)) lines.push(`Qarzdorlik: ${fmtSom(c.debtAmount)} so'm`);
  if (c.supplier.phones.length) lines.push('📞 ' + c.supplier.phones.map((p) => esc(p.phone)).join(', '));
  lines.push(`👤 ${esc(who)}`);
  return lines.join('\n');
}

export async function closedMessage(contractId: number): Promise<string | null> {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { supplier: true, tjm: true, closedBy: true },
  });
  if (!c || !c.isClosed) return null;
  const who = c.closedBy ? c.closedBy.fullName || c.closedBy.username : '—';
  return (
    `✅ <b>Shartnoma yopildi</b>\n` +
    `${esc(c.supplier.fullName)}\n` +
    `🏗 ${esc(c.tjm.name)} · ${esc(c.number)}\n` +
    `Umumiy summa: ${fmtSom(c.totalAmount)} so'm\n` +
    `Sabab: ${esc(CLOSE_REASON[c.closeReason] || c.closeReason)}\n` +
    `👤 ${esc(who)}`
  );
}

export const HELP_TEXT =
  '🤖 <b>TXT Barter — hisobot boti</b>\n\n' +
  '/bugun — bugungi hisobot\n' +
  '/kecha — kechagi hisobot\n' +
  '/hafta — oxirgi 7 kun\n' +
  '/qarz — TJM bo\'yicha qoldiq qarz\n' +
  '/qarz Crystal — bitta TJM bo\'yicha';
