import Link from 'next/link';
import { Banknote, CircleCheckBig, FilePlus, PhoneCall, FileSpreadsheet } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { monthlyReport } from '@/lib/selectors';
import { flatParams } from '@/lib/contractFilters';
import { parseMonth } from '@/lib/dates';
import { fmtShort, signedPct } from '@/lib/format';
import FilterForm from '@/components/FilterForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Oylik hisobot' };

function Delta({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return <span className={`delta ${value >= 0 ? 'up' : 'down'}`}>{signedPct(value)}</span>;
}

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const f = flatParams(await searchParams);
  const now = new Date();
  const picked = parseMonth(f.oy) || { year: now.getFullYear(), month: now.getMonth() + 1 };
  const r = await monthlyReport(user, picked.year, picked.month);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Oylik hisobot — {r.label}</h1>
          <p>Oy davomidagi tushumlar, qoldiq va grafik bo&apos;yicha qarzdorlik</p>
        </div>
        <div className="actions">
          <FilterForm action="/oylik-hisobot" className="">
            <input type="month" name="oy" defaultValue={r.key} aria-label="Oy" />
          </FilterForm>
          <a className="btn btn-ghost" href={`/api/export/monthly?oy=${r.key}`}>
            <FileSpreadsheet className="lucide" />
            Excel
          </a>
        </div>
      </div>

      <section className="kpis">
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><Banknote className="lucide" /></span>
            <span className="kpi-tag">{r.cur.payCount} ta</span>
          </div>
          <div className="kpi-value">
            {fmtShort(r.cur.paySum)}
            <Delta value={r.changes.paySum} />
          </div>
          <div className="kpi-label">Oy tushumi</div>
          <div className="kpi-foot">O&apos;tgan oy: {fmtShort(r.prev.paySum)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><CircleCheckBig className="lucide" /></span>
            <span className="kpi-tag">{fmtShort(r.cur.closedSum)}</span>
          </div>
          <div className="kpi-value">
            {r.cur.closedCount}
            <Delta value={r.changes.closedCount} />
          </div>
          <div className="kpi-label">Yopilgan shartnomalar</div>
          <div className="kpi-foot">O&apos;tgan oy: {r.prev.closedCount}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><FilePlus className="lucide" /></span>
            <span className="kpi-tag">{fmtShort(r.cur.newSum)}</span>
          </div>
          <div className="kpi-value">{r.cur.newCount}</div>
          <div className="kpi-label">Yangi shartnomalar</div>
          <div className="kpi-foot">O&apos;tgan oy: {r.prev.newCount}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><PhoneCall className="lucide" /></span>
          </div>
          <div className="kpi-value">{r.cur.calls}</div>
          <div className="kpi-label">Qo&apos;ng&apos;iroqlar</div>
          <div className="kpi-foot">O&apos;tgan oy: {r.prev.calls}</div>
        </div>
      </section>

      <section className="kpis">
        <div className="stat">
          <small>Aktiv shartnomalar</small>
          <b>{r.active}</b>
          <span>hozirgi holat</span>
        </div>
        <div className="stat">
          <small>Qoldiq summa</small>
          <b>{fmtShort(r.remaining)}</b>
          <span>uylarning qolgan summasi</span>
        </div>
        <div className="stat">
          <small>Qarzdorlik summasi</small>
          <b className="red">{fmtShort(r.debt)}</b>
          <span>grafik bo&apos;yicha, qoldiqning {r.totals.debtPct}%</span>
        </div>
        <div className="stat">
          <small>Qarzdorlar soni</small>
          <b className={r.debtors ? 'amber' : ''}>{r.debtors}</b>
          <span>qarzdorligi bor shartnomalar</span>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>TJM bo&apos;yicha</h2>
            <p>Qatorni bosing — shu TJM tushumlari ochiladi</p>
          </div>
        </header>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>TJM</th>
                <th className="num">Aktiv</th>
                <th className="num">Qoldiq summa</th>
                <th className="num">Qarzdorlik</th>
                <th className="num">Qarzdorlar</th>
                <th className="num">Oy tushumi</th>
                <th className="num">Tushumlar</th>
                <th className="num">Yopildi</th>
                <th className="num">Yopilgan summa</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    TJM topilmadi.
                  </td>
                </tr>
              )}
              {r.rows.map((row) => (
                <tr key={row.tjmId}>
                  <td className="strong">
                    <Link href={`/tolovlar?tjm=${row.tjmId}&oy=${r.key}`}>{row.tjmName}</Link>
                  </td>
                  <td className="num">{row.active}</td>
                  <td className="num muted">{fmtShort(row.remaining)}</td>
                  <td className={`num money ${row.debt ? 'red' : 'faint'}`}>{fmtShort(row.debt)}</td>
                  <td className="num">{row.debtors}</td>
                  <td className={`num money ${row.paySum ? 'green' : 'faint'}`}>{fmtShort(row.paySum)}</td>
                  <td className="num">{row.payCount}</td>
                  <td className="num">{row.closedCount}</td>
                  <td className="num">{fmtShort(row.closedSum)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Jami</td>
                <td className="num">{r.totals.active}</td>
                <td className="num">{fmtShort(r.totals.remaining)}</td>
                <td className="num red">{fmtShort(r.totals.debt)}</td>
                <td className="num">{r.totals.debtors}</td>
                <td className="num green">{fmtShort(r.totals.paySum)}</td>
                <td className="num">{r.totals.payCount}</td>
                <td className="num">{r.totals.closedCount}</td>
                <td className="num">{fmtShort(r.totals.closedSum)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
