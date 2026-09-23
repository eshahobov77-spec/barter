import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import prisma from './db';

export const SESSION_COOKIE = 'barter_session';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);

// ------------------------------------------------------------------ parollar

/** scrypt$N$r$p$salt$hash — tashqi kutubxonasiz, Node'ning o'zida. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const N = 16384,
    r = 8,
    p = 1;
  const key = scryptSync(password.normalize('NFKC'), salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    if (!stored) return false;
    const parts = stored.split('$');
    if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const key = scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N: +N,
      r: +r,
      p: +p,
      maxmem: 64 * 1024 * 1024,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** Django'dagi MinimumLengthValidator(6) ekvivalenti + biroz qat'iyroq. */
export function validatePassword(password: string, username = ''): string | null {
  const p = (password || '').trim();
  if (p.length < 6) return "Parol kamida 6 ta belgidan iborat bo'lishi kerak.";
  if (p.length > 128) return 'Parol juda uzun.';
  if (username && p.toLowerCase() === username.toLowerCase())
    return "Parol login bilan bir xil bo'lmasin.";
  if (/^\d+$/.test(p)) return "Parol faqat raqamlardan iborat bo'lmasin.";
  return null;
}

// ------------------------------------------------------------------ sessiya

export async function headersIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get('x-forwarded-for');
    const candidate = (fwd ? fwd.split(',')[0] : h.get('x-real-ip') || '').trim();
    if (!candidate) return null;
    // IPv4 yoki IPv6 ko'rinishini qo'pol tekshirish
    if (/^[0-9.]+$/.test(candidate) || /^[0-9a-fA-F:]+$/.test(candidate)) return candidate.slice(0, 45);
    return null;
  } catch {
    return null;
  }
}

export async function userAgent(): Promise<string> {
  try {
    const h = await headers();
    return (h.get('user-agent') || '').slice(0, 250);
  } catch {
    return '';
  }
}

export type SessionUser = {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  isAdmin: boolean;
  displayName: string;
  tjmIds: number[];
};

function shape(u: any): SessionUser {
  const isAdmin = u.role === 'admin';
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName || '',
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    isAdmin,
    displayName: u.fullName || u.username,
    tjmIds: (u.tjms || []).map((t: any) => t.id),
  };
}

export async function createSession(userId: number): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await prisma.session.create({
    data: { id, userId, expiresAt, ip: await headersIp(), userAgent: await userAgent() },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.SECURE_COOKIES === 'true',
    path: '/',
    expires: expiresAt,
  });
  // Eskirgan sessiyalarni tozalash (arzon, fon ishi)
  prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  return id;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await prisma.session.deleteMany({ where: { id } }).catch(() => {});
  jar.delete(SESSION_COOKIE);
}

/** Joriy foydalanuvchi yoki null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  let id: string | undefined;
  try {
    const jar = await cookies();
    id = jar.get(SESSION_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!id) return null;
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { include: { tjms: { select: { id: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user || !session.user.isActive) return null;
  return shape(session.user);
}

/** Kirish talab qilinadi — aks holda /kirish ga yuboradi. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/kirish');
  return user;
}

/** Faqat admin. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect('/ruxsat-yoq');
  return user;
}

/** Gravatar-vari hech narsa kerak emas — faqat barqaror rang uchun hash. */
export function colorSeed(s: string): number {
  return parseInt(createHash('md5').update(s).digest('hex').slice(0, 4), 16);
}
