/** GET /api/telephony/calls/:id — ishlov holati va natija (token bilan). */
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { checkToken, loadTelSettings } from '@/lib/telephony/auth';
import { isoDate, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await loadTelSettings();
  if (!checkToken(req, s)) return NextResponse.json({ error: "Token noto'g'ri" }, { status: 401 });
  const id = Number((await ctx.params).id);
  const c = Number.isInteger(id) ? await prisma.callRecord.findUnique({ where: { id }, include: { contract: { include: { tjm: true } } } }) : null;
  if (!c) return NextResponse.json({ error: 'Topilmadi' }, { status: 404 });
  return NextResponse.json({
    id: c.id, provider: c.provider, call_id: c.externalId, status: c.status, stage: c.stage, error: c.error || null,
    client_phone: c.clientPhone || null, duration: c.durationSec,
    contract: c.contract ? { id: c.contract.id, number: c.contract.number, tjm: c.contract.tjm.name } : null,
    transcript: c.transcript || null, summary: c.summary || null,
    promise: c.promiseDate ? { date: isoDate(c.promiseDate), what: c.promiseWhat, amount: num(c.promiseAmount) } : null,
    note_id: c.noteId,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
