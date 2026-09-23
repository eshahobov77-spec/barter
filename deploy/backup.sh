#!/bin/bash
# ==========================================================================
#  Bazani zaxiralash.
#  Ishlatish:  ./deploy/backup.sh          (loyiha papkasidan turib)
#  Har kuni avtomatik (soat 03:00):
#      crontab -e
#      0 3 * * * cd /opt/barter && ./deploy/backup.sh >> /var/log/barter-backup.log 2>&1
# ==========================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE="docker compose -f docker-compose.prod.yml"

# .env dan foydalanuvchi/baza nomini olamiz
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2- || echo barter)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2- || echo barter)"
POSTGRES_USER="${POSTGRES_USER:-barter}"
POSTGRES_DB="${POSTGRES_DB:-barter}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M)"
FILE="$BACKUP_DIR/barter_${STAMP}.sql.gz"

echo "[backup] $FILE"
$COMPOSE exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "[backup] tayyor: $SIZE"

# Eski nusxalarni tozalash
find "$BACKUP_DIR" -name 'barter_*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "[backup] $KEEP_DAYS kundan eski nusxalar o'chirildi"

# ---------------------------------------------------------------------------
# TIKLASH (qaytarish):
#   gunzip -c backups/barter_20260922_0300.sql.gz | \
#     docker compose -f docker-compose.prod.yml exec -T db psql -U barter -d barter
# ---------------------------------------------------------------------------
