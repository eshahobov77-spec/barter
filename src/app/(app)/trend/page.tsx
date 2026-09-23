import Link from 'next/link';
import { Banknote, CircleCheckBig, FilePlus, PhoneCall } from 'lucide-react';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { transactionScope } from '@/lib/permissions';
import { monthlyTrend } from '@/lib/selectors';
import { flatParams } from '@/lib/contractFilters';
import { GROUP_LABELS, KIND_OPENING } from '@/lib/constants';
import { fmtShort, num } from '@/lib/format';
import { monthStart, toDateOnly } from '@/lib/dates';
import FilterForm from '@/components/FilterForm';
import TrendCharts from '@/components/TrendCharts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Trend va tahlil' };

export default async function TrendPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const f = flatParams(await searchParams);
  const requested = Number(f.oylar);
  const months = [3, 6, 12, 24].includes(requested) ? requested : 12;

  const rows = await monthlyTrend(user, months);
  const totals = {
    paySum: rows.reduce((s, r) => s + r.paySum, 0),
    payCount: rows.reduce((s, r) => s + r.payCount, 0),
    closedCount: rows.reduce((s, r) => s + r.closedCount, 0),
    newCount: rows.reduce((s, r) => s + r.newCount, 0),
    newSum: rows.reduce((s, r) => s + r.newSum, 0),
    calls: rows.reduce((s, r) => s + r.calls, 0),
  };

  const [firstYear, firstMonth] = rows[0].key.split('-').map(Number);
  const periodStart = monthStart(firstYear, firstMonth);
  const groupRows = await prisma.transaction.findMany({
    where: {
      ...transactionScope(user),
      kind: { not: KIND_OPENING },
      operationDate: { gte: toDateOnly(periodStart) },
    },
    select: { amount: true, contract: { select: { materialGroup: true } } },
  });
  const byGroup = new Map<string, number>();
  for (const r of groupRows) {
    const g = r.contract.materialGroup;
    byGroup.set(g, (byGroup.get(g) || 0) + num(r.amount));
  }
  const groups = [...byGroup.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([g, sum]) => ({ label: GROUP_LABELS[g] || '—', sum }));

  const chart = {
    labels: rows.map((r) => r.short),
    pay: rows.map((r) => r.paySum),
    closed: rows.map((r) => r.closedCount),
    new: rows.map((r) => r.newCount),
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Trend va tahlil</h1>
          <p>Oxirgi {months} oy: tushumlar, yopilgan va yangi shartnomalar</p>
        </div>
        <FilterForm action="/trend" className="actions">
          <select name="oylar" aria-label="Davr" defaultValue={String(months)}>
            <option value="3">3 oy</option>
            <option value="6">6 oy</option>
            <option value="12">12 oy</option>
            <option value="24">24 oy</option>
          </select>
        </FilterForm>
      </div>

      <section className="kpis">
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-icon"><Banknote className="lucide" /></span></div>
          <div className="kpi-value">{fmtShort(totals.paySum)}</div>
          <div className="kpi-label">Tushumlar summasi</div>
          <div className="kpi-foot">{totals.payCount} ta tushum</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-icon"><CircleCheckBig className="lucide" /></span></div>
          <div className="kpi-value">{totals.closedCount}</div>
          <div className="kpi-label">Yopilgan shartnomalar</div>
          <div className="kpi-foot">Tizimda yopilganlar</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-icon"><FilePlus className="lucide" /></span></div>
          <div className="kpi-value">{totals.newCount}</div>
          <div className="kpi-label">Yangi shartnomalar</div>
          <div className="kpi-foot">{fmtShort(totals.newSum)} summaga</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-icon"><PhoneCall className="lucide" /></span></div>
          <div className="kpi-value">{totals.calls}</div>
          <div className="kpi-label">Qo&apos;ng&apos;iroqlar</div>
          <div className="kpi-foot">Izohlarda qayd etilgan</div>
        </div>
      </section>

      <TrendCharts data={chart} />

      <div className="two-col">
        <section className="panel">
          <header className="panel-head">
            <div><h2>Oylar kesimida</h2></div>
          </header>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Oy</th>
                  <th className="num">Tushum soni</th>
                  <th className="num">Tushum summasi</th>
                  <th className="num">Yopilgan</th>
                  <th className="num">Yangi</th>
                  <th className="num">Yangi summa</th>
                  <th className="num">Qo&apos;ng&apos;iroq</th>
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.key}>
                    <td className="strong nowrap">
                      <Link href={`/oylik-hisobot?oy=${r.key}`}>{r.label}</Link>
                    </td>
                    <td className="num">{r.payCount}</td>
                    <td className={`num money ${r.paySum ? 'green' : 'faint'}`}>{fmtShort(r.paySum)}</td>
                    <td className="num">{r.closedCount}</td>
                    <td className="num">{r.newCount}</td>
                    <td className="num">{fmtShort(r.newSum)}</td>
                    <td className="num">{r.calls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Hom ashyo guruhlari bo&apos;yicha tushum</h2>
              <p>Tanlangan davr</p>
            </div>
          </header>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {groups.length === 0 && (
                  <tr>
                    <td className="empty">Bu davrda tushum kiritilmagan.</td>
                  </tr>
                )}
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td className="strong">{g.label}</td>
                    <td className="num money">{fmtShort(g.sum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
