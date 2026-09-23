import Link from 'next/link';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import UserForm from '@/components/UserForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Yangi foydalanuvchi' };

export default async function NewUserPage() {
  await requireAdmin();
  const tjms = await prisma.tjm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Yangi foydalanuvchi</h1>
          <p>Admin hamma narsani ko&apos;radi. Menejer faqat tanlangan TJMlar bilan ishlaydi</p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/foydalanuvchilar">
            Bekor qilish
          </Link>
        </div>
      </div>
      <UserForm
        tjms={tjms.map((t) => ({ id: t.id, name: t.name }))}
        initial={{ fullName: '', username: '', role: 'manager', isActive: true, tjmIds: [] }}
      />
    </>
  );
}
