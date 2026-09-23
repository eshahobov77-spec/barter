'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import prisma from '@/lib/db';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/auth';
import { logAction } from '@/lib/audit';
import { A } from '@/lib/constants';

export type FormState = { error?: string; ok?: boolean; message?: string };

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/');

  if (!username || !password) return { error: 'Login va parolni kiriting.' };

  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });

  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    await logAction({
      action: A.LOGIN_FAILED,
      username,
      detail: `Login: ${username}` + (user && !user.isActive ? ' (bloklangan)' : ''),
    });
    return { error: "Login yoki parol noto'g'ri." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  await createSession(user.id);
  await logAction({
    action: A.LOGIN,
    username: user.username,
    user: { id: user.id, username: user.username } as any,
    detail: user.fullName || user.username,
  });

  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await logAction({ action: A.LOGOUT, user, detail: user.displayName });
  }
  await destroySession();
  redirect('/kirish');
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sessiya tugagan. Qaytadan kiring.' };

  const current = String(formData.get('current') || '');
  const next1 = String(formData.get('password1') || '');
  const next2 = String(formData.get('password2') || '');

  const row = await prisma.user.findUnique({ where: { id: user.id } });
  if (!row) return { error: 'Foydalanuvchi topilmadi.' };
  if (!verifyPassword(current, row.passwordHash)) return { error: "Joriy parol noto'g'ri." };
  if (next1 !== next2) return { error: 'Yangi parollar mos kelmadi.' };
  const problem = validatePassword(next1, row.username);
  if (problem) return { error: problem };
  if (verifyPassword(next1, row.passwordHash))
    return { error: "Yangi parol eskisidan farq qilishi kerak." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(next1), mustChangePassword: false },
  });

  // Boshqa qurilmalardagi sessiyalarni bekor qilamiz (joriysi saqlanadi).
  try {
    const jar = await cookies();
    const currentId = jar.get(SESSION_COOKIE)?.value;
    await prisma.session.deleteMany({
      where: { userId: user.id, ...(currentId ? { id: { not: currentId } } : {}) },
    });
  } catch {
    /* sessiyalarni tozalash majburiy emas */
  }

  await logAction({ action: A.PASSWORD, user, detail: `${user.displayName} parolini o'zgartirdi` });

  return { ok: true, message: "Parol o'zgartirildi." };
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sessiya tugagan. Qaytadan kiring.' };
  const fullName = String(formData.get('fullName') || '').trim();
  if (!fullName) return { error: "F.I.SH bo'sh bo'lmasin." };
  if (fullName.length > 150) return { error: 'F.I.SH juda uzun.' };

  await prisma.user.update({ where: { id: user.id }, data: { fullName } });
  await logAction({ action: A.USER_EDIT, user, detail: `O'z profilini yangiladi: ${fullName}` });
  return { ok: true, message: 'Profil saqlandi.' };
}
