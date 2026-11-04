#!/bin/bash
# Резервная копия данных Галактики + РОТАЦИЯ.
# Храним 3 последних архива данных и 2 последних users-before-*:
# иначе место кончается (29.10 папка бэкапов весила 18 МБ).
set -e
BASE=/var/www/u3699164/data
DIR=$BASE/backups
LOG=$BASE/logs/backup.log
RETAIN=3
mkdir -p "$DIR" "$BASE/logs"
STAMP=$(date +%Y%m%d-%H%M)
tar czf "$DIR/data-$STAMP.tar.gz" -C "$BASE/www" galaktika-data

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

# РОТАЦИЯ: только 3 последних архива данных
REMOVED=$(ls -1t "$DIR"/data-*.tar.gz 2>/dev/null | tail -n +$((RETAIN + 1)) | tee /dev/stderr | wc -l)
ls -1t "$DIR"/data-*.tar.gz 2>/dev/null | tail -n +$((RETAIN + 1)) | xargs -r rm -f

# users-before-* — держим 2
ls -1t "$DIR"/users-before-*.json 2>/dev/null | tail -n +3 | xargs -r rm -f

# старые .bak в galaktika-data (кроме свежего users.json.bak-worldtest)
find "$BASE/www/galaktika-data" -maxdepth 1 -name '*.bak*' -mtime +14 -delete 2>/dev/null || true

LEFT=$(ls -1 "$DIR"/data-*.tar.gz 2>/dev/null | wc -l)
echo "$(date -Is) backup ok: $(basename "$ARCHIVE") ($(du -h "$ARCHIVE" | cut -f1)) · удалено старых: $REMOVED · архивов сейчас: $LEFT" >> "$LOG"
