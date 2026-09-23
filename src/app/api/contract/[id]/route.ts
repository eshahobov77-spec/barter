import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { buildContractDetail } from '@/lib/contractDetail';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Kirish talab qilinadi' }, { status: 401 });

  const { id } = await ctx.params;
  const contractId = Number(id);
  if (!Number.isInteger(contractId) || contractId <= 0) {
    return NextResponse.json({ error: "Noto'g'ri ID" }, { status: 400 });
  }

  const detail = await buildContractDetail(user, contractId);
  if (!detail) return NextResponse.json({ error: 'Shartnoma topilmadi' }, { status: 404 });

  return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
}
