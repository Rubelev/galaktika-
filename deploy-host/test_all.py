"""Сквозные тесты живого сайта: auth, кошелёк, колония, рынки, очередь стройки, звания, чат."""
import json
import ssl
import sys
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
PASS, FAIL = [], []


def call(path, payload=None, token=None):
    h = {"User-Agent": "test", "Content-Type": "application/json"}
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


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("OK   " if cond else "FAIL ") + name + ((" — " + str(detail)) if detail else ""))


def profile(token):
    s, d = call("/api/auth/me", None, token)
    return json.loads(d.get("profile") or "{}")


# ---------- базовое ----------
s, d = call("/api/health")
check("health 200", s == 200 and d.get("ok") is True)
s, d = call("/api/status")
check("status 200 + php", s == 200 and "php" in d, d.get("php"))
check("status видит бэкапы", s == 200 and d.get("backups", 0) >= 1, d.get("backups"))
check("status видит монитор", s == 200 and (d.get("monitor") or {}).get("checks", 0) >= 1)

# ---------- регистрация ----------
email = "suite%d@test.ru" % int(time.time() % 100000)
s, d = call("/api/auth/register", {"email": email, "password": "test123456", "lastName": "", "gameName": "Тестер", "faction": "earth"})
tok = d.get("token")
check("регистрация 200", s == 200 and bool(tok))
check("стартовый капитал 200 000", profile(tok).get("credits") == 200000, profile(tok).get("credits"))
check("неверный пароль 401", call("/api/auth/login", {"email": email, "password": "wrong"})[0] == 401)
check("me без токена 401", call("/api/auth/me", None, None)[0] == 401)

# ---------- кошелёк ----------
p = profile(tok)
p["credits"] = 999999999
s, d = call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
check("подмена кредитов обрезана", s == 200 and "credits" in (d.get("anomaly") or []))

# ---------- колония ----------
p = profile(tok)
p["ships"] = [{"id": "jet_scout", "builtAt": int(time.time())}]
p["credits"] = 400000
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/colony/found", {}, tok)
check("основание колонии 200", s == 200 and (d.get("colony") or {}).get("population") == 50000)
check("повторное основание 400", call("/api/colony/found", {}, tok)[0] == 400)
p = profile(tok)
p["colony"]["lastTick"] = int(time.time()) - 3 * 86400
p["resources"] = {"grain": 200000, "water": 5000}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/colony/tick", {}, tok)
check("тик 3 суток 200", s == 200)
check("налоги начислены", (d.get("report") or {}).get("credits", 0) > 0, round((d.get("report") or {}).get("credits", 0)))
check("население выросло", (d.get("colony") or {}).get("population", 0) > 50000)
s, d = call("/api/colony/defense", {"levels": 1}, tok)
check("оборона +1", s == 200 and (d.get("colony") or {}).get("defense") == 1)

# ---------- рынок NPC ----------
s, d = call("/api/npcmarket/quote")
check("котировки 200", s == 200 and "grain" in (d.get("prices") or {}))
s, d = call("/api/npcmarket/trade", {"key": "grain", "qty": 10, "side": "buy"}, tok)
check("покупка на рынке 200", s == 200 and d.get("sum", 0) > 0)
check("неизвестный товар 400", call("/api/npcmarket/trade", {"key": "unknown", "qty": 10, "side": "buy"}, tok)[0] == 400)

# ---------- рынок игроков ----------
p = profile(tok)
p["resources"]["grain"] = 5000
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/market/offer", {"resource": "grain", "qty": 100, "price": 6}, tok)
offer = d.get("offer") or {}
check("лот выставлен", s == 200 and offer.get("qty") == 100)
check("нельзя купить у себя", call("/api/market/buy", {"id": offer.get("id"), "qty": 10}, tok)[0] == 400)
check("лот снят", call("/api/market/cancel", {"id": offer.get("id")}, tok)[0] == 200)

# ---------- чёрный рынок ----------
p = profile(tok)
p["resources"]["quartz"] = 2000
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/bm/sell", {"resource": "quartz", "qty": 1000}, tok)
check("чёрный рынок: продажа 200", s == 200 and d.get("crystals", 0) > 0, d.get("crystals"))
check("чёрный рынок: чужой товар 400", call("/api/bm/sell", {"resource": "grain", "qty": 100}, tok)[0] == 400)
check("чёрный рынок: минимум 100", call("/api/bm/sell", {"resource": "quartz", "qty": 10}, tok)[0] == 400)

