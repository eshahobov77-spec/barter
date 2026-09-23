import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kirish' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/');
  const sp = await searchParams;
  const nextRaw = typeof sp.next === 'string' ? sp.next : '/';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  return (
    <div className="auth">
      <div className="panel auth-card">
        <div className="brand">
          <span className="brand-mark">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m2 9 3-3 3 3" />
              <path d="M13 18H7a2 2 0 0 1-2-2V6" />
              <path d="m22 15-3 3-3-3" />
              <path d="M11 6h6a2 2 0 0 1 2 2v10" />
            </svg>
          </span>
          <span>
            <b>TXT Barter</b>
            <small>by Ezzyjon</small>
          </span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Tizimga kirish</h1>
        <p className="muted" style={{ margin: '4px 0 20px' }}>
          Login va parolingizni kiriting
        </p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
