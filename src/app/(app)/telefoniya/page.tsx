import { headers } from 'next/headers';
import prisma from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { loadTelSettings } from '@/lib/telephony/auth';
import { DEFAULT_MAPPINGS } from '@/lib/telephony/normalize';
import { dmyhm } from '@/lib/format';
import { clearInboxAction } from '@/actions/telephony';
import TelephonyForm, { TokenPanel } from './TelephonyForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'IP-telefoniya' };

function mask(v: string) {
  return v ? `${v.slice(0, 4)}••••${v.slice(-3)}` : '';
}

export default async function TelephonyPage() {
  await requireAdmin();
  const s = await loadTelSettings();
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'SERVER';
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'http');
  const base = `${proto}://${host}`;

  const [inbox, counts] = await Promise.all([
    prisma.telephonyInbox.findMany({ orderBy: { id: 'desc' }, take: 30 }),
    prisma.callRecord.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const cnt = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>IP-telefoniya</h1>
          <p>Qo&apos;ng&apos;iroq yozuvlarini qabul qilish, matnga o&apos;girish va AI xulosasi</p>
        </div>
        <div className="actions">
          {s.enabled ? <span className="badge ok">Yoqilgan</span> : <span className="badge warn">O&apos;chirilgan</span>}
        </div>
      </div>

      <div className="kpis">
        {[
          ['Tayyor', cnt.done || 0],
          ['Navbatda', (cnt.received || 0) + (cnt.waiting_audio || 0)],
          ["O'tkazilgan", cnt.skipped || 0],
          ['Xato', cnt.failed || 0],
        ].map(([label, v]) => (
          <div className="stat" key={String(label)}>
            <small>{label}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>

      <TokenPanel base={base} hint={s.tokenHint} />

      <TelephonyForm
        s={{
          enabled: s.enabled,
          autoNote: s.autoNote,
          ownNumbers: s.ownNumbers,
          sttUrl: s.sttUrl,
          sttKeyMask: mask(s.sttKey),
          sttModel: s.sttModel,
          sttLanguage: s.sttLanguage,
          llmProvider: s.llmProvider,
          llmUrl: s.llmUrl,
          llmKeyMask: mask(s.llmKey),
          llmModel: s.llmModel,
          hmacMask: mask(s.hmacSecret),
          zadarmaKeyMask: mask(s.zadarmaKey),
          zadarmaSecretMask: mask(s.zadarmaSecret),
          minDurationSec: s.minDurationSec,
          maxMb: s.maxMb,
          keepDays: s.keepDays,
          mappings: s.mappings ? JSON.stringify(s.mappings, null, 2) : '',
          defaults: JSON.stringify({ onlinepbx: DEFAULT_MAPPINGS.onlinepbx, beeline: DEFAULT_MAPPINGS.beeline }, null, 2),
        }}
      />

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Kelgan so&apos;rovlar</h2>
            <p>Provayder aynan nima yuborayotganini ko&apos;rish va maydonlarni moslashtirish uchun (oxirgi 30 ta, maxfiy qiymatlar yashirilgan)</p>
          </div>
          <form action={clearInboxAction}>
            <button className="btn btn-ghost sm" type="submit">Tozalash</button>
          </form>
        </header>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Manba</th>
                <th>Natija</th>
                <th>Tana</th>
              </tr>
            </thead>
            <tbody>
              {inbox.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">Hali so&apos;rov kelmagan</td>
                </tr>
              )}
              {inbox.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{dmyhm(r.createdAt)}</td>
                  <td className="nowrap">
                    {r.provider}
                    <br />
                    <small className="muted">{r.ip}</small>
                  </td>
                  <td>
                    <span className={`badge ${r.ok ? 'ok' : 'bad'}`}>{r.ok ? 'OK' : 'Xato'}</span>
                    <br />
                    <small className="muted">{r.message}</small>
                  </td>
                  <td>
                    <details>
                      <summary className="muted" style={{ cursor: 'pointer' }}>
                        {r.contentType.split(';')[0] || '—'} · {r.body.length} belgi
                      </summary>
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 260, overflow: 'auto', fontSize: 12 }}>{r.body}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
