import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import ImportForm from './ImportForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Excel import' };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Excel import</h1>
          <p>Asl txt_barter.xlsx yoki tozalangan fayl (Import varag&apos;i) qabul qilinadi</p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/barterlar">
            Barterlarga qaytish
          </Link>
        </div>
      </div>
      <ImportForm />
    </>
  );
}