# ---------- очередь стройки ----------
p = profile(tok)
p["credits"] = 400000
p["resources"].update({"steel": 2000, "eternity": 30, "copper": 300, "nickel": 150,
                       "silver": 10, "gold": 5, "chips": 50, "boards": 60, "manip": 10})
p["buildQueue"] = []
p["factories"] = {}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)

s, d = call("/api/build/start", {"kind": "factory", "id": "robots"}, tok)
q1 = d.get("queued") or {}
check("стройка: 1 уровень — 5 минут", s == 200 and q1.get("seconds") == 300, q1.get("seconds"))
s, d = call("/api/build/start", {"kind": "factory", "id": "robots"}, tok)
q2 = d.get("queued") or {}
check("стройка: 2 уровень вдвое дольше", s == 200 and q2.get("seconds") == 600, q2.get("seconds"))
check("стройка: неизвестный тип 400", call("/api/build/start", {"kind": "bad", "id": "x"}, tok)[0] == 400)

s, d = call("/api/build/status", {}, tok)
queue = d.get("queue") or []
check("в очереди две стройки", len(queue) == 2, len(queue))
s, d = call("/api/build/accelerate", {"uid": queue[0]["uid"]}, tok)
check("ускорение кристаллами 200", s == 200 and bool(d.get("applied")), d.get("crystals"))
s, d = call("/api/build/status", {}, tok)
check("после ускорения уровень 1", (d.get("factories") or {}).get("robots") == 1, (d.get("factories") or {}).get("robots"))

# ---------- корабль через очередь ----------
s, d = call("/api/build/start", {"kind": "ship", "id": "jet_scout"}, tok)
check("корабль в очереди", s == 200 and (d.get("queued") or {}).get("seconds") == 300)
s, d = call("/api/build/status", {}, tok)
ships_q = [q for q in (d.get("queue") or []) if q["kind"] == "ship"]
if ships_q:
    call("/api/build/accelerate", {"uid": ships_q[0]["uid"]}, tok)
    s, d = call("/api/build/status", {}, tok)
check("корабль построен", (d.get("ships") or 0) >= 1, d.get("ships"))
s, d = call("/api/ship/sell", {"index": 0}, tok)
check("корабль продан за 60%", s == 200 and d.get("refund") == 10800, d.get("refund"))

# ---------- брошенные миры ----------
s, d = call("/api/worlds/abandoned")
check("список брошенных миров 200", s == 200 and isinstance(d.get("worlds"), list))
email3 = "free%d@test.ru" % int(time.time() % 100000)
s, d = call("/api/auth/register", {"email": email3, "password": "test123456", "lastName": "", "gameName": "Свободный", "faction": "earth"})
tok3 = d.get("token")
s, d = call("/api/colony/colonize", {"worldId": "w-nonexistent"}, tok3)
check("захват несуществующего мира 404", s == 404, s)
# ---------- звания ----------
s, d = call("/api/rank/check", {}, tok)
check("звания 200", s == 200 and "rankId" in d, d.get("rank"))
check("звания без токена 401", call("/api/rank/check", {})[0] == 401)

# ---------- чат ----------
s, d = call("/api/chat/send", {"text": "тест чата"}, tok)
check("сообщение отправлено", s == 200 and (d.get("message") or {}).get("text") == "тест чата")
check("антифлуд 429", call("/api/chat/send", {"text": "флуд"}, tok)[0] == 429)
s, d = call("/api/chat/list")
check("чат читается", s == 200 and len(d.get("messages") or []) >= 1)
check("длинное сообщение 400", call("/api/chat/send", {"text": "x" * 400}, tok)[0] == 400)

# ---------- страницы ----------
for path in ("/", "/js/solar.js?v=641", "/js/build.js?v=1", "/js/abandoned.js?v=2", "/js/colony.js?v=12",
             "/js/chat.js?v=1", "/js/market.js?v=3", "/app.css"):
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, headers={"User-Agent": "test"}), timeout=25, context=CTX) as r:
            check("страница " + path, r.status == 200)
    except Exception as e:
        check("страница " + path, False, e)

print("\nИТОГО: %d OK, %d FAIL" % (len(PASS), len(FAIL)))
if FAIL:
    print("Провалено:", ", ".join(FAIL))
sys.exit(1 if FAIL else 0)
