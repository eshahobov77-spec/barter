import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Docker healthcheck va monitoring uchun. Kirish talab qilinmaydi, maxfiy ma'lumot bermaydi. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { ok: true, db: 'up', time: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { ok: false, db: 'down' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
