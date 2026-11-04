#!/bin/bash
# Резервная копия данных Галактики: пользователи, заказы, рынок, чат, кошельки.
set -e
BASE=/var/www/u3699164/data
DIR=$BASE/backups
LOG=$BASE/logs/backup.log
mkdir -p "$DIR" "$BASE/logs"
STAMP=$(date +%Y%m%d-%H%M)
tar czf "$DIR/data-$STAMP.tar.gz" -C "$BASE/www" galaktika-data
ls -1t "$DIR"/data-*.tar.gz | tail -n +15 | xargs -r rm -f
# проверка целостности и размера: битый архив — тревога, а не «ок»
ARCHIVE="$DIR/data-$STAMP.tar.gz"
SIZE=$(stat -c %s "$ARCHIVE" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 5120 ]; then
  echo "$(date -Is) ALERT: архив подозрительно мал ($SIZE байт): $ARCHIVE" >> "$LOG"
  exit 1
fi
if ! tar tzf "$ARCHIVE" > /dev/null 2>&1; then
  echo "$(date -Is) ALERT: архив не читается: $ARCHIVE" >> "$LOG"
  exit 1
fi
echo "$(date -Is) backup ok: $(basename "$ARCHIVE") ($(du -h "$ARCHIVE" | cut -f1))" >> "$LOG"