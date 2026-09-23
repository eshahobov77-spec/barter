import { contractScope, transactionScope } from './permissions';
import { searchKey } from './cleaning';
import { parseIsoDate, parseMonth, monthStart, addMonths, toDateOnly } from './dates';
import { KIND_OPENING } from './constants';
import type { SessionUser } from './auth';

export const CONTRACT_SORTS: Record<string, any> = {
  '-remaining_amount': { remainingAmount: 'desc' },
  remaining_amount: { remainingAmount: 'asc' },
  '-total_amount': { totalAmount: 'desc' },
  '-debt_amount': { debtAmount: 'desc' },
  '-contract_date': { contractDate: 'desc' },
  contract_date: { contractDate: 'asc' },
  '-last_payment_at': { lastPaymentAt: 'desc' },
  last_payment_at: { lastPaymentAt: 'asc' },
  supplier__full_name: { supplier: { fullName: 'asc' } },
};

/** Barterlar ro'yxati uchun Prisma `where` (Django _filtered_contracts ekvivalenti). */
export function contractWhere(user: SessionUser, f: Record<string, string>): any {
  const and: any[] = [contractScope(user)];

  const q = (f.q || '').trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    const sk = searchKey(q);
    const or: any[] = [{ number: { contains: q.toUpperCase(), mode: 'insensitive' } }];
    if (sk) or.push({ supplier: { searchKey: { contains: sk, mode: 'insensitive' } } });
    if (digits.length >= 4) or.push({ supplier: { phones: { some: { phone: { contains: digits } } } } });
    and.push({ OR: or });
  }
  if (f.tjm && Number(f.tjm)) and.push({ tjmId: Number(f.tjm) });

  const holat = f.holat || '';
  if (holat === 'none') and.push({ supplyStatus: '' });
  else if (holat) and.push({ supplyStatus: holat });

  if (f.guruh) and.push({ materialGroup: f.guruh });
  if (f.material) and.push({ materialType: f.material });

  if (f.qarz === 'bor') and.push({ debtAmount: { gt: 0 } });
  else if (f.qarz === 'yoq') and.push({ debtAmount: { lte: 0 } });

  if (f.tushum === '30') {
    const limit = new Date(Date.now() - 30 * 86400000);
    and.push({ OR: [{ lastPaymentAt: { lt: limit } }, { lastPaymentAt: null }] });
  } else if (f.tushum === 'hech') {
    and.push({ lastPaymentAt: null });
  }

  if (f.yopilgan === 'faqat') and.push({ isClosed: true });
  else if (f.yopilgan !== '1') and.push({ isClosed: false });

  return { AND: and };
}

export function contractOrder(sort: string): any[] {
  return [CONTRACT_SORTS[sort] || CONTRACT_SORTS['-remaining_amount'], { id: 'asc' }];
}

/** To'lovlar ro'yxati uchun Prisma `where` (Django _filtered_payments ekvivalenti). */
export function paymentWhere(user: SessionUser, f: Record<string, string>): any {
  const and: any[] = [transactionScope(user), { kind: { not: KIND_OPENING } }];

  const month = parseMonth(f.oy || '');
  if (month) {
    const start = monthStart(month.year, month.month);
    const nextM = addMonths(month.year, month.month, 1);
    const end = monthStart(nextM.year, nextM.month);
    and.push({ operationDate: { gte: toDateOnly(start), lt: toDateOnly(end) } });
  }
  const day = parseIsoDate(f.sana || '');
  if (day) and.push({ operationDate: toDateOnly(day) });

  const q = (f.q || '').trim();
  if (q) {
    const sk = searchKey(q);
    const or: any[] = [{ contract: { number: { contains: q.toUpperCase(), mode: 'insensitive' } } }];
    if (sk) or.push({ contract: { supplier: { searchKey: { contains: sk, mode: 'insensitive' } } } });
    and.push({ OR: or });
  }
  if (f.tjm && Number(f.tjm)) and.push({ contract: { tjmId: Number(f.tjm) } });
  if (f.turi) and.push({ kind: f.turi });
  if (f.operator && Number(f.operator)) and.push({ createdById: Number(f.operator) });

  return { AND: and };
}

/** searchParams -> oddiy obyekt */
export function flatParams(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const f: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) f[k] = Array.isArray(v) ? v[0] || '' : v || '';
  return f;
}
