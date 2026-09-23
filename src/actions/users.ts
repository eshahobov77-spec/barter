'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import prisma from '@/lib/db';
import { requireAdmin, hashPassword, validatePassword } from '@/lib/auth';
import { logAction } from '@/lib/audit';
import { A } from '@/lib/constants';

export type UserFormState = {
  errors?: Record<string, string>;
  error?: string;
  values?: Record<string, string>;
  tjmIds?: number[];
};

export async function saveUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const admin = await requireAdmin();
  const editId = Number(formData.get('editId') || 0);

  const fullName = String(formData.get('fullName') || '').trim();
  const username = String(formData.get('username') || '').trim();
  const role = String(formData.get('role') || 'manager');
  const password = String(formData.get('password') || '');
  const isActive = formData.get('isActive') === 'on';
  const tjmIds = formData
    .getAll('tjms')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  const values = { fullName, username, role, isActive: isActive ? 'on' : '' };
  const errors: Record<string, string> = {};

  if (!fullName) errors.fullName = 'F.I.SH ni kiriting.';
  if (!username) errors.username = 'Login kiriting.';
  else if (!/^[A-Za-z0-9._-]{3,50}$/.test(username))
    errors.username = 'Login 3–50 ta lotin harf, raqam yoki . _ - belgilaridan iborat bo‘lsin.';
  if (!['admin', 'manager'].includes(role)) errors.role = 'Rolni tanlang.';
  if (role === 'manager' && tjmIds.length === 0)
    errors.tjms = 'Menejerga kamida bitta TJM biriktiring.';

  if (!errors.username) {
    const clash = await prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        ...(editId ? { id: { not: editId } } : {}),
      },
    });
    if (clash) errors.username = 'Bu login band.';
  }

  if (!editId || password) {
    const problem = validatePassword(password, username);
    if (problem) errors.password = problem;
  }

  if (Object.keys(errors).length) return { errors, values, tjmIds };

  const data: any = {
    fullName,
    username,
    role,
    isActive,
    tjms: { set: role === 'admin' ? [] : tjmIds.map((id) => ({ id })) },
  };
  if (password) {
    data.passwordHash = hashPassword(password);
    data.mustChangePassword = false;
  }

  let saved;
  if (editId) {
    if (editId === admin.id && role !== 'admin') {
      return { error: 'O‘zingizning admin rolingizni olib tashlay olmaysiz.', values, tjmIds };
    }
    if (editId === admin.id && !isActive) {
      return { error: 'O‘zingizni bloklay olmaysiz.', values, tjmIds };
    }
    saved = await prisma.user.update({ where: { id: editId }, data, include: { tjms: true } });
  } else {
    saved = await prisma.user.create({
      data: { ...data, tjms: { connect: role === 'admin' ? [] : tjmIds.map((id) => ({ id })) } },
      include: { tjms: true },
    });
  }

  await logAction({
    action: editId ? A.USER_EDIT : A.USER_CREATE,
    user: admin,
    objectType: 'user',
    objectId: saved.id,
    detail:
      `${saved.fullName || saved.username} (${saved.username}) | ` +
      `${saved.role === 'admin' ? 'Admin' : 'Menejer'} | ` +
      (saved.tjms.map((t: any) => t.name).join(', ') || '—'),
  });

  revalidatePath('/foydalanuvchilar');
  redirect('/foydalanuvchilar');
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id) || id === admin.id) return;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true } } },
  });
  if (!user) return;
  const label = `${user.fullName || user.username} (${user.username})`;

  if (user._count.transactions > 0) {
    // Tarix yo'qolmasligi uchun o'chirish o'rniga bloklaymiz
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    await logAction({
      action: A.USER_DELETE,
      user: admin,
      detail: `${label} — bloklandi (kiritgan tushumlari bor)`,
    });
  } else {
    await prisma.user.delete({ where: { id } });
    await logAction({ action: A.USER_DELETE, user: admin, detail: label });
  }
  revalidatePath('/foydalanuvchilar');
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(formData.get('id'));
  const newPassword = String(formData.get('newPassword') || '').trim();
  if (!Number.isInteger(id) || !newPassword) return;
  if (validatePassword(newPassword)) return;

  const user = await prisma.user.update({
    where: { id },
    data: { passwordHash: hashPassword(newPassword), mustChangePassword: true },
  });
  await prisma.session.deleteMany({ where: { userId: id } });
  await logAction({
    action: A.PASSWORD,
    user: admin,
    objectType: 'user',
    objectId: id,
    detail: `${user.username} uchun parol admin tomonidan tiklandi`,
  });
  revalidatePath('/foydalanuvchilar');
}
