import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import Shell from '@/components/Shell';
import ContractModalProvider from '@/components/ContractModal';
import AutoOpenContract from '@/components/AutoOpenContract';
import { dmy } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <ContractModalProvider>
      <Suspense fallback={null}>
        <AutoOpenContract />
      </Suspense>
      <Shell
        user={{
          displayName: user.displayName,
          roleLabel: user.isAdmin ? 'Admin' : 'Menejer',
          isAdmin: user.isAdmin,
          mustChangePassword: user.mustChangePassword,
        }}
        today={dmy(new Date())}
      >
        {children}
      </Shell>
    </ContractModalProvider>
  );
}
