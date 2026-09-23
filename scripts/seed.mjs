/**
 * Boshlang'ich ma'lumotlar. Bir necha marta ishga tushirsa ham xavfsiz.
 *   - admin / admin  (birinchi kirishda parolni almashtirish so'raladi)
 *   - BotSettings (id = 1)
 *
 * Ishlatish:  node scripts/seed.mjs
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16);
  const N = 16384,
    r = 8,
    p = 1;
  const key = scryptSync(password.normalize('NFKC'), salt, 64, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function main() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD || 'admin';

  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        fullName: 'Administrator',
        role: 'admin',
        isActive: true,
        mustChangePassword: password === 'admin',
      },
    });
    console.log(`[seed] Admin yaratildi: ${username} / ${password}`);
  } else {
    console.log(`[seed] Admin allaqachon bor: ${username}`);
  }

  const settings = await prisma.botSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    await prisma.botSettings.create({ data: { id: 1 } });
    console.log('[seed] Bot sozlamalari yozuvi yaratildi');
  }

  // Eskirgan sessiyalarni tozalaymiz
  const removed = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  if (removed.count) console.log(`[seed] ${removed.count} ta eskirgan sessiya o'chirildi`);
}

main()
  .catch((e) => {
    console.error('[seed] Xato:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
