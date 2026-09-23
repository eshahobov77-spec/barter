/** Dashboard, trend va oylik hisobot uchun hisob-kitoblar (Django selectors.py). */
import prisma from './db';
import { contractScope, transactionScope, visibleTjms } from './permissions';
import { num, pctChange, monthLabel, monthKey } from './format';
import { addMonths, monthStart, toDateOnly } from './dates';
import { CALL_KINDS, KIND_OPENING, MONTHS_UZ } from './constants';
import type { SessionUser } from './auth';

export async function dashboardKpis(user: SessionUser) {
  const rows = await prisma.contract.findMany({
    where: contractScope(user),
    select: {
      totalAmount: true,
      paidAmount: true,
      remainingAmount: true,
      debtAmount: true,
      isClosed: true,
    },
  });
  let total = 0,
    paid = 0,
    remaining = 0,
    debt = 0,
    debtors = 0,
    closedCount = 0,
    closedSum = 0,
    active = 0;
  for (const r of rows) {
    total += num(r.totalAmount);
    paid += num(r.paidAmount);
    if (r.isClosed) {
      closedCount += 1;
      closedSum += num(r.totalAmount);
    } else {
      active += 1;
      remaining += num(r.remainingAmount);
      debt += num(r.debtAmount);
      if (num(r.debtAmount) > 0) debtors += 1;
    }
  }
  return {
    total,
    paid,
    remaining,
    debt,
    debtors,
    closedCount,
    closedSum,
    active,
    count: active + closedCount,
    paidPct: total ? Math.trunc((paid * 100) / total) : 0,
    debtPct: remaining ? Math.trunc((debt * 100) / remaining) : 0,
  };
}

export async function tjmSummary(user: SessionUser) {
  const tjms = await visibleTjms(user);
  const contracts = await prisma.contract.findMany({
    where: { ...contractScope(user), isClosed: false },
    select: { tjmId: true, remainingAmount: true, debtAmount: true },
  });
  const agg = new Map<number, { activeCount: number; remaining: number; debt: number; debtors: number }>();
  for (const c of contracts) {
    const cur = agg.get(c.tjmId) || { activeCount: 0, remaining: 0, debt: 0, debtors: 0 };
    cur.activeCount += 1;
    cur.remaining += num(c.remainingAmount);
    cur.debt += num(c.debtAmount);
    if (num(c.debtAmount) > 0) cur.debtors += 1;
    agg.set(c.tjmId, cur);
  }
  const rows = tjms.map((t) => {
    const a = agg.get(t.id) || { activeCount: 0, remaining: 0, debt: 0, debtors: 0 };
    return { id: t.id, name: t.name, ...a, bar: 0 };
  });
  rows.sort((a, b) => b.debt - a.debt || b.remaining - a.remaining || a.name.localeCompare(b.name));
  const top = Math.max(...rows.map((r) => r.debt), 0) || 1;
  for (const r of rows) r.bar = Math.trunc((r.debt * 100) / top);
  return rows;
}

export async function topDebtors(user: SessionUser, limit = 10) {
  return prisma.contract.findMany({
    where: { ...contractScope(user), isClosed: false, debtAmount: { gt: 0 } },
    include: { supplier: true, tjm: true },
    orderBy: { debtAmount: 'desc' },
    take: limit,
  });
}

