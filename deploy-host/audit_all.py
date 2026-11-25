"""Полная проверка игры: страницы, ассеты, API, защита, данные."""
import json
import os
import re
import ssl
import subprocess
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
HERE = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host"
HOST = "u3699164@31.31.196.115"
DATA = "/var/www/u3699164/data/www/galaktika-data"
ENV = dict(os.environ)
ENV["SSH_ASKPASS"] = os.path.join(HERE, "askpass.bat")
ENV["SSH_ASKPASS_REQUIRE"] = "force"
ENV["DISPLAY"] = "localhost:0"
OPTS = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL",
        "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no"]

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("OK   " if cond else "FAIL ") + name + ((" — " + str(detail)) if detail else ""))


def get(path, headers=None):
    h = {"User-Agent": "audit"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(BASE + path, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, str(e)


def call(path, payload=None, token=None, method=None):
    h = {"User-Agent": "audit", "Content-Type": "application/json"}
    if token:
        h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}


def ssh(cmd):
    return subprocess.run(["ssh"] + OPTS + [HOST, cmd], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", env=ENV).stdout


print("=== 1. СТРАНИЦА И АССЕТЫ ===")
s, html = get("/")
check("главная страница", s == 200, s)
scripts = re.findall(r'<script src="([^"]+)"', html)
check("скриптов подключено", len(scripts) >= 17, len(scripts))
bad = []
for src in scripts:
    st, _ = get("/" + src.lstrip("/"))
    if st != 200:
        bad.append((src, st))
check("все скрипты отдаются", not bad, bad[:3])
# --- TLS: домен должен отдавать доверенный сертификат ---
def tls_check(host):
    import ssl as _ssl, socket as _socket, tempfile, os as _os, datetime as _dt
    try:
        pem = _ssl.get_server_certificate((host, 443))
        with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as f:
            f.write(pem)
            path = f.name
        try:
            info = _ssl._ssl._test_decode_cert(path)
        finally:
            _os.unlink(path)
        issuer = dict(x[0] for x in info.get("issuer", []))
        subject = dict(x[0] for x in info.get("subject", []))
        selfsigned = issuer.get("commonName") == subject.get("commonName")
        expire = _dt.datetime.strptime(info["notAfter"], "%b %d %H:%M:%S %Y %Z")
        now_utc = _dt.datetime.now(_dt.timezone.utc).replace(tzinfo=None)
        days = (expire - now_utc).days
        return (not selfsigned) and days > 7, ("самоподписанный" if selfsigned else "%s, %d дн." % (issuer.get("organizationName") or issuer.get("commonName"), days))
    except Exception as e:
        return False, str(e)[:40]

ok_tls, info_tls = tls_check("warbattleuniverse.com")
check("TLS сертификат .com доверенный", ok_tls, info_tls)

# --- новичок не должен упираться в тупик ---
st, onboard = get("/js/onboarding.js")
check("обучение без устаревшей цены", st == 200 and "около 2 000" not in onboard)
st_q, quote = get("/api/npcmarket/quote")
parts_ok = all(k in quote for k in ("copper", "nickel", "chips", "boards", "manip"))
check("детали первого корабля в продаже", st_q == 200 and parts_ok,
      "copper/nickel/chips/boards/manip")

st, css = get("/app.css")
check("app.css", st == 200 and "overscroll-behavior" in css)
tex_bad = []
for name in ("earth", "mars", "moon", "titan", "jupiter", "saturn", "venus", "mercury"):
    st, _ = get("/images/tex/%s.webp" % name)
    if st != 200:
        tex_bad.append(name)
check("текстуры планет (webp)", not tex_bad, tex_bad)
check("стартовый экран в разметке", 'id="auth-overlay"' in html)
check("выбор языка на старте", 'id="start-lang"' in html)
check("описание игры", "браузерная космическая стратегия" in html)
check("плашки ошибок нет в разметке", 'id="load-error"' not in html)

print("\n=== 2. ПУБЛИЧНЫЕ API ===")
for path in ("/api/health", "/api/status", "/api/leaderboard", "/api/npcmarket/quote",
             "/api/worlds/abandoned", "/api/chat/list", "/api/market/list"):
    st, _ = call(path)
    check("GET " + path, st == 200, st)

print("\n=== 3. ЗАЩИТА ===")
for path in ("/api/auth/me", "/api/stats", "/api/feedback/list", "/api/clientlog/list",
             "/api/rank/check", "/api/colony/tick", "/api/build/status"):
    st, _ = call(path)
    check("без токена закрыт " + path, st in (401, 403), st)
for path in ("/galaktika-data/users.json", "/galaktika-data/tokens.json",
             "/api/../galaktika-data/users.json", "/users.json", "/tokens.json"):
    st, _ = get(path)
    check("данные недоступны " + path, st in (403, 404), st)

print("\n=== 4. СЕРВЕР ===")
raw = open(os.path.join(HERE, "ADMIN-PASSWORD.txt"), encoding="utf-8").read()
pwd = next(ln.strip() for ln in raw.splitlines()
           if ln.strip() and re.fullmatch(r"[A-Za-z0-9@#$%^&*!_+\-=]{8,}", ln.strip()))
s, d = call("/api/auth/login", {"email": "ab@btema.ru", "password": pwd})
atok = d.get("token")
check("вход администратора", s == 200)
s, st = call("/api/stats", None, atok)
check("статистика доступна админу", s == 200)
mon = ssh("tail -1 /var/www/u3699164/data/logs/monitor.log; tail -1 /var/www/u3699164/data/logs/monitor.log | grep -c FAIL; crontab -l | wc -l")
lines = mon.strip().splitlines()
check("мониторинг отвечает ok", lines and "ok" in lines[0], lines[0] if lines else "")
check("последняя проверка мониторинга без сбоя", len(lines) > 1 and lines[1].strip() == "0", lines[1] if len(lines) > 1 else "")
# Проверяем не количество, а наличие обязательных заданий: новые
# задачи (например, тик цивилизаций) не должны ломать аудит.
cron_text = ssh("crontab -l 2>/dev/null") or ""
required = ("backup.sh", "monitor.sh", "world-tick.php", "civ-tick.php")
missing = [r for r in required if r not in cron_text]
check("cron: обязательные задания на месте", not missing,
      "нет: " + ", ".join(missing) if missing else "%d заданий" % len([l for l in cron_text.splitlines() if l.strip()]))
php = ssh("php -v | head -1")
check("PHP работает", "PHP" in php, php.strip()[:60])
lint = ssh("php -l /var/www/u3699164/data/www/warbattleuniverse.com/api.php")
check("api.php без синтаксических ошибок", "No syntax errors" in lint, lint.strip()[:80])

print("\n=== 5. ДАННЫЕ ===")
files = ["users.json", "tokens.json", "chat.json", "market.json", "feedback.json",
         "wallet.json", "worlds.json", "ranks.json", "pay-settings.json", "pay-orders.json",
         "npc-market.json", "client-errors.json"]
bad_json = []
for f in files:
    raw = ssh("cat " + DATA + "/" + f + " 2>/dev/null")
    try:
        if raw.strip():
            json.loads(raw)
    except Exception:
        bad_json.append(f)
check("JSON-файлы целы", not bad_json, bad_json)
users = json.loads(ssh("cat " + DATA + "/users.json") or "[]")
check("аккаунтов в базе", len(users) >= 3, len(users))
check("администратор на месте", any(u["Email"] == "ab@btema.ru" for u in users))
check("восстановленные игроки на месте",
      any(u["Email"] == "puhnastik.mordor@gmail.com" for u in users) and
      any(u["Email"] == "dynoveblan448@gmail.com" or u["Email"] == "daynoveblan448@gmail.com" for u in users),
      [u["Email"] for u in users])
s, cl = call("/api/clientlog/list", None, atok)
check("ошибок с клиентов нет", (cl.get("total") or 0) == 0, cl.get("total"))

# бэкап: свежий и целый
bk = ssh("ls -1t /var/www/u3699164/data/backups/data-*.tar.gz 2>/dev/null | head -1")
bk = (bk or "").strip()
bk_ok = False
bk_info = "нет архивов"
if bk:
    age = ssh("echo $(( ( $(date +%s) - $(stat -c %Y " + bk + ") ) / 3600 ))")
    size = ssh('stat -c %s "' + bk + '" 2>/dev/null')
    try:
        age_h = int((age or "999").strip())
        size_b = int((size or "0").strip())
    except Exception:
        age_h, size_b = 999, 0
    bk_ok = size_b >= 5120 and age_h <= 36
    bk_info = "%s: %d КБ, %d ч" % (bk.split("/")[-1], size_b // 1024, age_h)
check("свежий бэкап данных", bk_ok, bk_info)

print("\n=== 6. АГЕНТЫ ===")
for email, pwd2 in (("agent@warbattleuniverse.com", "GalaktikaAgent2026!"),
                    ("trader@warbattleuniverse.com", "GalaktikaTrader2026!"),
                    ("quartermaster@warbattleuniverse.com", "GalaktikaQuarter2026!")):
    s, d = call("/api/auth/login", {"email": email, "password": pwd2})
    ok = s == 200
    if ok:
        p = json.loads(d["profile"])
        ok = p.get("credits", 0) >= 0
    check("агент " + email.split("@")[0], ok)

print("\n=== ИТОГ ===")
print(f"проверок: {len(PASS) + len(FAIL)} | успешно: {len(PASS)} | провалов: {len(FAIL)}")
if FAIL:
    print("Провалено:", ", ".join(FAIL))
