# IP-telefoniya moduli

Istalgan provayderdan (Beeline VTS, OnlinePBX, Zadarma, o'z Asterisk/FreePBX serveringiz va h.k.)
qo'ng'iroq yozuvi (MP3/WAV/OGG/M4A) va metadata qabul qilinadi → matnga o'giriladi → AI xulosa
va va'dani ajratadi → barterchi telefon raqami bo'yicha shartnoma topiladi → shartnomaga izoh yoziladi.

```
Provayder ──webhook──► /api/telephony/webhook/<provayder>?token=…  ┐
Istalgan tizim ─REST─► /api/telephony/calls (Bearer token)          ┴─► CallRecord (navbat)
                                                                              │ fon jarayoni
                        audio yuklash → STT (Whisper) → AI xulosa → shartnoma → Izoh + va'da
```

Og'ir ish fon jarayonida bajariladi, provayder darhol `200/202` javob oladi.
Xato bo'lsa 1, 5, 30, 120, 360 daqiqadan keyin qayta urinadi (5 marta).

## Sozlash (sayt → «IP-telefoniya», faqat admin)

1. **Token yaratish** — bir marta ko'rsatiladi, bazada faqat xeshi saqlanadi.
2. **STT** — OpenAI-mos `/audio/transcriptions`:
   OpenAI Whisper (`https://api.openai.com/v1/audio/transcriptions`, model `whisper-1`),
   Groq yoki o'z serveringizdagi Whisper (faster-whisper-server, whisper.cpp server) — hammasi shu formatda.
   Til: `uz`; rus-o'zbek aralash suhbatlar ko'p bo'lsa bo'sh qoldiring (avtomatik aniqlanadi).
   OpenAI 25 MB dan katta faylni qabul qilmaydi.
3. **AI** — Anthropic (Claude) yoki OpenAI-mos `/chat/completions`. Kalit kiritilmasa, sana va miqdor
   oddiy qoidalar bilan ajratiladi.
4. **Kompaniya raqamlari** — suhbatning qaysi tomoni barterchi ekanini ajratish uchun.
5. **Modulni yoqish.**

## 1. Universal REST API

`POST /api/telephony/calls` — kirish: `Authorization: Bearer <token>` (yoki `X-Api-Key`, yoki `?token=`).

| Maydon | Majburiy | Izoh |
|---|---|---|
| `audio` (fayl) / `audio_url` / `audio_base64` | ha, bittasi | MP3, WAV, OGG, M4A, FLAC, WEBM |
| `call_id` | tavsiya | Provayder ID si. Qayta yuborilsa takrorlanmaydi |
| `from`, `to` | tavsiya | Telefonlar, istalgan formatda |
| `direction` | yo'q | `in` / `out` (incoming, inbound, входящий ham tushuniladi) |
| `started_at` | yo'q | ISO, `YYYY-MM-DD HH:MM:SS` yoki unix vaqt |
| `duration` | yo'q | soniya; sozlamadagidan qisqasi o'tkazib yuboriladi |
| `provider` | yo'q | manba nomi (jurnal uchun) |
| `metadata` | yo'q | qo'shimcha JSON (satr) |

```bash
curl -X POST https://DOMEN/api/telephony/calls \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@suhbat.mp3" -F "call_id=abc-1" \
  -F "from=+998901234567" -F "to=+998712000000" -F "direction=in" -F "duration=95"
# → 202 {"id": 12, "status": "received", "duplicate": false}

curl https://DOMEN/api/telephony/calls/12 -H "Authorization: Bearer $TOKEN"
# → {"status":"done","summary":"…","promise":{"date":"2026-10-25","what":"10 tonna sement"},"contract":{…}}
```

**HMAC (ixtiyoriy):** sozlamada imzo siri berilsa, JSON so'rovlar `X-Signature: sha256=<hex>`
(tanadan HMAC-SHA256) bilan kelishi shart.

## 2. Provayder webhooklari

`POST /api/telephony/webhook/<provayder>?token=<token>` — JSON, `x-www-form-urlencoded` yoki
`multipart/form-data` (audio fayl bilan). Bir so'rovda `items: [...]` massivi ham bo'lishi mumkin.

- **zadarma** — maxsus adapter. Kabinet → Sozlamalar → API: webhook manziliga havolani qo'ying,
  `NOTIFY_END`, `NOTIFY_OUT_END`, `NOTIFY_RECORD` ni yoqing, bulutga yozishni yoqing, Key/Secret ni
  saytga kiriting. Manzilni tekshirish (`?zd_echo=`) avtomatik javob beradi. `NOTIFY_RECORD` dan
  45 soniya keyin yozuv `GET /v1/pbx/record/request/` orqali olinadi.
- **onlinepbx**, **beeline** va istalgan boshqa nom (`/webhook/utel`, `/webhook/asterisk`) —
  maydonlar **moslashtirish** orqali o'qiladi. Standart nomzodlar bor (`uuid`, `caller`, `record`,
  `callId`, `recordUrl` …), lekin provayderlar maydon nomlarini turlicha yuboradi:
  1. Provayder kabinetida webhook manzilini qo'ying.
  2. Sinov qo'ng'irog'i qiling.
  3. «IP-telefoniya → Kelgan so'rovlar» da nima kelganini oching.
  4. «Maydonlarni moslashtirish» ga yozing, masalan:
     ```json
     { "onlinepbx": { "externalId": "uuid", "from": "caller_number", "to": "callee_number",
                      "audioUrl": "download_url", "duration": "billsec", "direction": "direction" } }
     ```
  Yozuv havolasi alohida xabarda kelsa ham ishlaydi: ikkala xabar bir xil `call_id` bilan birlashadi.
  Provayder audio havolasini bermay, faylni o'zi yuborsa — `multipart` da `audio`/`file`/`record` maydoni.

## Xavfsizlik

- Token bo'lmasa — 401. Token faqat xesh ko'rinishida saqlanadi, jurnalda yashiriladi.
- Audio havolasi ichki tarmoq manziliga (127.0.0.1, 10.x, 192.168.x …) bo'lsa yuklanmaydi —
  o'z Asterisk serveringiz uchun `.env` da `ALLOW_PRIVATE_AUDIO=true`.
- Faqat haqiqiy audio saqlanadi (fayl boshidagi baytlar tekshiriladi).
- Audio `keepDays` kundan keyin o'chadi, matn va xulosa qoladi.
- Yozuvni faqat shartnomani ko'ra oladigan xodim tinglaydi.
- **Internetdan ulanish uchun domen + HTTPS kerak** (token va suhbatlar ochiq HTTP da yuborilmasin).
  Nginx ortida `client_max_body_size 60m;` qo'ying — aks holda katta audio 413 bilan qaytadi.

## Ma'lumotlar

`CallRecord` (qo'ng'iroq, matn, xulosa, va'da), `TelephonySettings`, `TelephonyInbox` (oxirgi 300 so'rov).
`Note` ga `promiseDate / promiseWhat / promiseAmount / callId` qo'shildi.
Audio: `CALLS_DIR` (Docker'da `barter_calls` volume → `/app/data/calls`).