export async function recentActivity(user: SessionUser, limit = 15) {
  return prisma.transaction.findMany({
    where: { ...transactionScope(user), kind: { not: KIND_OPENING } },
    include: {
      contract: { include: { supplier: true, tjm: true } },
      createdBy: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export type TrendRow = {
  key: string;
  short: string;
  label: string;
  paySum: number;
  payCount: number;
  closedCount: number;
  closedSum: number;
  newCount: number;
  newSum: number;
  calls: number;
};

export async function monthlyTrend(user: SessionUser, months = 12): Promise<TrendRow[]> {
  const now = new Date();
  const first = addMonths(now.getFullYear(), now.getMonth() + 1, -(months - 1));
  const start = monthStart(first.year, first.month);

  const [pays, contracts, notes] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        ...transactionScope(user),
        kind: { not: KIND_OPENING },
        operationDate: { gte: toDateOnly(start) },
      },
      select: { amount: true, operationDate: true },
    }),
    prisma.contract.findMany({
      where: contractScope(user),
      select: { totalAmount: true, closedAt: true, contractDate: true },
    }),
    prisma.note.findMany({
      where: { ...transactionScope(user), kind: { in: CALL_KINDS }, createdAt: { gte: start } },
      select: { createdAt: true },
    }),
  ]);

  const buckets = new Map<string, TrendRow>();
  const result: TrendRow[] = [];
  for (let i = 0; i < months; i++) {
    const { year, month } = addMonths(first.year, first.month, i);
    const row: TrendRow = {
      key: monthKey(year, month),
      short: `${String(month).padStart(2, '0')}/${String(year).slice(2)}`,
      label: monthLabel(year, month),
      paySum: 0,
      payCount: 0,
      closedCount: 0,
      closedSum: 0,
      newCount: 0,
      newSum: 0,
      calls: 0,
    };
    buckets.set(row.key, row);
    result.push(row);
  }

  const keyOfDateOnly = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

  for (const p of pays) {
    const row = buckets.get(keyOfDateOnly(p.operationDate));
    if (row) {
      row.paySum += num(p.amount);
      row.payCount += 1;
    }
  }
  for (const c of contracts) {
    if (c.closedAt && c.closedAt >= start) {
      const row = buckets.get(keyOf(c.closedAt));
      if (row) {
        row.closedCount += 1;
        row.closedSum += num(c.totalAmount);
      }
    }
    if (c.contractDate && c.contractDate >= start) {
      const row = buckets.get(keyOf(c.contractDate));
      if (row) {
        row.newCount += 1;
        row.newSum += num(c.totalAmount);
      }
    }
  }
  for (const n of notes) {
    const row = buckets.get(keyOf(n.createdAt));
    if (row) row.calls += 1;
  }
  return result;
}

async function periodStats(user: SessionUser, start: Date, end: Date) {
  const [pays, contracts, calls] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        ...transactionScope(user),
        kind: { not: KIND_OPENING },
        operationDate: { gte: toDateOnly(start), lt: toDateOnly(end) },
      },
      select: { amount: true },
    }),
    prisma.contract.findMany({
      where: {
        ...contractScope(user),
        OR: [
          { closedAt: { gte: start, lt: end } },
          { contractDate: { gte: start, lt: end } },
        ],
      },
      select: { totalAmount: true, closedAt: true, contractDate: true },
    }),
    prisma.note.count({
      where: { ...transactionScope(user), kind: { in: CALL_KINDS }, createdAt: { gte: start, lt: end } },
    }),
  ]);
  let closedSum = 0,
    closedCount = 0,
    newSum = 0,
    newCount = 0;
  for (const c of contracts) {
    if (c.closedAt && c.closedAt >= start && c.closedAt < end) {
      closedCount += 1;
      closedSum += num(c.totalAmount);
    }
    if (c.contractDate && c.contractDate >= start && c.contractDate < end) {
      newCount += 1;
      newSum += num(c.totalAmount);
    }
  }
  return {
    paySum: pays.reduce((s, p) => s + num(p.amount), 0),
    payCount: pays.length,
    closedSum,
    closedCount,
    newSum,
    newCount,
    calls,
  };
}

