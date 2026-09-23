import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { dmyhm, initial } from '@/lib/format';
import { ProfileForm, PasswordForm } from './CabinetForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mening kabinetim' };

export default async function CabinetPage() {
  const user = await requireUser();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    include: { tjms: { orderBy: { name: 'asc' } }, _count: { select: { transactions: true } } },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mening kabinetim</h1>
          <p>Profil ma&apos;lumotlari va parol</p>
        </div>
      </div>

      {user.mustChangePassword && (
        <div className="banner">
          Siz hali boshlang&apos;ich paroldan foydalanyapsiz. Iltimos, uni almashtiring.
        </div>
      )}

      <section className="panel">
        <div className="panel-body">
          <div className="profile-head">
            <span className="avatar">{initial(user.displayName)}</span>
            <div>
              <b>{user.displayName}</b>
              <small>
                {user.username} · {user.isAdmin ? 'Admin' : 'Menejer'}
              </small>
            </div>
          </div>
          <dl className="kv">
            <dt>Oxirgi kirish</dt>
            <dd>{row?.lastLogin ? dmyhm(row.lastLogin) : '—'}</dd>
            <dt>Kiritilgan tushumlar</dt>
            <dd>{row?._count.transactions ?? 0}</dd>
            <dt>Biriktirilgan TJMlar</dt>
            <dd>
              {user.isAdmin
                ? 'Barchasi'
                : row?.tjms.length
                  ? row.tjms.map((t) => t.name).join(', ')
                  : '—'}
            </dd>
          </dl>
        </div>
      </section>

      <div className="two-col">
        <PasswordForm />
        <ProfileForm fullName={row?.fullName || ''} />
      </div>
    </>
  );
}
