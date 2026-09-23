import Link from 'next/link';

export const metadata = { title: 'Topilmadi' };

export default function NotFound() {
  return (
    <div className="auth">
      <div className="panel auth-card" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Sahifa topilmadi</h1>
        <p className="muted" style={{ margin: '8px 0 20px' }}>
          Manzil noto&apos;g&apos;ri yoki yozuv o&apos;chirilgan.
        </p>
        <Link className="btn btn-primary block" href="/">
          Dashboardga qaytish
        </Link>
      </div>
    </div>
  );
}
