import Link from 'next/link';
import { PhoneIncoming, PhoneOutgoing, Phone } from 'lucide-react';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { dmy, dmyhm, phoneFmt } from '@/lib/format';
import { PAGE_SIZE } from '@/lib/constants';
import Pagination from '@/components/Pagination';
import { CALL_STATUS, dur } from './shared';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Qo'ng'iroqlar" };

export default async function CallsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: any = {};
  if (!user.isAdmin) where.contract = { tjmId: { in: user.tjmIds.length ? user.tjmIds : [-1] } };
  if (sp.holat && CALL_STATUS[sp.holat]) where.status = sp.holat;
  if (sp.bog === 'yoq') where.contractId = null;
  if (sp.vada === 'bor') where.promiseDate = { not: null };
  if (sp.q) {
    const d = sp.q.replace(/\D/g, '');
    where.OR = [
      { summary: { contains: sp.q, mode: 'insensitive' } },
      { transcript: { contains: sp.q, mode: 'insensitive' } },
      ...(d.length >= 4 ? [{ clientPhone: { contains: d } }, { fromPhone: { contains: d } }, { toPhone: { contains: d } }] : []),
    ];
  }
  const [count, rows] = await Promise.all([
    prisma.callRecord.count({ where }),
    prisma.callRecord.findMany({
      where,
      include: { contract: { include: { supplier: true, tjm: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Qo&apos;ng&apos;iroqlar</h1>
          <p>IP-telefoniyadan kelgan suhbatlar: matn, AI xulosasi va va&apos;dalar · {count} ta</p>
        </div>
        {user.isAdmin && (
          <div className="actions">
            <Link className="btn btn-ghost" href="/telefoniya">Sozlamalar</Link>
          </div>
        )}
      </div>

      <form className="panel filters" method="get">
        <input type="search" name="q" defaultValue={sp.q || ''} placeholder="Telefon yoki matn bo'yicha" className="span-2" />
        <select name="holat" defaultValue={sp.holat || ''} aria-label="Holat">
          <option value="">Barcha holatlar</option>
          {Object.entries(CALL_STATUS).map(([k, [l]]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select name="bog" defaultValue={sp.bog || ''} aria-label="Shartnoma">
          <option value="">Shartnoma: hammasi</option>
          <option value="yoq">Shartnomaga bog&apos;lanmagan</option>
        </select>
        <select name="vada" defaultValue={sp.vada || ''} aria-label="Va'da">
          <option value="">Va&apos;da: hammasi</option>
          <option value="bor">Va&apos;da berilgan</option>
        </select>
        <button className="btn btn-primary" type="submit">Ko&apos;rsatish</button>
      </form>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Barterchi</th>
                <th>Xulosa</th>
                <th className="num">Davomiylik</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">Qo&apos;ng&apos;iroq topilmadi</td>
                </tr>
              )}
              {rows.map((c) => {
                const [label, cls] = CALL_STATUS[c.status] || [c.status, 'plain'];
                const Icon = c.direction === 'in' ? PhoneIncoming : c.direction === 'out' ? PhoneOutgoing : Phone;
                return (
                  <tr key={c.id}>
                    <td className="nowrap">
                      <Link href={`/qongiroqlar/${c.id}`} className="link">
                        <Icon className="lucide" style={{ width: 14, height: 14, verticalAlign: -2 }} /> {dmyhm(c.startedAt || c.createdAt)}
                      </Link>
                      <br />
                      <small className="muted">{phoneFmt(c.clientPhone || (c.direction === 'out' ? c.toPhone : c.fromPhone))}</small>
                    </td>
                    <td>
                      {c.contract ? (
                        <>
                          <b>{c.contract.supplier.fullName}</b>
                          <br />
                          <small className="muted">№ {c.contract.number} · {c.contract.tjm.name}</small>
                        </>
                      ) : (
                        <span className="badge warn">Bog&apos;lanmagan</span>
                      )}
                    </td>
                    <td style={{ maxWidth: 480 }}>
                      {c.summary || <span className="faint">{c.error || '—'}</span>}
                      {c.promiseDate && (
                        <div>
                          <span className="badge accent">🤝 {dmy(c.promiseDate)}{c.promiseWhat ? ` · ${c.promiseWhat}` : ''}</span>
                        </div>
                      )}
                    </td>
                    <td className="num">{dur(c.durationSec)}</td>
                    <td>
                      <span className={`badge ${cls}`}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination basePath="/qongiroqlar" params={Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === 'string')) as Record<string, string>} page={page} pageSize={PAGE_SIZE} count={count} />
      </section>
    </>
  );
}
