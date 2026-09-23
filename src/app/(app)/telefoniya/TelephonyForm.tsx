'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Save, KeyRound, Copy } from 'lucide-react';
import { newTokenAction, saveTelephonyAction, type TelState } from '@/actions/telephony';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary" type="submit" disabled={pending}>
      <Save className="lucide" />
      {pending ? 'Saqlanmoqda…' : 'Saqlash'}
    </button>
  );
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function TokenPanel({ base, hint }: { base: string; hint: string }) {
  const [st, setSt] = useState<TelState>({});
  const [busy, setBusy] = useState(false);
  const token = st.token || '<TOKEN>';
  const urls: [string, string][] = [
    ['Universal REST API', `${base}/api/telephony/calls`],
    ['Zadarma', `${base}/api/telephony/webhook/zadarma?token=${token}`],
    ['OnlinePBX', `${base}/api/telephony/webhook/onlinepbx?token=${token}`],
    ['Beeline VTS', `${base}/api/telephony/webhook/beeline?token=${token}`],
    ['Boshqa provayder', `${base}/api/telephony/webhook/<nomi>?token=${token}`],
  ];
  async function gen() {
    if (hint && !confirm("Yangi token yaratilsa, eski token darhol ishlamay qoladi. Davom etasizmi?")) return;
    setBusy(true);
    setSt(await newTokenAction());
    setBusy(false);
  }
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Ulanish manzillari</h2>
          <p>Token: {hint ? <span className="code">{hint}</span> : 'hali yaratilmagan'}</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={gen} disabled={busy}>
          <KeyRound className="lucide" />
          {hint ? 'Tokenni almashtirish' : 'Token yaratish'}
        </button>
      </header>
      <div className="panel-body">
        {st.token && (
          <div className="flash success" style={{ wordBreak: 'break-all' }}>
            {st.message}
            <br />
            <b className="code">{st.token}</b>{' '}
            <button className="btn btn-ghost sm" type="button" onClick={() => copy(st.token!)}>
              <Copy className="lucide" /> Nusxa
            </button>
          </div>
        )}
        {st.error && <div className="flash error">{st.error}</div>}
        <dl className="kv" style={{ gridTemplateColumns: '180px 1fr' }}>
          {urls.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd style={{ textAlign: 'left', wordBreak: 'break-all', fontWeight: 500 }}>
                <span className="code">{v}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
          REST API uchun token sarlavhada yuboriladi: <span className="code">Authorization: Bearer &lt;token&gt;</span>. Provayder
          sarlavha qo&apos;sha olmasa — manzil oxiridagi <span className="code">?token=</span> ishlatiladi. Internet orqali
          ulanishda HTTPS (domen) tavsiya etiladi.
        </p>
        <details style={{ marginTop: 10 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>curl bilan sinab ko&apos;rish</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{`curl -X POST ${base}/api/telephony/calls \\
  -H "Authorization: Bearer ${token}" \\
  -F "audio=@suhbat.mp3" \\
  -F "call_id=test-001" -F "from=+998901234567" -F "to=+998712000000" \\
  -F "direction=in" -F "duration=95" -F "started_at=2026-09-22 10:15:00"

# yoki audio havolasi bilan (JSON):
curl -X POST ${base}/api/telephony/calls \\
  -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \\
  -d '{"call_id":"test-002","from":"+998901234567","direction":"in","audio_url":"https://.../rec.mp3"}'

# natijani ko'rish:
curl ${base}/api/telephony/calls/<id> -H "Authorization: Bearer ${token}"`}</pre>
        </details>
      </div>
    </section>
  );
}

export type TelData = {
  enabled: boolean; autoNote: boolean; ownNumbers: string;
  sttUrl: string; sttKeyMask: string; sttModel: string; sttLanguage: string;
  llmProvider: string; llmUrl: string; llmKeyMask: string; llmModel: string;
  hmacMask: string; zadarmaKeyMask: string; zadarmaSecretMask: string;
  minDurationSec: number; maxMb: number; keepDays: number; mappings: string; defaults: string;
};

function Secret({ name, label, mask, help }: { name: string; label: string; mask: string; help?: string }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input type="password" name={name} id={name} autoComplete="off" placeholder={mask || 'kiritilmagan'} />
      <small className="help">{mask ? "Bo'sh qoldirsangiz, eskisi qoladi. «-» — o'chirish." : help || ''}</small>
    </div>
  );
}

export default function TelephonyForm({ s }: { s: TelData }) {
  const [state, action] = useActionState<TelState, FormData>(saveTelephonyAction, {});
  return (
    <form action={action}>
      {(state.error || state.message) && <div className={`flash ${state.error ? 'error' : 'success'}`}>{state.error || state.message}</div>}
      <div className="two-col">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Asosiy</h2>
            </div>
          </header>
          <div className="panel-body form-grid">
            <div className="field wide">
              <label className="check-box">
                <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
                <span>Modul yoqilgan (API va webhooklar qabul qilinadi)</span>
              </label>
            </div>
            <div className="field wide">
              <label className="check-box">
                <input type="checkbox" name="autoNote" defaultChecked={s.autoNote} />
                <span>Xulosani shartnomaga avtomatik izoh qilib yozish</span>
              </label>
            </div>
            <div className="field wide">
              <label htmlFor="ownNumbers">Kompaniya raqamlari</label>
              <input name="ownNumbers" id="ownNumbers" defaultValue={s.ownNumbers} placeholder="+998712000000, +998951112233" />
              <small className="help">Suhbatning qaysi tomoni barterchi ekanini ajratish uchun</small>
            </div>
            <div className="field">
              <label htmlFor="minDurationSec">Eng qisqa suhbat (soniya)</label>
              <input type="number" name="minDurationSec" id="minDurationSec" min={0} max={600} defaultValue={s.minDurationSec} />
              <small className="help">Undan qisqasi (javobsiz, xato raqam) matnga o&apos;girilmaydi</small>
            </div>
            <div className="field">
              <label htmlFor="maxMb">Audio hajmi chegarasi (MB)</label>
              <input type="number" name="maxMb" id="maxMb" min={1} max={500} defaultValue={s.maxMb} />
            </div>
            <div className="field">
              <label htmlFor="keepDays">Audio saqlanadi (kun)</label>
              <input type="number" name="keepDays" id="keepDays" min={7} max={3650} defaultValue={s.keepDays} />
              <small className="help">Keyin fayl o&apos;chadi, matn va xulosa qoladi</small>
            </div>
            <Secret name="hmacSecret" label="HMAC imzo siri (ixtiyoriy)" mask={s.hmacMask} help="REST API uchun X-Signature talab qilinadi" />
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Nutqni matnga (STT)</h2>
              <p>OpenAI-mos /audio/transcriptions: OpenAI Whisper, Groq yoki o&apos;z Whisper serveringiz</p>
            </div>
          </header>
          <div className="panel-body form-grid">
            <div className="field wide">
              <label htmlFor="sttUrl">Manzil</label>
              <input name="sttUrl" id="sttUrl" defaultValue={s.sttUrl} />
            </div>
            <Secret name="sttKey" label="API kalit" mask={s.sttKeyMask} />
            <div className="field">
              <label htmlFor="sttModel">Model</label>
              <input name="sttModel" id="sttModel" defaultValue={s.sttModel} placeholder="whisper-1" />
            </div>
            <div className="field">
              <label htmlFor="sttLanguage">Til kodi</label>
              <input name="sttLanguage" id="sttLanguage" defaultValue={s.sttLanguage} placeholder="uz" />
              <small className="help">uz — o&apos;zbek; aralash (rus-o&apos;zbek) suhbatlar uchun bo&apos;sh qoldiring — til avtomatik aniqlanadi</small>
            </div>
          </div>
        </section>
      </div>

      <div className="two-col">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Xulosa uchun AI</h2>
              <p>Kalit bo&apos;lmasa — oddiy qoidalar bilan sana va miqdor ajratiladi</p>
            </div>
          </header>
          <div className="panel-body form-grid">
            <div className="field">
              <label htmlFor="llmProvider">Turi</label>
              <select name="llmProvider" id="llmProvider" defaultValue={s.llmProvider}>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI-mos (chat/completions)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="llmModel">Model</label>
              <input name="llmModel" id="llmModel" defaultValue={s.llmModel} />
            </div>
            <Secret name="llmKey" label="API kalit" mask={s.llmKeyMask} />
            <div className="field">
              <label htmlFor="llmUrl">Manzil (ixtiyoriy)</label>
              <input name="llmUrl" id="llmUrl" defaultValue={s.llmUrl} placeholder="standart manzil" />
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Zadarma</h2>
              <p>Yozuv havolasini olish uchun (Kabinet → Sozlamalar → API)</p>
            </div>
          </header>
          <div className="panel-body form-grid">
            <Secret name="zadarmaKey" label="Key" mask={s.zadarmaKeyMask} />
            <Secret name="zadarmaSecret" label="Secret" mask={s.zadarmaSecretMask} />
            <p className="muted wide" style={{ fontSize: 13 }}>
              Zadarma kabinetida webhook manziliga yuqoridagi «Zadarma» havolasini qo&apos;ying va NOTIFY_END, NOTIFY_OUT_END,
              NOTIFY_RECORD xabarlarini yoqing. Qo&apos;ng&apos;iroq yozuvi bulutda saqlanishi yoqilgan bo&apos;lishi kerak.
            </p>
          </div>
        </section>
      </div>

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Maydonlarni moslashtirish</h2>
            <p>
              Har bir provayder o&apos;z maydon nomlarini yuboradi. Bu yerda qaysi maydondan nima olinishini ko&apos;rsating (nuqta bilan
              ichki maydon: <span className="code">data.record_url</span>). Bo&apos;sh bo&apos;lsa, standart nomzodlar ishlatiladi.
            </p>
          </div>
        </header>
        <div className="panel-body form-grid">
          <div className="field wide">
            <label htmlFor="mappings">JSON</label>
            <textarea name="mappings" id="mappings" rows={8} defaultValue={s.mappings} placeholder={'{\n  "onlinepbx": { "externalId": "uuid", "from": "caller", "to": "callee", "audioUrl": "record", "duration": "billsec" }\n}'} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} />
          </div>
          <details className="wide">
            <summary className="muted" style={{ cursor: 'pointer' }}>Standart nomzodlar (onlinepbx, beeline)</summary>
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{s.defaults}</pre>
          </details>
          <div className="form-actions wide">
            <Submit />
          </div>
        </div>
      </section>
    </form>
  );
}
