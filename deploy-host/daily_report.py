"""Ежедневный отчёт по «Галактике»: здоровье сервера, игроки, экономика, заявки.

Собирает факты, ничего не додумывает. Результат печатается и сохраняется
в galaktika/reports/YYYY-MM-DD.md
"""
import datetime as dt
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "https://warbattleuniverse.com"
HOST = "u3699164@31.31.196.115"
DATA = "/var/www/u3699164/data/www/galaktika-data"
HERE = os.path.dirname(os.path.abspath(__file__))
REPORTS = os.path.join(os.path.dirname(HERE), "reports")

ENV = dict(os.environ)
ENV["SSH_ASKPASS"] = os.path.join(HERE, "askpass.bat")
ENV["SSH_ASKPASS_REQUIRE"] = "force"
ENV["DISPLAY"] = "localhost:0"
OPTS = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL",
        "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no"]
CTX = ssl.create_default_context()


def call(path, payload=None, token=None):
    h = {"User-Agent": "daily-report", "Content-Type": "application/json"}
    if token:
        h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}


def ssh(cmd):
    r = subprocess.run(["ssh"] + OPTS + [HOST, cmd], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=ENV)
    return r.stdout.strip()


def admin_token():
    raw = open(os.path.join(HERE, "ADMIN-PASSWORD.txt"), encoding="utf-8").read()
    pwd = next(ln.strip() for ln in raw.splitlines()
               if ln.strip() and re.fullmatch(r"[A-Za-z0-9@#$%^&*!_+\-=]{8,}", ln.strip()))
    s, d = call("/api/auth/login", {"email": "ab@btema.ru", "password": pwd})
    return d.get("token")


def main():
    now = dt.datetime.now()
    day = now.strftime("%Y-%m-%d")
    tok = admin_token()
    s, stats = call("/api/stats", None, tok)
    s, fb = call("/api/feedback/list?new=1", None, tok)
    s, chat = call("/api/chat/list")
    s, market = call("/api/market/list")
    s, status = call("/api/status")

    files = ssh("for f in " + DATA + "/*.json; do printf '%s %s\\n' $(stat -c%s $f) $(basename $f); done")
    mon = ssh("tail -1 /var/www/u3699164/data/logs/monitor.log 2>/dev/null; "
              "grep -c FAIL /var/www/u3699164/data/logs/monitor.log 2>/dev/null; "
              "wc -l < /var/www/u3699164/data/logs/monitor.log 2>/dev/null")
    backups = ssh("ls -1 /var/www/u3699164/data/backups 2>/dev/null | tail -3")
    users = ssh("php -r '$u=json_decode(file_get_contents(\"" + DATA + "/users.json\"),true);"
                "foreach($u as $x){$p=json_decode($x[\"Profile\"],true);"
                "printf(\"%s|%s|%s|%s|%s\\n\",$x[\"Email\"],$x[\"Role\"],$p[\"credits\"]??0,"
                "!empty($p[\"colony\"])?\"есть\":\"нет\",$p[\"lastSeen\"]??0);}'")
    disk = ssh("df -h / | tail -1")

    u = (stats or {}).get("users") or {}
    lines = []
    lines.append(f"# Галактика — отчёт за {day}")
    lines.append("")
    lines.append(f"Сформирован: {now.strftime('%d.%m.%Y %H:%M')} MSK")
    lines.append("")
    lines.append("## Сервер")
    lines.append("")
    lines.append(f"- статус: {'ok' if status.get('ok') else 'НЕ ОТВЕЧАЕТ'} · PHP {status.get('php', '?')}")
    lines.append(f"- мониторинг: последняя проверка `{mon.splitlines()[0] if mon else '—'}`, "
                 f"сбоев {mon.splitlines()[1] if len(mon.splitlines()) > 1 else '?'}, "
                 f"записей {mon.splitlines()[2] if len(mon.splitlines()) > 2 else '?'}")
    lines.append(f"- бэкапы: {', '.join(backups.splitlines()) if backups else 'нет'}")
    lines.append(f"- диск: `{disk}`")
    lines.append("")
    lines.append("## Игроки")
    lines.append("")
    lines.append(f"- всего {u.get('total', 0)}, новых сегодня {u.get('newToday', 0)}, "
                 f"активных за сутки {u.get('activeToday', 0)}, за неделю {u.get('activeWeek', 0)}")
    lines.append(f"- с колонией {u.get('withColony', 0)}, кораблей {u.get('ships', 0)}, "
                 f"средний капитал {u.get('avgCredits', 0):,} кр".replace(",", " "))
    lines.append(f"- заброшенных мирах: {(stats.get('worlds') or {}).get('abandoned', 0)}")
    lines.append("")
    lines.append("| аккаунт | роль | кредиты | колония |")
    lines.append("|---|---|---|---|")
    for row in users.splitlines():
        parts = row.split("|")
        if len(parts) >= 4:
            lines.append(f"| {parts[0]} | {parts[1]} | {round(float(parts[2] or 0)):,} | {parts[3]} |".replace(",", " "))
    lines.append("")
    lines.append("## Активность")
    lines.append("")
    lines.append(f"- чат: {(stats.get('chat') or {}).get('today', 0)} сообщений за сутки, "
                 f"всего {(stats.get('chat') or {}).get('total', 0)}")
    lines.append(f"- лотов на рынке: {len(market.get('offers') or [])}")
    lines.append(f"- заказов на оплату: {(stats.get('pay') or {}).get('orders', 0)}, "
                 f"оплачено {(stats.get('pay') or {}).get('paid', 0)} на {(stats.get('pay') or {}).get('sum', 0)} ₽")
    lines.append(f"- звания: {stats.get('ranks') or {}}")
    lines.append("")
    lines.append("## Пожелания игроков (новые)")
    lines.append("")
    items = [f for f in (fb.get("feedback") or []) if f.get("status", "new") == "new"]
    if not items:
        lines.append("- новых нет")
    all_items_count = len((fb.get("feedback") or []))
    if not items:
        lines.append("")
    for f in items:
        lines.append(f"- **#{f.get('id')}** {f.get('name')} ({f.get('status', 'new')}): {f.get('text')}")
    lines.append("")
    lines.append("## Данные")
    lines.append("")
    lines.append("```")
    lines.append(files)
    lines.append("```")
    text = "\n".join(lines)

    os.makedirs(REPORTS, exist_ok=True)
    path = os.path.join(REPORTS, day + ".md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    print(text)
    print(f"\nсохранено: {path}")


if __name__ == "__main__":
    main()
