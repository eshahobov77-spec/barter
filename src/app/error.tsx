'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="auth">
      <div className="panel auth-card" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Xatolik yuz berdi</h1>
        <p className="muted" style={{ margin: '8px 0 20px' }}>
          Sahifani qayta yuklab ko&apos;ring. Muammo takrorlansa, administratorga xabar bering.
        </p>
        <button className="btn btn-primary block" onClick={() => reset()}>
          Qayta urinish
        </button>
      </div>
    </div>
  );
}
