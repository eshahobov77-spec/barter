# Serverga joylash — qadam-baqadam

Serverda allaqachon boshqa loyihalar ishlayotgani hisobga olingan:
**hech qanday port bandlik to'qnashuvi bo'lmaydi.**

- Postgres umuman tashqariga chiqarilmaydi (faqat ichki Docker tarmog'i).
- Compose loyiha nomi `barter`, volume `barter_pgdata` — boshqa loyihalarniki bilan
  aralashmaydi.
- Ilova qaysi portda va qaysi manzilda ochilishi `.env` dagi ikki qiymat bilan
  boshqariladi: `APP_PORT` va `BIND_HOST`.

**Avval serverda nginx qanday ishlashini aniqlang** — bundan keyingi qadamlar shunga
bog'liq (3-bo'limdan keyingi «Nginx» qismiga qarang).

---

## 0. Serverni o'rganish

```bash
# Band portlar
sudo ss -tlnp | sort -k4

# Docker konteynerlari va ular egallagan portlar
docker ps --format '{{.Names}}  |  {{.Ports}}'

# Host nginx ishlayaptimi?
systemctl is-active nginx
```

Uch xil holat bo'lishi mumkin:

| Holat | Nima qilinadi |
|---|---|
| **A.** Host nginx ishlayapti (`active`) | `.env`: `BIND_HOST=127.0.0.1`. `deploy/nginx/barter.conf` ni o'rnatasiz. |
| **B.** 80/443 ni Docker konteyneri egallagan, host nginx `inactive`/`failed` | `.env`: `BIND_HOST=0.0.0.0` va bo'sh `APP_PORT`. Nginx kerak emas — sayt `http://IP:APP_PORT` da ochiladi. |
| **C.** Nginx umuman yo'q | B bilan bir xil. |

> Holat B da host nginx'ni ishga tushirishga urinmang — u 80/443 ni ololmaydi va
> `Address already in use` bilan yiqiladi. Domen ulanganda barter'ni **o'sha Docker
> nginx konteyneriga** server blok sifatida qo'shish kerak bo'ladi.

`APP_PORT` uchun band bo'lmagan raqam tanlang (masalan `8090`) va `.env` da yozing.

---

## 1. Fayllarni serverga ko'chirish

Kompyuteringizdan (loyiha papkasi ichidan):

```bash
rsync -avz --delete \
  --exclude 'node_modules' --exclude '.next' --exclude '.env' \
  --exclude 'backups' --exclude '.git' \
  ./ root@SERVER_IP:/opt/barter/
```

`SERVER_IP` ni o'zingiznikiga almashtiring. `/opt/barter` — server papkasi, xohlagan
joyni tanlashingiz mumkin.

> `node_modules` va `.next` ataylab yuborilmaydi — ular serverda build paytida
> qaytadan yaratiladi. `package-lock.json` esa yuboriladi, shuning uchun serverda
> aynan sizdagi versiyalar o'rnatiladi.

---

## 2. Serverda sozlash

```bash
ssh root@SERVER_IP
cd /opt/barter

cp deploy/env-namuna.txt .env
nano .env
```

`.env` da to'ldirilishi shart:

```ini
POSTGRES_PASSWORD=<openssl rand -base64 24 natijasi>
APP_PORT=8090                 # band bo'lmagan port
BIND_HOST=0.0.0.0             # holat B/C; holat A da 127.0.0.1
SECURE_COOKIES=false          # HTTP da MAJBURIY false
ALLOWED_ORIGINS=SERVER_IP:8090
```

`ALLOWED_ORIGINS` ni to'ldirishni unutmang — aks holda formalarni saqlashda
«Invalid Server Actions request» xatosi chiqishi mumkin.

Parol yaratish:

```bash
openssl rand -base64 24
```

---

## 3. Ishga tushirish

```bash
cd /opt/barter
docker compose -f docker-compose.prod.yml up -d --build
```

Birinchi build 5–10 daqiqa oladi. Kuzatish:

```bash
docker compose -f docker-compose.prod.yml logs -f web
```

`Server ishga tushmoqda…` chiqsa — tayyor. Tekshirish:

```bash
curl http://127.0.0.1:${APP_PORT}/api/health
# {"ok":true,"db":"up", ...}
```

---

## 4. Nginx

### Holat B/C — nginx kerak emas

`BIND_HOST=0.0.0.0` bo'lsa sayt darhol ochiladi:

```bash
sudo ufw allow 8090/tcp      # firewall yoqilgan bo'lsa
```

