import Link from 'next/link';

export const metadata = { title: "Ruxsat yo'q" };

export default function ForbiddenPage() {
  return (
    <div className="panel">
      <div className="panel-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: 22 }}>Bu sahifaga ruxsat yo&apos;q</h1>
        <p className="muted" style={{ margin: '8px 0 20px' }}>
          Bu bo&apos;lim sizning rolingiz uchun yopiq.
        </p>
        <Link className="btn btn-primary" href="/">
          Dashboardga qaytish
        </Link>
      </div>
    </div>
  );
}
