import prisma from './db';
import type { SessionUser } from './auth';

/**
 * Menejer faqat o'ziga biriktirilgan TJMlardagi shartnomalarni ko'radi.
 * Prisma `where` bo'lagini qaytaradi.
 */
export function contractScope(user: SessionUser): Record<string, any> {
  if (user.isAdmin) return {};
  return { tjmId: { in: user.tjmIds.length ? user.tjmIds : [-1] } };
}

/** Tushumlar uchun scope (contract orqali). */
export function transactionScope(user: SessionUser): Record<string, any> {
  if (user.isAdmin) return {};
  return { contract: { tjmId: { in: user.tjmIds.length ? user.tjmIds : [-1] } } };
}

/** Foydalanuvchiga ko'rinadigan faol TJMlar. */
export function visibleTjms(user: SessionUser) {
  if (user.isAdmin) {
    return prisma.tjm.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }
  return prisma.tjm.findMany({
    where: { isActive: true, id: { in: user.tjmIds.length ? user.tjmIds : [-1] } },
    orderBy: { name: 'asc' },
  });
}

export function canSeeTjm(user: SessionUser, tjmId: number): boolean {
  return user.isAdmin || user.tjmIds.includes(tjmId);
}
