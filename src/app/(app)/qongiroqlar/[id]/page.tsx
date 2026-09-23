import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RotateCcw, Trash2 } from 'lucide-react';
import prisma from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { contractScope } from '@/lib/permissions';
import { dmy, dmyhm, fmtSom, num, phoneFmt } from '@/lib/format';
import { deleteCallAction, linkCallAction, retryCallAction } from '@/actions/telephony';
import { CALL_STATUS, STAGE, dur } from '../shared';

export const dynamic = 'force-dynamic';
export const metadata = { title: "Qo'ng'iroq" };

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const c = await prisma.callRecord.findUnique({ where: { id }, include: { contract: { include: { supplier: true, tjm: true } } } });
  if (!c) notFound();
  if (!user.isAdmin && !(c.contract && user.tjmIds.includes(c.contract.tjmId))) notFound();

  // Bog'lash uchun nomzodlar: shu barterchining shartnomalari, bo'lmasa telefon bo'yicha
  const supplierIds = c.supplierId
    ? [c.supplierId]
    : c.clientPhone
      ? (await prisma.supplierPhone.findMany({ where: { phone: c.clientPhone }, select: { supplierId: true } })).map((r) => r.supplierId)
      : [];
  const options = await prisma.contract.findMany({
    where: { ...(supplierIds.length ? { supplierId: { in: supplierIds } } : { isClosed: false }), ...contractScope(user) },
    include: { tjm: true, supplier: true },
    orderBy: [{ isClosed: 'asc' }, { debtAmount: 'desc' }],
    take: supplierIds.length ? 50 : 300,
  });

  const [label, cls] = CALL_STATUS[c.status] || [c.status, 'plain'];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Qo&apos;ng&apos;iroq #{c.id}</h1>
          <p>
            {c.direction === 'in' ? 'Kiruvchi' : c.direction === 'out' ? 'Chiquvchi' : ''} · {dmyhm(c.startedAt || c.createdAt)} · {dur(c.durationSec)} ·{' '}
            {c.provider}
          </p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" href="/qongiroqlar">← Ro&apos;yxat</Link>
        </div>
      </div>

      <div className="two-col">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Xulosa</h2>
              <p>
                <span className={`badge ${cls}`}>{label}</span>
                {c.error && (
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {c.stage ? `${STAGE[c.stage] || c.stage}: ` : ''}
                    {c.error}
                  </span>
                )}
              </p>
            </div>
          </header>
          <div className="panel-body">
            <p style={{ fontSize: 15, lineHeight: 1.5 }}>{c.summary || <span className="faint">Hali tayyor emas</span>}</p>
            {c.promiseDate && (
              <div className="flash success" style={{ marginTop: 12 }}>
                🤝 Va&apos;da: <b>{dmy(c.promiseDate)}</b>
                {c.promiseWhat ? ` — ${c.promiseWhat}` : ''}
                {num(c.promiseAmount) ? ` (≈ ${fmtSom(c.promiseAmount)} so'm)` : ''}
              </div>
            )}
            {c.audioPath ? (
              <audio controls preload="none" src={`/api/telephony/audio/${c.id}`} style={{ width: '100%', marginTop: 14 }} />
            ) : (
              <p className="muted" style={{ marginTop: 14 }}>Audio fayl serverda yo&apos;q{c.audioUrl ? ' (hali yuklanmagan yoki muddati o‘tib o‘chirilgan)' : ''}.</p>
            )}
            <dl className="kv" style={{ marginTop: 16 }}>
              <dt>Barterchi raqami</dt>
              <dd>{phoneFmt(c.clientPhone) || '—'}</dd>
              <dt>Kimdan → kimga</dt>
              <dd>
                {phoneFmt(c.fromPhone) || '—'} → {phoneFmt(c.toPhone) || '—'}
              </dd>
              <dt>Provayder ID</dt>
              <dd className="code">{c.externalId}</dd>
            </dl>
            <div className="actions" style={{ marginTop: 16 }}>
              <form action={retryCallAction}>
                <input type="hidden" name="callId" value={c.id} />
                <button className="btn btn-ghost sm" type="submit">
                  <RotateCcw className="lucide" /> Qayta tahlil
                </button>
              </form>
              <form action={retryCallAction}>
                <input type="hidden" name="callId" value={c.id} />
                <input type="hidden" name="full" value="1" />
                <button className="btn btn-ghost sm" type="submit">
                  <RotateCcw className="lucide" /> Qaytadan matnga o&apos;girish
                </button>
              </form>
              {user.isAdmin && (
                <form action={deleteCallAction}>
                  <input type="hidden" name="callId" value={c.id} />
                  <button className="btn btn-danger sm" type="submit">
                    <Trash2 className="lucide" /> O&apos;chirish
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Shartnoma</h2>
              <p>{c.contract ? `№ ${c.contract.number} · ${c.contract.tjm.name} · ${c.contract.supplier.fullName}` : 'Hali bog‘lanmagan'}</p>
            </div>
          </header>
          <div className="panel-body">
            {c.contract && (
              <p style={{ marginBottom: 12 }}>
                <Link className="link" href={`/barterlar?open=${c.contract.id}`}>Shartnomani ochish →</Link>
                {c.noteId ? <span className="muted"> · izoh yozilgan</span> : null}
              </p>
            )}
            <form action={linkCallAction} className="form-grid">
              <input type="hidden" name="callId" value={c.id} />
              <div className="field wide">
                <label htmlFor="contractId">{c.contract ? 'Boshqa shartnomaga ko‘chirish' : 'Shartnomaga bog‘lash'}</label>
                <select name="contractId" id="contractId" defaultValue={c.contractId ?? ''} required>
                  <option value="">— tanlang —</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      № {o.number} · {o.tjm.name} · {o.supplier.fullName}
                      {o.isClosed ? ' (yopilgan)' : ''}
                    </option>
                  ))}
                </select>
                <small className="help">Izoh (va&apos;da bilan) tanlangan shartnomaga ko&apos;chadi yoki yaratiladi</small>
              </div>
              <div className="form-actions wide">
                <button className="btn btn-primary" type="submit">Saqlash</button>
              </div>
            </form>
          </div>
        </section>
      </div>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Suhbat matni</h2>
            <p>Avtomatik transkripsiya — so&apos;zlarda xato bo&apos;lishi mumkin</p>
          </div>
        </header>
        <div className="panel-body">
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{c.transcript || <span className="faint">Hali yo&apos;q</span>}</p>
        </div>
      </section>
    </>
  );
}
