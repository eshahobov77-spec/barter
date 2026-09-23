import prisma from './db';
import { contractScope } from './permissions';
import { debtPaidAmount } from './services';
import {
  CLOSE_REASON,
  GROUP_LABELS,
  KIND_OPENING,
  NOTE_KIND,
  SUPPLY_STATUS,
  TX_KIND,
} from './constants';
import { dmy, dmyhm, fmtShort, fmtSom, num, phoneFmt, daysSince, isoDate } from './format';
import type { SessionUser } from './auth';

export type DetailHistoryItem = {
  type: 't' | 'n';
  id: number;
  kind: string;
  kindLabel: string;
  text: string;
  amountLabel?: string;
  isOpening?: boolean;
  operationDateLabel?: string;
  createdAtLabel: string;
  author: string;
  promiseLabel?: string;
  callId?: number | null;
};

export type ContractDetail = Awaited<ReturnType<typeof buildContractDetail>>;

/** Modal oynasi uchun shartnoma ma'lumotlari (barchasi tayyor matn holida). */
export async function buildContractDetail(user: SessionUser, contractId: number) {
  const c = await prisma.contract.findFirst({
    where: { id: contractId, ...contractScope(user) },
    include: {
      supplier: { include: { phones: { orderBy: { id: 'asc' } } } },
      tjm: true,
      closedBy: true,
      transactions: { include: { createdBy: true }, orderBy: { createdAt: 'desc' } },
      notes: { include: { createdBy: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!c) return null;

  const name = (u: any) => (u ? u.fullName || u.username : '—');

  const history: DetailHistoryItem[] = [
    ...c.transactions.map((t) => ({
      type: 't' as const,
      id: t.id,
      kind: t.kind,
      kindLabel: TX_KIND[t.kind] || t.kind,
      text: t.note || '',
      amountLabel: fmtSom(t.amount),
      isOpening: t.kind === KIND_OPENING,
      operationDateLabel: dmy(t.operationDate),
      createdAtLabel: dmyhm(t.createdAt),
      author: name(t.createdBy),
      _sort: t.createdAt.getTime(),
    })),
    ...c.notes.map((n) => ({
      type: 'n' as const,
      id: n.id,
      kind: n.kind,
      kindLabel: NOTE_KIND[n.kind] || n.kind,
      text: n.text || '',
      createdAtLabel: dmyhm(n.createdAt),
      author: n.callId && !n.createdBy ? 'AI (qo‘ng‘iroq)' : name(n.createdBy),
      promiseLabel: n.promiseDate
        ? `${dmy(n.promiseDate)}${n.promiseWhat ? ' · ' + n.promiseWhat : ''}${num(n.promiseAmount) ? ' · ≈ ' + fmtSom(n.promiseAmount) + " so'm" : ''}`
        : '',
      callId: n.callId,
      _sort: n.createdAt.getTime(),
    })),
  ]
    .sort((a: any, b: any) => b._sort - a._sort)
    .map(({ _sort, ...rest }: any) => rest);

  const realSum = c.transactions
    .filter((t) => t.kind !== KIND_OPENING)
    .reduce((s, t) => s + num(t.amount), 0);

  const otherContractsRaw = await prisma.contract.findMany({
    where: { supplierId: c.supplierId, id: { not: c.id }, ...contractScope(user) },
    include: { tjm: true },
    orderBy: { remainingAmount: 'desc' },
    take: 12,
  });

  const total = num(c.totalAmount);
  const paid = num(c.paidAmount);
  const remaining = num(c.remainingAmount);
  const debt = num(c.debtAmount);

  return {
    id: c.id,
    number: c.number,
    supplierName: c.supplier.fullName,
    tjmName: c.tjm.name,
    materialType: c.materialType,
    materialGroupLabel: GROUP_LABELS[c.materialGroup] || c.materialGroup,
    supplyStatus: c.supplyStatus,
    supplyStatusLabel: SUPPLY_STATUS[c.supplyStatus] || '',
    isClosed: c.isClosed,
    closeReason: c.closeReason,
    closeReasonLabel: CLOSE_REASON[c.closeReason] || '',
    closeNote: c.closeNote,
    closedAtLabel: c.closedAt ? dmyhm(c.closedAt) : '',
    closedByName: c.closedBy ? name(c.closedBy) : '',

    phones: c.supplier.phones.map((p) => ({ raw: p.phone, pretty: phoneFmt(p.phone) })),

    totalLabel: fmtSom(total),
    paidLabel: fmtSom(paid),
    remainingLabel: fmtSom(remaining),
    debtLabel: fmtSom(debt),
    monthlyLabel: num(c.monthlyAmount) ? fmtSom(c.monthlyAmount) : '',
    remaining,
    debt,
    paidPercent: total ? Math.max(0, Math.min(100, Math.trunc((paid * 100) / total))) : 0,
    debtSetAtLabel: c.debtSetAt ? dmy(c.debtSetAt) : '',
    debtPaidLabel: (() => {
      const v = debtPaidAmount(c, c.transactions);
      return v ? fmtSom(v) : '';
    })(),
    contractDateLabel: c.contractDate ? dmy(c.contractDate) : '',
    lastPaymentLabel: c.lastPaymentAt ? dmy(c.lastPaymentAt) : '',
    daysSincePayment: daysSince(c.lastPaymentAt),
    realSumLabel: fmtSom(realSum),

    history,
    txCount: c.transactions.length,
    otherContracts: otherContractsRaw.map((o) => ({
      id: o.id,
      tjmName: o.tjm.name,
      number: o.number,
      remainingShort: fmtShort(o.remainingAmount),
    })),

    today: isoDate(new Date()),
    isAdmin: user.isAdmin,
  };
}
