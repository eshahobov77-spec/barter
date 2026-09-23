/** Qo'ng'iroq yozuvini tinglash (tizimga kirgan va shartnomani ko'ra oladigan foydalanuvchi). */
import { readFile } from 'node:fs/promises';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { fullAudioPath } from '@/lib/telephony/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Kirish talab qilinadi', { status: 401 });
  const id = Number((await ctx.params).id);
  const call = Number.isInteger(id) ? await prisma.callRecord.findUnique({ where: { id }, include: { contract: true } }) : null;
  if (!call || !call.audioPath) return new Response('Topilmadi', { status: 404 });
  if (!user.isAdmin && !(call.contract && user.tjmIds.includes(call.contract.tjmId))) return new Response("Ruxsat yo'q", { status: 403 });

  let buf: Buffer;
  try {
    buf = await readFile(fullAudioPath(call.audioPath));
  } catch {
    return new Response("Fayl o'chirilgan", { status: 410 });
  }
  const type = call.audioMime || 'audio/mpeg';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
    if (start >= buf.length || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buf.length}` } });
    return new Response(new Uint8Array(buf.subarray(start, end + 1)), {
      status: 206,
      headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Cache-Control': 'private, no-store' },
    });
  }
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(buf.length), 'Cache-Control': 'private, no-store' },
  });
}