```
http://SERVER_IP:8090
```

Kirish: `admin` / `admin` → darhol «Mening kabinetim» dan parolni almashtiring.

### Holat A — host nginx ishlayapti

`.env` da `BIND_HOST=127.0.0.1` bo'lishi shart. `deploy/nginx/barter.conf` ichidagi
`upstream` portini `APP_PORT` ga moslang, so'ng:

```bash
sudo cp deploy/nginx/barter.conf /etc/nginx/sites-available/barter.conf
sudo ln -s /etc/nginx/sites-available/barter.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. Kundalik buyruqlar

```bash
cd /opt/barter
COMPOSE="docker compose -f docker-compose.prod.yml"

$COMPOSE ps                    # holati
$COMPOSE logs -f web           # loglar
$COMPOSE restart web           # qayta ishga tushirish
$COMPOSE down                  # to'xtatish (ma'lumotlar saqlanadi)
$COMPOSE up -d                 # qayta yoqish
```

**Kodni yangilash** (rsync bilan yangi fayllarni yuborgandan keyin):

```bash
$COMPOSE up -d --build
```

Baza saqlanib qoladi — `barter_pgdata` volume'ida.

---

## 6. Zaxira nusxa

```bash
chmod +x deploy/backup.sh
./deploy/backup.sh
```

Har kuni avtomatik:

```bash
crontab -e
# quyidagi qatorni qo'shing:
0 3 * * * cd /opt/barter && ./deploy/backup.sh >> /var/log/barter-backup.log 2>&1
```

Tiklash:

```bash
gunzip -c backups/barter_20260922_0300.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U barter -d barter
```

---

## 7. Keyinchalik domen va HTTPS ulash

Domenning A-yozuvini server IP siga yo'naltiring, so'ng holatga qarab:

**Holat A (host nginx):** `barter.conf` oxiridagi izohga olingan blokni yoqing,
`listen 8080` blokini o'chiring, `server_name` ga domenni yozing va:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d barter.sizning-domen.uz
```

**Holat B (80/443 Docker nginx'da):** barter'ni o'sha konteynerning konfigiga
server blok sifatida qo'shish kerak — u allaqachon 80/443 va certbot'ga ega.
`proxy_pass` manzili konteyner ichidan ko'rinadigan bo'lishi uchun ikki yo'l bor:
ikkala compose'ni bitta tashqi Docker tarmog'iga ulash (`proxy_pass http://barter-web:3000`)
yoki host orqali (`proxy_pass http://172.17.0.1:8090`). Bu bosqichda yordam kerak bo'lsa
ayting — o'sha konteynerning konfigiga qarab aniq blok tayyorlab beraman.

Ikkala holatda ham oxirida `.env` ni yangilang va konteynerni qayta yoqing:

```ini
SECURE_COOKIES=true
ALLOWED_ORIGINS=barter.sizning-domen.uz
```

```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## Muammolar

| Belgi | Sabab va yechim |
|---|---|
| `502 Bad Gateway` | Ilova ko'tarilmagan. `$COMPOSE logs web` ni qarang. `APP_PORT` va nginx `upstream` bir xilmi? |
| Sayt brauzerda ochilmaydi, lekin `curl 127.0.0.1:PORT` ishlaydi | `.env` da `BIND_HOST=0.0.0.0` emas. Yoki firewall: `sudo ufw allow PORT/tcp`. |
| `nginx: bind() to 0.0.0.0:80 failed (98: Address already in use)` | 80/443 ni Docker konteyneri egallagan. Host nginx'ni ishlatmang — holat B ga o'ting. |
| Login qabul qilinmaydi, sahifa qaytadan kirish so'raydi | `.env` da `SECURE_COOKIES=true` turibdi, lekin HTTPS yo'q. `false` qiling va `$COMPOSE up -d`. |
| «Invalid Server Actions request» | `.env` da `ALLOWED_ORIGINS=SERVER_IP:APP_PORT` ni to'ldiring, `$COMPOSE up -d`. |
| Excel import «413» xatosi | nginx `client_max_body_size` — konfigda 30m qo'yilgan, o'zgartirgan bo'lsangiz tekshiring. |
| `port is already allocated` | `APP_PORT` band. `.env` da boshqa raqam qo'ying va nginx konfigini ham yangilang. |
| Bot ishlamayapti | `.env` da `ENABLE_BOT=true` mi? Saytdagi «Bot sozlamalari» da token va Chat ID kiritilganmi? `$COMPOSE logs web \| grep bot` |
