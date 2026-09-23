'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Phone, FileText, CircleCheck, CalendarClock, ArrowDownLeft, Coins,
  MessageSquare, Banknote, Lock, LockOpen, Send, Check, Trash2, Pencil,
  FileInput, Users, FileSpreadsheet,
} from 'lucide-react';
import {
  addNoteAction,
  addPaymentAction,
  closeContractAction,
  deletePaymentAction,
  reopenContractAction,
} from '@/actions/contract';
import { CLOSE_REASON_CHOICES, NOTE_KIND_CHOICES, TX_KIND_CHOICES } from '@/lib/constants';
import MoneyInput from './MoneyInput';

type Tab = 'izoh' | 'tolov' | 'yopish';
type Hist = 'all' | 't' | 'n';

function noteIcon(kind: string) {
  if (kind === 'qongiroq' || kind === 'javobsiz') return <Phone className="lucide" />;
  if (kind === 'uchrashuv') return <Users className="lucide" />;
  if (kind === 'import') return <FileSpreadsheet className="lucide" />;
  return <MessageSquare className="lucide" />;
}

export default function ContractDetailView({
  detail: c,
  onChanged,
  onOpenOther,
}: {
  detail: any;
  onChanged: () => void;
  onOpenOther: (id: number) => void;
}) {
  const [tab, setTab] = useState<Tab>('izoh');
  const [hist, setHist] = useState<Hist>('all');
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  // Saqlangach formalarni qayta quramiz (nazorat qilinadigan maydonlar ham tozalansin)
  const [formKey, setFormKey] = useState(0);

  async function run(fn: (fd: FormData) => Promise<any>, form: HTMLFormElement, nextTab?: Tab) {
    setPending(true);
    setError('');
    setFlash('');
    try {
      const res = await fn(new FormData(form));
      if (res?.ok) {
        setFlash(res.flash || 'Saqlandi.');
        if (nextTab) setTab(nextTab);
        setFormKey((k) => k + 1);
        onChanged();
      } else {
        setError(res?.error || 'Xato yuz berdi.');
      }
    } catch (e: any) {
      setError(e?.message || 'Xato yuz berdi.');
    } finally {
      setPending(false);
    }
  }

  const historyShown = c.history.filter((h: any) => hist === 'all' || h.type === hist);

  return (
    <div className="detail">
      <header className="detail-head">
        <div>
          <h2>{c.supplierName}</h2>
          <div className="chips">
            <span className="chip">№ {c.number}</span>
            <span className="chip">{c.tjmName}</span>
            {c.materialType && (
              <span className="chip accent">
                {c.materialType} · {c.materialGroupLabel}
              </span>
            )}
            {c.isClosed ? (
              <span className="badge">Yopilgan</span>
            ) : c.supplyStatus ? (
              <span className={`badge st-${c.supplyStatus}`}>{c.supplyStatusLabel}</span>
            ) : null}
          </div>
        </div>
        <div className="balances">
          <div className={`balance neutral${c.remaining <= 0 ? ' zero' : ''}`}>
            <b>{c.remainingLabel}</b>
            <small>Qoldiq summa, so&apos;m</small>
          </div>
          <div className={`balance${c.debt <= 0 ? ' zero' : ''}`}>
            <b>{c.debtLabel}</b>
            <small>Qarzdorlik (grafik bo&apos;yicha)</small>
          </div>
        </div>
      </header>

      {flash && <div className="flash success" style={{ marginTop: 16 }}>{flash}</div>}
      {error && <div className="flash error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="info-grid">
        <div className="info">
          <small><Phone className="lucide" />Telefon</small>
          <b>
            {c.phones.length === 0
              ? '—'
              : c.phones.map((p: any, i: number) => (
                  <span key={p.raw}>
                    <a href={`tel:${p.raw}`}>{p.pretty}</a>
                    {i < c.phones.length - 1 && <br />}
                  </span>
                ))}
          </b>
        </div>
        <div className="info">
          <small><FileText className="lucide" />Umumiy summa</small>
          <b>{c.totalLabel}</b>
          <span className="faint">
            {c.contractDateLabel ? `${c.contractDateLabel} dagi shartnoma` : "sana ko'rsatilmagan"}
          </span>
        </div>
        <div className="info">
          <small><CircleCheck className="lucide" />Yopilgan qism</small>
          <b className="green">{c.paidLabel}</b>
          <div className="bar thin green"><span style={{ width: `${c.paidPercent}%` }} /></div>
        </div>
        <div className="info">
          <small><CalendarClock className="lucide" />Qarzdorlik tarixi</small>
          <b>{c.monthlyLabel || '—'}</b>
          <span className="faint">
            {c.monthlyLabel ? (
              <>
                {c.debtSetAtLabel ? `${c.debtSetAtLabel} holatiga` : 'belgilangan'}
                {c.debtPaidLabel ? `, keyin ${c.debtPaidLabel} yopildi` : ''}
              </>
            ) : (
              "grafik bo'yicha qarz yo'q"
            )}
          </span>
        </div>
        <div className="info">
          <small><ArrowDownLeft className="lucide" />Oxirgi tushum</small>
          <b>{c.lastPaymentLabel || '—'}</b>
          <span className="faint">
            {c.lastPaymentLabel
              ? c.daysSincePayment === 0
                ? 'bugun'
                : `${c.daysSincePayment} kun oldin`
              : 'tizimda hali kiritilmagan'}
          </span>
        </div>
        <div className="info">
          <small><Coins className="lucide" />Tizimda kiritilgan</small>
          <b>{c.realSumLabel}</b>
          <span className="faint">boshlang&apos;ich chekdan tashqari</span>
        </div>
      </div>

      <div className="tabbox">
        <div className="tabs" role="tablist">
          <button type="button" className={tab === 'izoh' ? 'active' : ''} onClick={() => setTab('izoh')}>
            <MessageSquare className="lucide" />Izoh
          </button>
          <button type="button" className={tab === 'tolov' ? 'active' : ''} onClick={() => setTab('tolov')}>
            <Banknote className="lucide" />Tushum
          </button>
          <button type="button" className={tab === 'yopish' ? 'active' : ''} onClick={() => setTab('yopish')}>
            <Lock className="lucide" />Yopish
          </button>
        </div>

        {/* ------------------------------------------------------- IZOH */}
        <div hidden={tab !== 'izoh'}>
          <form
            key={`note-${formKey}`}
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(addNoteAction, e.currentTarget);
            }}
          >
            <input type="hidden" name="contractId" value={c.id} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="note-kind">Turi</label>
                <select id="note-kind" name="kind" defaultValue="qongiroq">
                  {NOTE_KIND_CHOICES.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" type="submit" disabled={pending}>
                  <Send className="lucide" />Izohni saqlash
                </button>
              </div>
              <div className="field wide">
                <label htmlFor="note-text">Izoh</label>
                <textarea id="note-text" name="text" rows={3} placeholder="Izoh yozing…" />
              </div>
            </div>
          </form>
        </div>

        {/* ------------------------------------------------------ TUSHUM */}
        <div hidden={tab !== 'tolov'}>
          {c.isClosed ? (
            <div className="notice">
              Shartnoma yopilgan, tushum kiritib bo&apos;lmaydi.
              {c.isAdmin && ' Kerak bo’lsa «Yopish» tabidan qayta oching.'}
            </div>
          ) : (
            <form
              key={`pay-${formKey}`}
              onSubmit={(e) => {
                e.preventDefault();
                run(addPaymentAction, e.currentTarget, 'tolov');
              }}
            >
              <input type="hidden" name="contractId" value={c.id} />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="pay-amount">Summa (so&apos;m)</label>
                  <MoneyInput id="pay-amount" name="amount" autoComplete="off" required />
                </div>
                <div className="field">
                  <label htmlFor="pay-kind">Turi</label>
                  <select id="pay-kind" name="kind" defaultValue="material">
                    {TX_KIND_CHOICES.map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pay-date">Sana</label>
                  <input id="pay-date" type="date" name="operationDate" defaultValue={c.today} max={c.today} />
                </div>
                <div className="field">
                  <label htmlFor="pay-note">Izoh</label>
                  <input
                    id="pay-note"
                    type="text"
                    name="note"
                    maxLength={255}
                    placeholder="Masalan: 20 tonna sement, 16.09 yuk xati"
                  />
                </div>
                <div className="field">
                  <label className="check-box">
                    <input type="checkbox" name="closeIfZero" defaultChecked />
                    <span>Qoldiq 0 bo&apos;lsa, shartnomani yopish</span>
                  </label>
                </div>
                <div className="field" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-success" type="submit" disabled={pending}>
                    <Check className="lucide" />Tushumni saqlash
                  </button>
                </div>
              </div>
              <p className="faint" style={{ marginTop: 10, fontSize: 12 }}>
                Maksimal summa: {c.remainingLabel} so&apos;m. Tushum avval qarzdorlikni
                {c.debt ? ` (${c.debtLabel} so'm)` : ''} yopadi, qoldiq summa esa har doim kamayadi.
              </p>
            </form>
          )}
        </div>

        {/* ------------------------------------------------------ YOPISH */}
        <div hidden={tab !== 'yopish'}>
          <div className="close-summary">
            <div className="info"><small>Umumiy</small><b>{c.totalLabel}</b></div>
            <div className="info"><small>Yopilgan</small><b className="green">{c.paidLabel}</b></div>
            <div className="info">
              <small>Qoldiq</small>
              <b className={c.remaining > 0 ? 'red' : 'green'}>{c.remainingLabel}</b>
            </div>
            <div className="info">
              <small>Qarzdorlik</small>
              <b className={c.debt > 0 ? 'red' : 'green'}>{c.debtLabel}</b>
            </div>
          </div>

          {c.isClosed ? (
            <>
              <div className="notice">
                <b>{c.closeReasonLabel}</b>
                <br />
                {c.closedAtLabel || 'Importda yopilgan'}
                {c.closedByName ? ` · ${c.closedByName}` : ''}
                {c.closeNote && (
                  <>
                    <br />
                    {c.closeNote}
                  </>
                )}
              </div>
              {c.isAdmin && (
                <form
                  style={{ marginTop: 12 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!confirm('Shartnomani qayta ochasizmi?')) return;
                    run(reopenContractAction, e.currentTarget, 'tolov');
                  }}
                >
                  <input type="hidden" name="contractId" value={c.id} />
                  <button className="btn btn-ghost" type="submit" disabled={pending}>
                    <LockOpen className="lucide" />Qayta ochish
                  </button>
                </form>
              )}
            </>
          ) : (
            <form
              key={`close-${formKey}-${c.remaining <= 0 ? 'z' : 'r'}`}
              onSubmit={(e) => {
                e.preventDefault();
                if (!confirm("Shartnomani yopib, arxivga o'tkazasizmi?")) return;
                run(closeContractAction, e.currentTarget, 'yopish');
              }}
            >
              <input type="hidden" name="contractId" value={c.id} />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="close-reason">Sabab</label>
                  <select
                    id="close-reason"
                    name="reason"
                    defaultValue={c.remaining <= 0 ? 'bajarildi' : 'uy_qaytarildi'}
                  >
                    {CLOSE_REASON_CHOICES.map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-danger" type="submit" disabled={pending}>
                    <Lock className="lucide" />Shartnomani yopish
                  </button>
                </div>
                <div className="field wide">
                  <label htmlFor="close-note">Izoh</label>
                  <textarea id="close-note" name="note" rows={2} />
                </div>
              </div>
              <p className="faint" style={{ marginTop: 10, fontSize: 12 }}>
                «Majburiyat bajarildi» faqat qoldiq 0 bo&apos;lganda tanlanadi. Uy qaytarilgan yoki
                shartnoma bekor bo&apos;lsa, sababini izohda yozing — qoldiq qarz hisobotlardan chiqadi.
              </p>
            </form>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------- TARIX */}
      <div className="history">
        <div className="subtabs">
          <button type="button" className={hist === 'all' ? 'active' : ''} onClick={() => setHist('all')}>
            Barcha tarix ({c.history.length})
          </button>
          <button type="button" className={hist === 't' ? 'active' : ''} onClick={() => setHist('t')}>
            Tushumlar ({c.txCount})
          </button>
          <button type="button" className={hist === 'n' ? 'active' : ''} onClick={() => setHist('n')}>
            Izohlar
          </button>
        </div>
        <ul className="feed">
          {historyShown.length === 0 && (
            <li><div className="body muted">Tarix bo&apos;sh.</div></li>
          )}
          {historyShown.map((h: any) =>
            h.type === 't' ? (
              <li key={`t${h.id}`}>
                <span className={`ico${h.isOpening ? ' opening' : ''}`}>
                  {h.isOpening ? <FileInput className="lucide" /> : <ArrowDownLeft className="lucide" />}
                </span>
                <div className="body">
                  <div className="title">{h.kindLabel}</div>
                  {h.text && <div className="sub">{h.text}</div>}
                  <div className="meta">
                    {h.author} · sana {h.operationDateLabel} · kiritildi {h.createdAtLabel}
                  </div>
                </div>
                <div className="side">
                  <span className="amount">−{h.amountLabel}</span>
                  {c.isAdmin && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (
                          !confirm(
                            `${h.amountLabel} so'mlik yozuvni o'chirasizmi? Qoldiq qarz shu summaga ko'payadi.`,
                          )
                        )
                          return;
                        run(deletePaymentAction, e.currentTarget, 'tolov');
                      }}
                    >
                      <input type="hidden" name="txnId" value={h.id} />
                      <button
                        className="btn btn-danger sm icon"
                        type="submit"
                        title="O'chirish"
                        aria-label="O'chirish"
                        disabled={pending}
                      >
                        <Trash2 className="lucide" />
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ) : (
              <li key={`n${h.id}`}>
                <span className={`ico ${h.kind === 'import' ? 'import' : 'note'}`}>{noteIcon(h.kind)}</span>
                <div className="body">
                  <div className="title">{h.kindLabel}</div>
                  {h.text && <div className="sub" style={{ whiteSpace: 'pre-line' }}>{h.text}</div>}
                  {h.promiseLabel && (
                    <div className="sub">
                      <span className="badge accent">🤝 Va&apos;da: {h.promiseLabel}</span>
                    </div>
                  )}
                  <div className="meta">
                    {h.author} · {h.createdAtLabel}
                    {h.callId ? (
                      <>
                        {' · '}
                        <a className="link" href={`/qongiroqlar/${h.callId}`}>
                          🎧 yozuv va matn
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      </div>

      <footer className="detail-foot">
        <div className="chips">
          {c.otherContracts.map((o: any) => (
            <button
              key={o.id}
              type="button"
              className="chip"
              title="Shu barterchining boshqa shartnomasi"
              onClick={() => onOpenOther(o.id)}
            >
              {o.tjmName} · {o.number} · {o.remainingShort}
            </button>
          ))}
        </div>
        <Link className="btn btn-ghost sm" href={`/barterlar/${c.id}/tahrir`}>
          <Pencil className="lucide" />
          Tahrirlash
        </Link>
      </footer>
    </div>
  );
}
