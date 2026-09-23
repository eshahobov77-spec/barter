import Link from 'next/link';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { contractScope, visibleTjms } from '@/lib/permissions';
import ContractForm from '@/components/ContractForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Yangi shartnoma' };

export default async function NewContractPage() {
  const user = await requireUser();
  const [tjms, materialsRaw] = await Promise.all([
    visibleTjms(user),
    prisma.contract.findMany({
      where: { ...contractScope(user), materialType: { not: '' } },
      select: { materialType: true },
      distinct: ['materialType'],
      orderBy: { materialType: 'asc' },
    }),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Yangi barter shartnomasi</h1>
          <p>Barterchi avval tizimda bo&apos;lsa, ismi bo&apos;yicha avtomatik bog&apos;lanadi.</p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/barterlar">
            Bekor qilish
          </Link>
        </div>
      </div>
      <ContractForm
        tjms={tjms.map((t) => ({ id: t.id, name: t.name }))}
        materials={materialsRaw.map((m) => m.materialType)}
        initial={{ materialGroup: 'material' }}
      />
    </>
  );
}
