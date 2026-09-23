import Link from 'next/link';
import { FileSpreadsheet, Upload, Plus, ChevronRight } from 'lucide-react';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { contractScope, visibleTjms } from '@/lib/permissions';
import { CONTRACT_SORTS, contractOrder, contractWhere, flatParams } from '@/lib/contractFilters';
import {
  MATERIAL_GROUP_CHOICES,
  PAGE_SIZE,
  SUPPLY_STATUS,
  SUPPLY_STATUS_CHOICES,
} from '@/lib/constants';
import { daysSince, dmy, fmtShort, fmtSom, initial, num, phoneFmt } from '@/lib/format';
import FilterForm from '@/components/FilterForm';
import Pagination from '@/components/Pagination';
import { ContractRow, ContractButton } from '@/components/OpenContract';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Barterlar' };

export default async function ContractListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const f = flatParams(await searchParams);

  const page = Math.max(1, Number(f.page) || 1);
  const sort = CONTRACT_SORTS[f.sort] ? f.sort : '-remaining_amount';
  const where = contractWhere(user, f);

  const [count, rows, totalsRows, tjms, materialsRaw] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      include: { supplier: { include: { phones: { orderBy: { id: 'asc' } } } }, tjm: true },
      orderBy: contractOrder(sort) as any,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contract.findMany({
      where,
      select: { remainingAmount: true, debtAmount: true, totalAmount: true, isClosed: true },
    }),
    visibleTjms(user),
    prisma.contract.findMany({
      where: { ...contractScope(user), materialType: { not: '' } },
      select: { materialType: true },
      distinct: ['materialType'],
      orderBy: { materialType: 'asc' },
    }),
  ]);

  const totals = totalsRows.reduce(
    (acc, r) => {
      acc.total += num(r.totalAmount);
      if (!r.isClosed) {
        acc.remaining += num(r.remainingAmount);
        acc.debt += num(r.debtAmount);
        if (num(r.debtAmount) > 0) acc.debtors += 1;
      }
      return acc;
    },
    { total: 0, remaining: 0, debt: 0, debtors: 0 },
  );

  const materials = materialsRaw.map((m) => m.materialType);
  const exportQs = new URLSearchParams(
    Object.entries(f).filter(([k, v]) => v && k !== 'page' && k !== 'open'),
  ).toString();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Barterlar</h1>
          <p>{count} ta shartnoma topildi</p>
        </div>
        <div className="actions">
          <a className="btn btn-ghost" href={`/api/export/contracts${exportQs ? `?${exportQs}` : ''}`}>
            <FileSpreadsheet className="lucide" />
            Excel
          </a>
          {user.isAdmin && (
            <Link className="btn btn-ghost" href="/barterlar/import">
              <Upload className="lucide" />
              Import
            </Link>
          )}
          <Link className="btn btn-primary" href="/barterlar/yangi">
            <Plus className="lucide" />
            Yangi shartnoma
          </Link>
        </div>
      </div>

      <FilterForm action="/barterlar">
        <input
          type="search"
          name="q"
          defaultValue={f.q || ''}
          className="span-2"
          placeholder="Ism, shartnoma yoki telefon, keyin Enter"
        />
        <select name="tjm" aria-label="TJM" defaultValue={f.tjm || ''}>
          <option value="">Barcha TJMlar</option>
          {tjms.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="holat" aria-label="Holat" defaultValue={f.holat || ''}>
          <option value="">Barcha holatlar</option>
          {SUPPLY_STATUS_CHOICES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
          <option value="none">Belgilanmagan</option>
        </select>
        <select name="guruh" aria-label="Guruh" defaultValue={f.guruh || ''}>
          <option value="">Barcha guruhlar</option>
          {MATERIAL_GROUP_CHOICES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select name="material" aria-label="Hom ashyo" defaultValue={f.material || ''}>
          <option value="">Barcha hom ashyo</option>
          {materials.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select name="qarz" aria-label="Qarzdorlik" defaultValue={f.qarz || ''}>
          <option value="">Qarzdorlik: hammasi</option>
          <option value="bor">Qarzdorligi borlar</option>
          <option value="yoq">Qarzdorligi yo&apos;qlar</option>
        </select>
        <select name="tushum" aria-label="Tushum" defaultValue={f.tushum || ''}>
          <option value="">Tushum: hammasi</option>
          <option value="30">30 kundan beri tushum yo&apos;q</option>
          <option value="hech">Hali tushum kiritilmagan</option>
        </select>
        <select name="sort" aria-label="Saralash" defaultValue={sort}>
          <option value="-remaining_amount">Qoldiq: kattadan</option>
          <option value="remaining_amount">Qoldiq: kichikdan</option>
          <option value="-total_amount">Umumiy summa</option>
          <option value="-debt_amount">Qarzdorlik: kattadan</option>
          <option value="-contract_date">Yangi shartnomalar</option>
          <option value="last_payment_at">Eng eski tushum</option>
          <option value="supplier__full_name">Ism (A–Z)</option>
        </select>
        <label className="check-box">
          <input type="checkbox" name="yopilgan" value="1" defaultChecked={f.yopilgan === '1'} />
          Yopilganlar ham
        </label>
      </FilterForm>

      <section className="panel">
        <div className="summary-strip">
          <span>
            Qoldiq summa: <b>{fmtSom(totals.remaining)}</b> so&apos;m
          </span>
          <span>
            Qarzdorlik: <b className="red">{fmtSom(totals.debt)}</b> so&apos;m · {totals.debtors} ta
            qarzdor
          </span>
          <span>
            Umumiy summa: <b>{fmtSom(totals.total)}</b>
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Barterchi</th>
                <th>TJM / telefon</th>
                <th>Hom ashyo / holat</th>
                <th>Oxirgi tushum</th>
                <th className="num">Qoldiq</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Filtrga mos shartnoma topilmadi. Filtrlarni o&apos;zgartiring yoki «Yopilganlar
                    ham» ni belgilang.
                  </td>
                </tr>
              )}
              {rows.map((c, i) => {
                const d = daysSince(c.lastPaymentAt);
                const paidPercent = num(c.totalAmount)
                  ? Math.max(0, Math.min(100, Math.trunc((num(c.paidAmount) * 100) / num(c.totalAmount))))
                  : 0;
                return (
                  <ContractRow
                    key={c.id}
                    id={c.id}
                    className={`st-${c.supplyStatus || 'none'}${c.isClosed ? ' is-closed' : ''}`}
                  >
                    <td className="faint">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td>
                      <div className="who">
                        <span className="avatar">{initial(c.supplier.fullName)}</span>
                        <div>
                          <b title={c.supplier.fullName}>{c.supplier.fullName}</b>
                          <small>
                            № {c.number}
                            {c.contractDate ? ` · ${dmy(c.contractDate)}` : ''}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">
                      <div className="strong">{c.tjm.name}</div>
                      <div className="mono muted" style={{ fontSize: 12.5 }}>
                        {c.supplier.phones.length ? (
                          <>
                            <a href={`tel:${c.supplier.phones[0].phone}`}>
                              {phoneFmt(c.supplier.phones[0].phone)}
                            </a>
                            {c.supplier.phones.length > 1 && (
                              <span className="faint"> +{c.supplier.phones.length - 1}</span>
                            )}
                          </>
                        ) : (
                          <span className="faint">telefon yo&apos;q</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        {c.materialType ? (
                          <span className="chip">{c.materialType}</span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                        {c.isClosed ? (
                          <span className="badge">Yopilgan</span>
                        ) : c.supplyStatus ? (
                          <span className={`badge st-${c.supplyStatus}`}>
                            {SUPPLY_STATUS[c.supplyStatus]}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="nowrap">
                      {c.lastPaymentAt ? (
                        <span className={d !== null && d > 30 ? 'amber' : 'muted'}>
                          {d === 0 ? 'bugun' : `${d} kun oldin`}
                        </span>
                      ) : (
                        <span className="faint">kiritilmagan</span>
                      )}
                    </td>
                    <td className="num">
                      <span
                        className={`money ${num(c.remainingAmount) > 0 ? 'red' : 'green'}`}
                        title={`${fmtSom(c.remainingAmount)} so'm`}
                      >
                        {fmtShort(c.remainingAmount)}
                      </span>
                      <div className="bar thin green" title={`${paidPercent}% yopilgan`}>
                        <span style={{ width: `${paidPercent}%` }} />
                      </div>
                    </td>
                    <td>
                      <ContractButton id={c.id} className="btn btn-ghost sm icon" title="Ko'rish">
                        <ChevronRight className="lucide" />
                      </ContractButton>
                    </td>
                  </ContractRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination basePath="/barterlar" params={f} page={page} pageSize={PAGE_SIZE} count={count} />
      </section>
    </>
  );
}
