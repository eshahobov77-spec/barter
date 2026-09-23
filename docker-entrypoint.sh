#!/bin/sh
set -e

echo "[start] Bazani kutmoqda…"
i=0
until node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.\$queryRaw\`SELECT 1\`.then(()=>p.\$disconnect()).then(()=>process.exit(0)).catch(()=>process.exit(1));
" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 60 ]; then
    echo "[start] Bazaga ulanib bo'lmadi (60 urinish). DATABASE_URL ni tekshiring."
    exit 1
  fi
  sleep 2
done
echo "[start] Baza tayyor."

echo "[start] Sxemani qo'llash (prisma db push)…"
npx prisma db push --skip-generate

echo "[start] Boshlang'ich ma'lumotlar…"
node scripts/seed.mjs

echo "[start] Server ishga tushmoqda…"
exec npm run start
