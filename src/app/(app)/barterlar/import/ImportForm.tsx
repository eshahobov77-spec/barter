'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Upload } from 'lucide-react';
import { runImportAction, type ImportState } from '@/actions/importer';
import { fmtShort } from '@/lib/format';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      <Upload className="lucide" />
      {pending ? 'Yuklanmoqda…' : 'Yuklash'}
    </button>
  );
}

export default function ImportForm() {
  const [state, formAction] = useActionState<ImportState, FormData>(runImportAction, {});
  const r = state?.result;

  return (
    <>
      <div className="two-col">
        <form action={formAction} className="panel" encType="multipart/form-data">
          <header className="panel-head">
            <div>
              <h2>Faylni yuklash</h2>
              <p>Avval «Faqat tekshirish» bilan ishga tushiring</p>
            </div>
          </header>
          <div className="panel-body form-stack">
            {state?.error && <div className="flash error">{state.error}</div>}
            <div className="field">
              <label htmlFor="file">Excel fayl (.xlsx)</label>
              <input id="file" type="file" name="file" accept=".xlsx,.xlsm" required />
            </div>
            <div className="field">
              <label className="check-box">
                <input type="checkbox" name="dryRun" defaultChecked />
                <span>Faqat tekshirish (bazaga yozmaslik)</span>
              </label>
            </div>
            <div className="form-actions" style={{ marginTop: 4 }}>
              <Submit />
            </div>
          </div>
        </form>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Import qanday ishlaydi</h2>
            </div>
          </header>
          <div className="panel-body">
            <ul className="list-plain">
              <li>
                Ustunlar nomi bo&apos;yicha aniqlanadi: Shartnoma raqami, Mijoz, Telefon raqam, Sana,
                TJM nomi, UMUMIY SUMMA, BERILGAN CHEK, OYLIK QARZDORLIK, IZOX, HOM ASHYO, HOLATI.
              </li>
              <li>
                «Berilgan chek» boshlang&apos;ich yozuv sifatida saqlanadi, qoldiq = umumiy − chek.
              </li>
              <li>
                Shartnoma TJM + raqam bo&apos;yicha aniqlanadi. Qayta yuklansa, yangi nusxa ochilmaydi
                — mavjudi yangilanadi.
              </li>
              <li>
                Tizimda tushum kiritilgan shartnomalarning summalari Exceldan o&apos;zgartirilmaydi.
              </li>
              <li>To&apos;liq dublikat qatorlar o&apos;tkazib yuboriladi.</li>
            </ul>
          </div>
        </section>
      </div>

      {r && (
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>{r.dryRun ? 'Tekshiruv natijasi (bazaga yozilmadi)' : 'Import natijasi'}</h2>
              <p>
                {r.totalRows} qator o&apos;qildi · {r.fixes} ta avtomatik tuzatish
              </p>
            </div>
            {r.ok ? (
              <span className="badge ok">Xatosiz</span>
            ) : (
              <span className="badge bad">{r.errors.length} xato</span>
            )}
          </header>
          <div className="panel-body">
            <div className="kpis">
              <div className="stat">
                <small>Yangi shartnomalar</small>
                <b>{r.created}</b>
              </div>
              <div className="stat">
                <small>Yangilangan</small>
                <b>{r.updated}</b>
              </div>
              <div className="stat">
                <small>O&apos;tkazib yuborilgan</small>
                <b>{r.skipped}</b>
              </div>
              <div className="stat">
                <small>Aktiv qoldiq</small>
                <b>{fmtShort(r.debtTotal)}</b>
                <span>{r.suppliersCreated} yangi barterchi</span>
              </div>
            </div>

            {r.tjmsCreated.length > 0 && (
              <p className="muted" style={{ marginBottom: 12 }}>
                Yangi TJMlar: {r.tjmsCreated.join(', ')}
              </p>
            )}

            {r.errors.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, margin: '8px 0' }} className="red">
                  Xatolar — bu qatorlar import qilinmaydi
                </h3>
                <ul className="list-plain">
                  {r.errors.map(([row, msg], i) => (
                    <li key={i}>
                      <b>{row}-qator:</b> {msg}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {r.warnings.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, margin: '14px 0 8px' }} className="amber">
                  Ogohlantirishlar
                </h3>
                <ul className="list-plain">
                  {r.warnings.map(([row, msg], i) => (
                    <li key={i}>
                      <b>{row}-qator:</b> {msg}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {r.dryRun && r.ok && (
              <p className="green" style={{ marginTop: 14 }}>
                Hammasi joyida. Endi «Faqat tekshirish» belgisini olib, qayta yuklang.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
