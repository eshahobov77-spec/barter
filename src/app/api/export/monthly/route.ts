import { getCurrentUser } from '@/lib/auth';
import { monthlyReport } from '@/lib/selectors';
import { parseMonth } from '@/lib/dates';
import { exportMonthly, xlsxFilename } from '@/lib/exports';
import { logAction } from '@/lib/audit';
import { A } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Kirish talab qilinadi', { status: 401 });

  const sp = new URL(req.url).searchParams;
  const now = new Date();
  const picked = parseMonth(sp.get('oy')) || { year: now.getFullYear(), month: now.getMonth() + 1 };
  const report = await monthlyReport(user, picked.year, picked.month);

  await logAction({ action: A.EXPORT, user, detail: `Oylik hisobot ${report.key}` });
  const buffer = await exportMonthly(report);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${xlsxFilename('oylik_hisobot', report.key)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
