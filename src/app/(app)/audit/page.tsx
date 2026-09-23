import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { flatParams } from '@/lib/contractFilters';
import { AUDIT_ACTION, AUDIT_ACTION_CHOICES, PAGE_SIZE } from '@/lib/constants';
import { dmyhms } from '@/lib/format';
import FilterForm from '@/components/FilterForm';
import Pagination from '@/components/Pagination';
import { ContractButton } from '@/components/OpenContract';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

function badgeClass(action: string): string {
  if (['kirish_xato', 'tolov_ochirish', 'user_ochirish'].includes(action)) return 'bad';
  if (['tolov', 'yopish'].includes(action)) return 'ok';
  if (['kirish', 'chiqish'].includes(action)) return '';
  return 'accent';
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const f = flatParams(await searchParams);
  const page = Math.max(1, Number(f.page) || 1);
  const userQ = (f.user || '').trim();
  const action = f.action || '';

  const where: any = { AND: [] as any[] };
  if (userQ) {
    where.AND.push({
      OR: [
        { username: { contains: userQ, mode: 'insensitive' } },
        { user: { fullName: { contains: userQ, mode: 'insensitive' } } },
        { detail: { contains: userQ, mode: 'insensitive' } },
      ],
    });
  }
  if (action && Object.prototype.hasOwnProperty.call(AUDIT_ACTION, action)) where.AND.push({ action });

  const [count, rows, total] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count(),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Tizimdagi barcha amallar tarixi. Jami: {total} ta yozuv</p>
        </div>
      </div>

      <FilterForm action="/audit">
        <input
          type="search"
          name="user"
          defaultValue={userQ}
          className="span-2"
          placeholder="Foydalanuvchi yoki tafsilot, keyin Enter"
        />
        <select name="action" aria-label="Amal" defaultValue={action}>
          <option value="">Barcha amallar</option>
          {AUDIT_ACTION_CHOICES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </FilterForm>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Foydalanuvchi</th>
                <th>Amal</th>
                <th>Tafsilot</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    Yozuv topilmadi.
                  </td>
                </tr>
              )}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap muted">{dmyhms(a.createdAt)}</td>
                  <td className="nowrap strong">
                    {a.user ? a.user.fullName || a.user.username : a.username || '—'}
                  </td>
                  <td>
                    <span className={`badge plain ${badgeClass(a.action)}`}>
                      {AUDIT_ACTION[a.action] || a.action}
                    </span>
                  </td>
                  <td>
                    {a.objectType === 'contract' && a.objectId ? (
                      <ContractButton
                        id={Number(a.objectId)}
                        className="link"
                        title="Shartnomani ochish"
                      >
                        {a.detail}
                      </ContractButton>
                    ) : (
                      a.detail
                    )}
                  </td>
                  <td className="mono muted nowrap">{a.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination basePath="/audit" params={f} page={page} pageSize={PAGE_SIZE} count={count} />
      </section>
    </>
  );
}
