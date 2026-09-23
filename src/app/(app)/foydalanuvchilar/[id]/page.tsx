import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import UserForm from '@/components/UserForm';
import ConfirmForm, { SubmitButton } from '@/components/ConfirmForm';
import { resetPasswordAction } from '@/actions/users';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Foydalanuvchini tahrirlash' };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) notFound();

  const [user, tjms] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { tjms: true } }),
    prisma.tjm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  if (!user) notFound();

  async function reset(formData: FormData) {
    'use server';
    await resetPasswordAction(formData);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{user.fullName || user.username}</h1>
          <p>Admin hamma narsani ko&apos;radi. Menejer faqat tanlangan TJMlar bilan ishlaydi</p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/foydalanuvchilar">
            Bekor qilish
          </Link>
        </div>
      </div>

      <UserForm
        editId={user.id}
        tjms={tjms.map((t) => ({ id: t.id, name: t.name }))}
        initial={{
          fullName: user.fullName,
          username: user.username,
          role: user.role,
          isActive: user.isActive,
          tjmIds: user.tjms.map((t) => t.id),
        }}
      />

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Parolni tiklash</h2>
            <p>
              Yangi parol beriladi va foydalanuvchi keyingi kirishda uni almashtirishi so&apos;raladi.
              Barcha sessiyalari yopiladi.
            </p>
          </div>
        </header>
        <div className="panel-body">
          <ConfirmForm
            action={reset}
            message={`${user.username} uchun parolni tiklaysizmi? Uning barcha sessiyalari yopiladi.`}
          >
            <input type="hidden" name="id" value={user.id} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="newPassword">Yangi parol</label>
                <input
                  id="newPassword"
                  type="text"
                  name="newPassword"
                  minLength={6}
                  required
                  autoComplete="off"
                  placeholder="Kamida 6 ta belgi"
                />
              </div>
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <SubmitButton className="btn btn-ghost">
                  <KeyRound className="lucide" />
                  Parolni tiklash
                </SubmitButton>
              </div>
            </div>
          </ConfirmForm>
        </div>
      </section>
    </>
  );
}