export async function monthlyReport(user: SessionUser, year: number, month: number) {
  const start = monthStart(year, month);
  const nextM = addMonths(year, month, 1);
  const end = monthStart(nextM.year, nextM.month);
  const prevM = addMonths(year, month, -1);
  const prevStart = monthStart(prevM.year, prevM.month);

  const [cur, prev, tjms, allContracts, monthPays] = await Promise.all([
    periodStats(user, start, end),
    periodStats(user, prevStart, start),
    visibleTjms(user),
    prisma.contract.findMany({
      where: contractScope(user),
      select: {
        tjmId: true,
        isClosed: true,
        remainingAmount: true,
        debtAmount: true,
        totalAmount: true,
        closedAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        ...transactionScope(user),
        kind: { not: KIND_OPENING },
        operationDate: { gte: toDateOnly(start), lt: toDateOnly(end) },
      },
      select: { amount: true, contract: { select: { tjmId: true } } },
    }),
  ]);

  const changes: Record<string, number | null> = {};
  for (const k of Object.keys(cur)) changes[k] = pctChange((cur as any)[k], (prev as any)[k]);

  const base = new Map<number, any>();
  let stateActive = 0,
    stateRemaining = 0,
    stateDebt = 0,
    stateDebtors = 0;
  for (const c of allContracts) {
    const b = base.get(c.tjmId) || {
      active: 0,
      remaining: 0,
      debt: 0,
      debtors: 0,
      closedCount: 0,
      closedSum: 0,
      paySum: 0,
      payCount: 0,
    };
    if (!c.isClosed) {
      b.active += 1;
      b.remaining += num(c.remainingAmount);
      b.debt += num(c.debtAmount);
      if (num(c.debtAmount) > 0) b.debtors += 1;
      stateActive += 1;
      stateRemaining += num(c.remainingAmount);
      stateDebt += num(c.debtAmount);
      if (num(c.debtAmount) > 0) stateDebtors += 1;
    }
    if (c.closedAt && c.closedAt >= start && c.closedAt < end) {
      b.closedCount += 1;
      b.closedSum += num(c.totalAmount);
    }
    base.set(c.tjmId, b);
  }
  for (const p of monthPays) {
    const b = base.get(p.contract.tjmId) || {
      active: 0,
      remaining: 0,
      debt: 0,
      debtors: 0,
      closedCount: 0,
      closedSum: 0,
      paySum: 0,
      payCount: 0,
    };
    b.paySum += num(p.amount);
    b.payCount += 1;
    base.set(p.contract.tjmId, b);
  }

  const rows = tjms.map((t) => {
    const b = base.get(t.id) || {};
    return {
      tjmId: t.id,
      tjmName: t.name,
      active: b.active || 0,
      remaining: b.remaining || 0,
      debt: b.debt || 0,
      debtors: b.debtors || 0,
      paySum: b.paySum || 0,
      payCount: b.payCount || 0,
      closedCount: b.closedCount || 0,
      closedSum: b.closedSum || 0,
    };
  });
  rows.sort((a, b) => b.debt - a.debt || b.remaining - a.remaining || a.tjmName.localeCompare(b.tjmName));

  const totals = {
    active: rows.reduce((s, r) => s + r.active, 0),
    remaining: rows.reduce((s, r) => s + r.remaining, 0),
    debt: rows.reduce((s, r) => s + r.debt, 0),
    debtors: rows.reduce((s, r) => s + r.debtors, 0),
    paySum: rows.reduce((s, r) => s + r.paySum, 0),
    payCount: rows.reduce((s, r) => s + r.payCount, 0),
    closedCount: rows.reduce((s, r) => s + r.closedCount, 0),
    closedSum: rows.reduce((s, r) => s + r.closedSum, 0),
    debtPct: 0,
  };
  totals.debtPct = totals.remaining ? Math.trunc((totals.debt * 100) / totals.remaining) : 0;

  return {
    year,
    month,
    label: `${MONTHS_UZ[month]} ${year}`,
    key: monthKey(year, month),
    cur,
    prev,
    changes,
    active: stateActive,
    remaining: stateRemaining,
    debt: stateDebt,
    debtors: stateDebtors,
    rows,
    totals,
  };
}
