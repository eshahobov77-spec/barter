'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save, Eye, BellRing } from 'lucide-react';
import {
  saveSupplierBotAction,
  previewRemindersAction,
  sendRemindersNowAction,
  type BotState,
  type ReminderPreviewState,
} from '@/actions/bot';

const KIND: Record<string, string> = {
  oldin: 'Muddatdan oldin',
  bugun: 'Muddat kuni',
  otgan: "Muddat o'tgan",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      <Save className="lucide" />
      {pending ? 'Saqlanmoqda…' : 'Saqlash'}
    </button>
  );
}

export type SupplierBotData = {
  supplierBotEnabled: boolean;
  remindEnabled: boolean;
  remindDueDay: number;
  remindDaysBefore: number;
  remindOverdueEvery: number;
  remindTime: string;
  supportPhone: string;
  lastRemindRun: string;
  nextDue: string;
};

function fmt(v: number) {
  return Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function SupplierBotForm({ s }: { s: SupplierBotData }) {
  const [state, formAction] = useActionState<BotState, FormData>(saveSupplierBotAction, {});
  const [res, setRes] = useState<ReminderPreviewState>({});
  const [busy, setBusy] = useState('');

  async function preview() {
    setBusy('preview');
    setRes({});
    setRes(await previewRemindersAction());
    setBusy('');
  }

  async function sendNow() {
    if (!confirm("Bugungi eslatmalar barterchilarga hozir yuborilsinmi? (Bugun yuborilganlari takrorlanmaydi)")) return;
    setBusy('send');
    setRes({});
    setRes(await sendRemindersNowAction());
    setBusy('');
  }

  const note = state?.error || res.error || state?.message || res.message;
  const noteError = !!(state?.error || res.error);
  const rows = res.run?.preview || [];

  return (
    <>
      {note && <div className={`flash ${noteError ? 'error' : 'success'}`}>{note}</div>}
      <div className="two-col">
        <form action={formAction} className="panel">
          <header className="panel-head">
            <div>
              <h2>Barterchilar boti va eslatmalar</h2>
              <p>Barterchi o&apos;z shartnomasini ko&apos;radi, muddat yaqinlashganda eslatma oladi</p>
            </div>
          </header>
          <div className="panel-body">
            <div className="form-grid">
              <div className="field wide">
                <label className="check-box">
                  <input type="checkbox" name="supplierBotEnabled" defaultChecked={s.supplierBotEnabled} />
                  <span>Barterchilar botga kira olsin (qoldiq, sverka, PDF akt)</span>
                </label>
              </div>
              <div className="field wide">
                <label className="check-box">
                  <input type="checkbox" name="remindEnabled" defaultChecked={s.remindEnabled} />
                  <span>Muddat eslatmalarini avtomatik yuborish</span>
                </label>
              </div>
              <div className="field">
                <label htmlFor="remindDueDay">Topshirish muddati — har oyning</label>
                <input type="number" min={1} max={31} name="remindDueDay" id="remindDueDay" defaultValue={s.remindDueDay} />
                <small className="help">-sanasigacha. Oy qisqa bo&apos;lsa — oyning oxirgi kuni.</small>
              </div>
              <div className="field">
                <label htmlFor="remindTime">Eslatma yuborish vaqti</label>
                <input type="time" name="remindTime" id="remindTime" defaultValue={s.remindTime} />
              </div>
              <div className="field">
                <label htmlFor="remindDaysBefore">Necha kun oldin eslatilsin</label>
                <input
                  type="number"
                  min={0}
                  max={15}
                  name="remindDaysBefore"
                  id="remindDaysBefore"
                  defaultValue={s.remindDaysBefore}
                />
                <small className="help">0 — oldindan eslatilmaydi (muddat kuni esa baribir eslatiladi)</small>
              </div>
              <div className="field">
                <label htmlFor="remindOverdueEvery">Muddat o&apos;tgach har necha kunda</label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  name="remindOverdueEvery"
                  id="remindOverdueEvery"
                  defaultValue={s.remindOverdueEvery}
                />
                <small className="help">0 — faqat bir marta (muddatning ertasiga)</small>
              </div>
              <div className="field wide">
                <label htmlFor="supportPhone">Barterchilar uchun aloqa telefoni</label>
                <input
                  type="text"
                  name="supportPhone"
                  id="supportPhone"
                  defaultValue={s.supportPhone}
                  placeholder="+998 90 123 45 67"
                />
              </div>
            </div>
            <div className="form-actions">
              <Submit />
            </div>
          </div>
        </form>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Bugungi eslatmalar</h2>
              <p>Keyingi muddat: {s.nextDue} · Oxirgi yuborish: {s.lastRemindRun || '—'}</p>
            </div>
          </header>
          <div className="panel-body">
            <div className="actions">
              <button className="btn btn-ghost" type="button" onClick={preview} disabled={!!busy}>
                <Eye className="lucide" />
                {busy === 'preview' ? 'Tekshirilmoqda…' : 'Kimga ketadi? (sinov)'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={sendNow} disabled={!!busy}>
                <BellRing className="lucide" />
                {busy === 'send' ? 'Yuborilmoqda…' : 'Hozir yuborish'}
              </button>
            </div>
            {res.run && (
              <div className="table-wrap" style={{ marginTop: 14, maxHeight: 380, overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Shartnoma</th>
                      <th>Barterchi</th>
                      <th>Turi</th>
                      <th className="num">Qarzdorlik</th>
                      <th>Bot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty">
                          Bugun eslatma kerak bo&apos;lgan shartnoma yo&apos;q
                        </td>
                      </tr>
                    )}
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          № {r.number}
                          <br />
                          <small className="muted">{r.tjm}</small>
                        </td>
                        <td>{r.supplier}</td>
                        <td>{KIND[r.kind] || r.kind}</td>
                        <td className="num">{fmt(r.amount)}</td>
                        <td>
                          {r.chats ? (
                            <span className="badge ok">Ulangan</span>
                          ) : (
                            <span className="badge warn">Ulanmagan</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
