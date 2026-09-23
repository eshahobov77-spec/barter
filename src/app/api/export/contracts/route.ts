import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { CONTRACT_SORTS, contractOrder, contractWhere } from '@/lib/contractFilters';
import { exportContracts, xlsxFilename } from '@/lib/exports';
import { logAction } from '@/lib/audit';
import { A } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Kirish talab qilinadi', { status: 401 });

  const sp = new URL(req.url).searchParams;
  const f: Record<string, string> = {};
  sp.forEach((v, k) => {
    f[k] = v;
  });
  const sort = CONTRACT_SORTS[f.sort] ? f.sort : '-remaining_amount';
  const where = contractWhere(user, f);

  const rows = await prisma.contract.findMany({
    where,
    include: { supplier: { include: { phones: { orderBy: { id: 'asc' } } } }, tjm: true },
    orderBy: contractOrder(sort) as any,
  });

  await logAction({ action: A.EXPORT, user, detail: `Barterlar ro'yxati: ${rows.length} ta` });
  const buffer = await exportContracts(rows);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${xlsxFilename('barterlar')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
