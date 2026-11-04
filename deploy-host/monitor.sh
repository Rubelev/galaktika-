#!/bin/bash
# Проверка доступности сайта и API: пишем каждую проверку, лог подрезаем до 500 строк.
BASE=/var/www/u3699164/data
LOG=$BASE/logs/monitor.log
URL=https://warbattleuniverse.com/api/health
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL")
if [ "$CODE" != "200" ]; then
  echo "$(date -Is) FAIL http=$CODE" >> "$LOG"
else
  echo "$(date -Is) ok" >> "$LOG"
fi
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"