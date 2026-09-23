import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { paymentWhere } from '@/lib/contractFilters';
import { exportPayments, xlsxFilename } from '@/lib/exports';
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

  const rows = await prisma.transaction.findMany({
    where: paymentWhere(user, f),
    include: { contract: { include: { supplier: true, tjm: true } }, createdBy: true },
    orderBy: { createdAt: 'desc' },
  });

  await logAction({ action: A.EXPORT, user, detail: `Tushumlar: ${rows.length} ta` });
  const buffer = await exportPayments(rows);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${xlsxFilename('tushumlar')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
