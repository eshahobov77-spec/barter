'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save, PlugZap, Send } from 'lucide-react';
import {
  saveBotSettingsAction,
  sendReportAction,
  testBotAction,
  type BotState,
} from '@/actions/bot';
import { WEEKDAYS } from '@/lib/constants';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      <Save className="lucide" />
      {pending ? 'Saqlanmoqda…' : 'Saqlash'}
    </button>
  );
}

export type BotSettingsData = {
  hasToken: boolean;
  maskedToken: string;
  chatIds: string;
  dailyEnabled: boolean;
  dailyTime: string;
  weeklyEnabled: boolean;
  weeklyDay: number;
  notifyPayments: boolean;
  notifyNew: boolean;
  notifyClosed: boolean;
  commandsEnabled: boolean;
  lastDailySent: string;
  lastWeeklySent: string;
};

export default function BotSettingsForm({ s }: { s: BotSettingsData }) {
  const [state, formAction] = useActionState<BotState, FormData>(saveBotSettingsAction, {});
  const [msg, setMsg] = useState<BotState>({});
  const [busy, setBusy] = useState('');

  async function runTest() {
    setBusy('test');
    setMsg({});
    setMsg(await testBotAction());
    setBusy('');
  }

  async function runSend(kind: string) {
    setBusy(kind);
    setMsg({});
    setMsg(await sendReportAction(kind));
    setBusy('');
  }

  const note = state?.error || msg.error || state?.message || msg.message;
  const noteError = !!(state?.error || msg.error);

  return (
    <>
      {note && <div className={`flash ${noteError ? 'error' : 'success'}`}>{note}</div>}
      <div className="two-col">
        <form action={formAction} className="panel">
          <header className="panel-head">
            <div>
              <h2>Ulanish</h2>
              <p>Token @BotFather dan olinadi</p>
            </div>
          </header>
          <div className="panel-body">
            <div className="form-grid">
              <div className="field wide">
                <label htmlFor="id_token">Bot token</label>
                <input
                  type="password"
                  name="token"
                  id="id_token"
                  autoComplete="off"
                  placeholder={s.hasToken ? s.maskedToken : '123456789:AA...'}
                />
                <small className="help">
                  {s.hasToken
                    ? "Bo'sh qoldirsangiz, avvalgi token saqlanib qoladi."
                    : '@BotFather → /newbot'}
                </small>
              </div>
              <div className="field wide">
                <label htmlFor="chatIds">Chat ID lar</label>
                <input type="text" name="chatIds" id="chatIds" defaultValue={s.chatIds} />
                <small className="help">
                  Vergul bilan ajrating: admin chat va guruh chat. Masalan: 5655089221,
                  -1001234567890
                </small>
              </div>
            </div>

            <h3 style={{ fontSize: 14, margin: '22px 0 10px' }}>Rejali hisobotlar</h3>
            <div className="form-grid">
              <div className="field">
                <label className="check-box">
                  <input type="checkbox" name="dailyEnabled" defaultChecked={s.dailyEnabled} />
                  <span>Kunlik hisobot</span>
                </label>
              </div>
              <div className="field">
                <label htmlFor="dailyTime">Yuborish vaqti</label>
                <input type="time" name="dailyTime" id="dailyTime" defaultValue={s.dailyTime} />
              </div>
              <div className="field">
                <label className="check-box">
                  <input type="checkbox" name="weeklyEnabled" defaultChecked={s.weeklyEnabled} />
                  <span>Haftalik hisobot</span>
                </label>
              </div>
              <div className="field">
                <label htmlFor="weeklyDay">Haftalik hisobot kuni</label>
                <select name="weeklyDay" id="weeklyDay" defaultValue={String(s.weeklyDay)}>
                  {WEEKDAYS.map(([v, label]) => (
                    <option key={v} value={String(v)}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <h3 style={{ fontSize: 14, margin: '22px 0 10px' }}>Darhol xabarlar va buyruqlar</h3>
            <div className="form-grid">
              <div className="field">
                <label className="check-box">
                  <input type="checkbox" name="notifyPayments" defaultChecked={s.notifyPayments} />
                  <span>Har bir tushum haqida xabar</span>
                </label>
              </div>
              <div className="field">
                <label className="check-box">
                  <input type="checkbox" name="notifyNew" defaultChecked={s.notifyNew} />
                  <span>Yangi shartnoma qo&apos;shilganda xabar</span>
                </label>
              </div>
              <div className="field">
                <label className="check-box">
                  <input type="checkbox" name="notifyClosed" defaultChecked={s.notifyClosed} />
                  <span>Shartnoma yopilganda xabar</span>
                </label>
              </div>
              <div className="field wide">
                <label className="check-box">
                  <input type="checkbox" name="commandsEnabled" defaultChecked={s.commandsEnabled} />
                  <span>Bot buyruqlari (/bugun, /hafta, /qarz)</span>
                </label>
              </div>
            </div>

            <div className="form-actions">
              <Submit />
            </div>
          </div>
        </form>

        <div>
          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>Tekshirish va yuborish</h2>
                <p>Saqlangan sozlamalar bilan ishlaydi</p>
              </div>
            </header>
            <div className="panel-body">
              <div className="actions">
                <button className="btn btn-ghost" type="button" onClick={runTest} disabled={!!busy}>
                  <PlugZap className="lucide" />
                  {busy === 'test' ? 'Yuborilmoqda…' : 'Test xabari'}
                </button>
                {(
                  [
                    ['kunlik', 'Kunlik hisobot'],
                    ['haftalik', 'Haftalik hisobot'],
                    ['qarz', 'TJM qarzlari'],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => runSend(kind)}
                    disabled={!!busy}
                  >
                    <Send className="lucide" />
                    {busy === kind ? 'Yuborilmoqda…' : label}
                  </button>
                ))}
              </div>
              <dl className="kv" style={{ marginTop: 18 }}>
                <dt>Oxirgi kunlik hisobot</dt>
                <dd>{s.lastDailySent || '—'}</dd>
                <dt>Oxirgi haftalik hisobot</dt>
                <dd>{s.lastWeeklySent || '—'}</dd>
              </dl>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>Qanday ishlaydi</h2>
              </div>
            </header>
            <div className="panel-body">
              <ul className="list-plain">
                <li>
                  Serverda bot jarayoni doimiy ishlab turadi: <span className="code">npm run bot</span>{' '}
                  (Docker&apos;da <span className="code">bot</span> servisi).
                </li>
                <li>
                  Kunlik hisobot har kuni belgilangan vaqtda, haftalik esa tanlangan kuni o&apos;sha
                  vaqtda yuboriladi.
                </li>
                <li>
                  Yangi shartnoma, tushum va shartnoma yopilishi haqida xabar darhol yuboriladi.
                </li>
                <li>
                  Chat ID ni bilish uchun botga <span className="code">/id</span> yozing (guruhda ham
                  ishlaydi).
                </li>
                <li>Guruhga yuborish uchun botni guruhga qo&apos;shing; guruh ID si minus bilan boshlanadi.</li>
                <li>
                  Buyruqlar: <span className="code">/bugun</span> <span className="code">/kecha</span>{' '}
                  <span className="code">/hafta</span> <span className="code">/qarz</span>{' '}
                  <span className="code">/qarz Crystal</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
