import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { contractScope, visibleTjms } from '@/lib/permissions';
import { isoDateTime, num } from '@/lib/format';
import ContractForm from '@/components/ContractForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shartnomani tahrirlash' };

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const contractId = Number(id);
  if (!Number.isInteger(contractId)) notFound();

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, ...contractScope(user) },
    include: { supplier: { include: { phones: { orderBy: { id: 'asc' } } } }, tjm: true },
  });
  if (!contract) notFound();

  const [tjms, materialsRaw] = await Promise.all([
    visibleTjms(user),
    prisma.contract.findMany({
      where: { ...contractScope(user), materialType: { not: '' } },
      select: { materialType: true },
      distinct: ['materialType'],
      orderBy: { materialType: 'asc' },
    }),
  ]);

  const money = (v: any) => {
    const n = num(v);
    return n ? String(Math.round(n)) : '';
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Shartnomani tahrirlash</h1>
          <p>
            № {contract.number} · {contract.tjm.name}. Summalar o&apos;zgarsa qoldiq qayta
            hisoblanadi.
          </p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/barterlar">
            Bekor qilish
          </Link>
        </div>
      </div>
      <ContractForm
        editId={contract.id}
        tjms={tjms.map((t) => ({ id: t.id, name: t.name }))}
        materials={materialsRaw.map((m) => m.materialType)}
        initial={{
          supplierName: contract.supplier.fullName,
          phones: contract.supplier.phones.map((p) => p.phone).join(', '),
          tjmId: String(contract.tjmId),
          number: contract.number,
          contractDate: contract.contractDate ? isoDateTime(contract.contractDate) : '',
          totalAmount: money(contract.totalAmount),
          monthlyAmount: money(contract.debtAmount),
          materialType: contract.materialType,
          materialGroup: contract.materialGroup,
          supplyStatus: contract.supplyStatus,
        }}
      />
    </>
  );
}
