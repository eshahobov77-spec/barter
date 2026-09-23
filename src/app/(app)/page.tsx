import Link from 'next/link';
import {
  FileSignature, Hourglass, Activity, CircleCheckBig, Repeat2,
  CalendarRange, Plus, ArrowDownLeft,
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { dashboardKpis, recentActivity, tjmSummary, topDebtors } from '@/lib/selectors';
import { dmyhm, fmtShort, initial } from '@/lib/format';
import { TX_KIND } from '@/lib/constants';
import { ContractRow, ContractFeedItem } from '@/components/OpenContract';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const user = await requireUser();
  const [kpi, tjmRows, top, activity] = await Promise.all([
    dashboardKpis(user),
    tjmSummary(user),
    topDebtors(user, 10),
    recentActivity(user, 12),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>
            Barter shartnomalari bo&apos;yicha umumiy holat
            {!user.isAdmin && ' — sizga biriktirilgan TJMlar'}
          </p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/oylik-hisobot">
            <CalendarRange className="lucide" />
            Oylik hisobot
          </Link>
          <Link className="btn btn-primary" href="/barterlar/yangi">
            <Plus className="lucide" />
            Yangi shartnoma
          </Link>
        </div>
      </div>

      <section className="kpis five">
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><FileSignature className="lucide" /></span>
            <span className="kpi-tag">{kpi.count} ta</span>
          </div>
          <div className="kpi-value">{fmtShort(kpi.total)}</div>
          <div className="kpi-label">Jami shartnomalar summasi</div>
          <div className="kpi-foot">Barcha barter shartnomalari</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><Hourglass className="lucide" /></span>
            <span className="kpi-tag">{kpi.paidPct}% yopilgan</span>
          </div>
          <div className="kpi-value">{fmtShort(kpi.remaining)}</div>
          <div className="kpi-label">Qoldiq summa</div>
          <div className="kpi-foot">Uylarning hali to&apos;lanmagan qolgan summasi</div>
        </div>
        <div className="kpi kpi-danger">
          <div className="kpi-top">
            <span className="kpi-icon"><Activity className="lucide" /></span>
            <span className="kpi-tag">{kpi.debtors} ta qarzdor</span>
          </div>
          <div className="kpi-value">{fmtShort(kpi.debt)}</div>
          <div className="kpi-label">Qarzdorlik summasi</div>
          <div className="kpi-foot">Grafik bo&apos;yicha to&apos;lanmagan · qoldiqning {kpi.debtPct}%</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><CircleCheckBig className="lucide" /></span>
            <span className="kpi-tag">{fmtShort(kpi.closedSum)}</span>
          </div>
          <div className="kpi-value">{kpi.closedCount}</div>
          <div className="kpi-label">Yopilgan shartnomalar</div>
          <div className="kpi-foot">Majburiyat bajarilgan yoki qaytarilgan</div>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-icon"><Repeat2 className="lucide" /></span>
            <span className="kpi-tag">faol</span>
          </div>
          <div className="kpi-value">{kpi.active}</div>
          <div className="kpi-label">Aktiv shartnomalar</div>
          <div className="kpi-foot">Qoldig&apos;i bor, ochiq shartnomalar</div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>TJM bo&apos;yicha qarzdorlik</h2>
              <p>{tjmRows.length} ta obyekt. Qatorni bosing — shu TJM barterlari ochiladi</p>
            </div>
          </header>
          <div className="table-wrap panel-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>TJM nomi</th>
                  <th className="num">Aktiv</th>
                  <th className="num">Qoldiq</th>
                  <th>Qarzdorlik</th>
                </tr>
              </thead>
              <tbody>
                {tjmRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      Sizga hali TJM biriktirilmagan. Admin bilan bog&apos;laning.
                    </td>
                  </tr>
                )}
                {tjmRows.map((t, i) => (
                  <tr key={t.id}>
                    <td className="faint">{i + 1}</td>
                    <td className="strong">
                      <Link href={`/barterlar?tjm=${t.id}`}>{t.name}</Link>
                    </td>
                    <td className="num">{t.activeCount}</td>
                    <td className="num muted">{fmtShort(t.remaining)}</td>
                    <td>
                      <div className="bar-cell">
                        <div className="bar">
                          <span style={{ width: `${t.bar}%` }} />
                        </div>
                        <b className={`num ${t.debt ? 'red' : 'faint'}`}>{fmtShort(t.debt)}</b>
                      </div>
                      {t.debtors > 0 && <small className="faint">{t.debtors} ta qarzdor</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div>
          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>Eng katta qarzdorlar</h2>
                <p>Grafik bo&apos;yicha to&apos;lanmagan summa, top 10</p>
              </div>
              <Link className="link" href="/barterlar?qarz=bor&sort=-debt_amount">
                Hammasi
              </Link>
            </header>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {top.length === 0 && (
                    <tr>
                      <td className="empty">Grafik bo&apos;yicha qarzdorlik yo&apos;q.</td>
                    </tr>
                  )}
                  {top.map((c) => (
                    <ContractRow key={c.id} id={c.id} className={`st-${c.supplyStatus || 'none'}`}>
                      <td>
                        <div className="who">
                          <span className="avatar">{initial(c.supplier.fullName)}</span>
                          <div>
                            <b>{c.supplier.fullName}</b>
                            <small>
                              {c.tjm.name} · {c.number}
                              {c.materialType ? ` · ${c.materialType}` : ''}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="num">
                        <span className="money red">{fmtShort(c.debtAmount)}</span>
                        <div className="faint small nowrap">qoldiq {fmtShort(c.remainingAmount)}</div>
                      </td>
                    </ContractRow>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>So&apos;nggi tushumlar</h2>
                <p>Kiritilgan material, abyom va pullar</p>
              </div>
              <Link className="link" href="/tolovlar">
                Barchasi
              </Link>
            </header>
            <ul className="feed">
              {activity.length === 0 && (
                <li>
                  <div className="body muted">
                    Hali tushum kiritilmagan. Barterlar sahifasida shartnomani oching va «Tushum»
                    tabidan kiriting.
                  </div>
                </li>
              )}
              {activity.map((t) => (
                <ContractFeedItem key={t.id} id={t.contractId}>
                  <span className="ico">
                    <ArrowDownLeft className="lucide" />
                  </span>
                  <div className="body">
                    <div className="title">{t.contract.supplier.fullName}</div>
                    <div className="sub">
                      {t.contract.tjm.name} · {TX_KIND[t.kind] || t.kind}
                      {t.note ? ` · ${t.note}` : ''}
                    </div>
                    <div className="meta">
                      {t.createdBy ? t.createdBy.fullName || t.createdBy.username : '—'} ·{' '}
                      {dmyhm(t.createdAt)}
                    </div>
                  </div>
                  <span className="amount">+{fmtShort(t.amount)}</span>
                </ContractFeedItem>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
