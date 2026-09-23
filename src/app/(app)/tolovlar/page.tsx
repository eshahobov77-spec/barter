import { FileSpreadsheet, Receipt, Banknote, Trash2 } from 'lucide-react';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { transactionScope, visibleTjms } from '@/lib/permissions';
import { flatParams, paymentWhere } from '@/lib/contractFilters';
import { monthlyTrend } from '@/lib/selectors';
import { PAGE_SIZE, TX_KIND, TX_KIND_CHOICES } from '@/lib/constants';
import { dmhm, dmy, fmtShort, fmtSom, initial, num } from '@/lib/format';
import FilterForm from '@/components/FilterForm';
import Pagination from '@/components/Pagination';
import { ContractRow } from '@/components/OpenContract';
import ConfirmForm, { SubmitButton } from '@/components/ConfirmForm';
import { deletePaymentAction } from '@/actions/contract';

export const dynamic = 'force-dynamic';
export const metadata = { title: "To'lovlar" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const f = flatParams(await searchParams);
  const page = Math.max(1, Number(f.page) || 1);
  const where = paymentWhere(user, f);

  const [count, rows, sumRows, months, tjms, operators] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: {
        contract: { include: { supplier: true, tjm: true } },
        createdBy: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.transaction.findMany({ where, select: { amount: true } }),
    monthlyTrend(user, 12),
    visibleTjms(user),
    prisma.user.findMany({
      where: { transactions: { some: transactionScope(user) } },
      orderBy: [{ fullName: 'asc' }, { username: 'asc' }],
    }),
  ]);

  const totalSum = sumRows.reduce((s, r) => s + num(r.amount), 0);
  const monthOptions = [...months].reverse();
  const exportQs = new URLSearchParams(
    Object.entries(f).filter(([k, v]) => v && k !== 'page' && k !== 'open'),
  ).toString();

  async function removePayment(formData: FormData) {
    'use server';
    await deletePaymentAction(formData);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>To&apos;lovlar</h1>
          <p>Barterchilardan kelgan barcha tushumlar: material, ish hajmi va pul</p>
        </div>
        <div className="actions">
          <a className="btn btn-ghost" href={`/api/export/payments${exportQs ? `?${exportQs}` : ''}`}>
            <FileSpreadsheet className="lucide" />
            Excel
          </a>
        </div>
      </div>

      <div className="kpis two">
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><Receipt className="lucide" /></span>
          </div>
          <div className="kpi-value">{count}</div>
          <div className="kpi-label">Tushumlar soni</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><Banknote className="lucide" /></span>
          </div>
          <div className="kpi-value">{fmtShort(totalSum)}</div>
          <div className="kpi-label">
            Jami summa{totalSum ? ` · ${fmtSom(totalSum)} so'm` : ''}
          </div>
        </div>
      </div>

      <FilterForm action="/tolovlar">
        <input
          type="search"
          name="q"
          defaultValue={f.q || ''}
          className="span-2"
          placeholder="Barterchi yoki shartnoma, keyin Enter"
        />
        <select name="oy" aria-label="Oy" defaultValue={f.oy || ''}>
          <option value="">Barcha oylar</option>
          {monthOptions.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <input type="date" name="sana" defaultValue={f.sana || ''} aria-label="Kun" />
        <select name="tjm" aria-label="TJM" defaultValue={f.tjm || ''}>
          <option value="">Barcha TJMlar</option>
          {tjms.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="turi" aria-label="Turi" defaultValue={f.turi || ''}>
          <option value="">Barcha turlar</option>
          {TX_KIND_CHOICES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select name="operator" aria-label="Operator" defaultValue={f.operator || ''}>
          <option value="">Barcha operatorlar</option>
          {operators.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.fullName || o.username}
            </option>
          ))}
        </select>
      </FilterForm>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Barterchi</th>
                <th>TJM</th>
                <th>Shartnoma</th>
                <th>Turi</th>
                <th className="num">Summa</th>
                <th>Sana</th>
                <th>Holat</th>
                <th>Operator</th>
                {user.isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    Tanlangan davrda tushum yo&apos;q.
                  </td>
                </tr>
              )}
              {rows.map((t) => (
                <ContractRow key={t.id} id={t.contractId}>
                  <td>
                    <div className="who">
                      <span className="avatar">{initial(t.contract.supplier.fullName)}</span>
                      <div>
                        <b>{t.contract.supplier.fullName}</b>
                        {t.note && <small>{t.note.slice(0, 60)}</small>}
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">{t.contract.tjm.name}</td>
                  <td className="nowrap mono">{t.contract.number}</td>
                  <td>
                    <span className="chip">{TX_KIND[t.kind] || t.kind}</span>
                  </td>
                  <td className="num money green">{fmtSom(t.amount)}</td>
                  <td className="nowrap">
                    {dmy(t.operationDate)}
                    <br />
                    <small className="faint">{dmhm(t.createdAt)}</small>
                  </td>
                  <td>
                    {t.contract.isClosed ? (
                      <span className="badge">Yopilgan</span>
                    ) : (
                      <span className="badge ok">Faol</span>
                    )}
                  </td>
                  <td className="nowrap">
                    {t.createdBy ? t.createdBy.fullName || t.createdBy.username : '—'}
                  </td>
                  {user.isAdmin && (
                    <td>
                      <ConfirmForm
                        action={removePayment}
                        message={`${fmtSom(t.amount)} so'mlik tushumni o'chirasizmi? Qoldiq qarz qayta tiklanadi.`}
                      >
                        <input type="hidden" name="txnId" value={t.id} />
                        <SubmitButton
                          className="btn btn-danger sm icon"
                          title="O'chirish"
                          ariaLabel="O'chirish"
                        >
                          <Trash2 className="lucide" />
                        </SubmitButton>
                      </ConfirmForm>
                    </td>
                  )}
                </ContractRow>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination basePath="/tolovlar" params={f} page={page} pageSize={PAGE_SIZE} count={count} />
      </section>
    </>
  );
}
