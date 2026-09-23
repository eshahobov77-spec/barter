import Link from 'next/link';
import { UserPlus, Pencil, Trash2 } from 'lucide-react';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { flatParams } from '@/lib/contractFilters';
import { dmyhm, initial } from '@/lib/format';
import ConfirmForm, { SubmitButton } from '@/components/ConfirmForm';
import { deleteUserAction } from '@/actions/users';
import FilterForm from '@/components/FilterForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Foydalanuvchilar' };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireAdmin();
  const f = flatParams(await searchParams);
  const q = (f.q || '').trim();

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { username: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
      include: { tjms: { orderBy: { name: 'asc' } }, _count: { select: { transactions: true } } },
      orderBy: [{ fullName: 'asc' }, { username: 'asc' }],
    }),
    prisma.user.count(),
  ]);

  async function removeUser(formData: FormData) {
    'use server';
    await deleteUserAction(formData);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Foydalanuvchilar</h1>
          <p>Jami: {total} ta. Menejer faqat biriktirilgan TJMlarni ko&apos;radi</p>
        </div>
        <div className="actions">
          <FilterForm action="/foydalanuvchilar" className="">
            <input type="search" name="q" defaultValue={q} placeholder="Ism yoki login…" />
          </FilterForm>
          <Link className="btn btn-primary" href="/foydalanuvchilar/yangi">
            <UserPlus className="lucide" />
            Yangi foydalanuvchi
          </Link>
        </div>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Ism</th>
                <th>Login</th>
                <th>Rol</th>
                <th>TJMlar</th>
                <th className="num">Tushumlar</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    Foydalanuvchi topilmadi.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="who">
                      <span className="avatar">{initial(u.fullName || u.username)}</span>
                      <div>
                        <b>{u.fullName || u.username}</b>
                        {u.lastLogin && <small>Oxirgi kirish: {dmyhm(u.lastLogin)}</small>}
                      </div>
                    </div>
                  </td>
                  <td className="mono">{u.username}</td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className="badge accent plain">Admin</span>
                    ) : (
                      <span className="badge plain">Menejer</span>
                    )}
                  </td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className="muted">Barcha TJMlar</span>
                    ) : (
                      <div className="chips">
                        {u.tjms.slice(0, 4).map((t) => (
                          <span className="chip" key={t.id}>
                            {t.name}
                          </span>
                        ))}
                        {u.tjms.length > 4 && <span className="chip">+{u.tjms.length - 4}</span>}
                        {u.tjms.length === 0 && <span className="red">biriktirilmagan</span>}
                      </div>
                    )}
                  </td>
                  <td className="num">{u._count.transactions}</td>
                  <td>
                    {u.isActive ? (
                      <span className="badge ok">Faol</span>
                    ) : (
                      <span className="badge bad">Bloklangan</span>
                    )}
                  </td>
                  <td className="nowrap">
                    <div className="actions">
                      <Link className="btn btn-ghost sm" href={`/foydalanuvchilar/${u.id}`}>
                        <Pencil className="lucide" />
                        Tahrir
                      </Link>
                      {u.id !== me.id && (
                        <ConfirmForm
                          action={removeUser}
                          message={`${u.fullName || u.username} ni o'chirasizmi? Tushum kiritgan bo'lsa, faqat bloklanadi.`}
                        >
                          <input type="hidden" name="id" value={u.id} />
                          <SubmitButton className="btn btn-danger sm icon" ariaLabel="O'chirish">
                            <Trash2 className="lucide" />
                          </SubmitButton>
                        </ConfirmForm>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
