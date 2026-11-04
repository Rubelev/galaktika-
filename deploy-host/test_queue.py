import json
import ssl
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"


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
        return e.code, json.loads(e.read().decode() or "{}")


def profile(token):
    return json.loads(call("/api/auth/me", None, token)[1]["profile"])


s, d = call("/api/auth/register", {"email": "queue@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Прораб", "faction": "earth"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "queue@test.ru", "password": "test123456"})
tok = d["token"]

p = profile(tok)
p["credits"] = 400000
p["resources"] = {"steel": 2000, "eternity": 20, "copper": 200, "nickel": 100, "silver": 5, "gold": 2, "chips": 20, "boards": 30, "manip": 5}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)

# 1. сооружение: 1 уровень — 5 минут
s, d = call("/api/build/start", {"kind": "factory", "id": "robots"}, tok)
q = d.get("queued") or {}
print("стройка 1:", s, "|", q.get("title"), "| секунд:", q.get("seconds"), "| уровень:", q.get("level"))

# 2. сразу второй уровень — должен быть вдвое дольше (10 минут), но ставится в очередь отдельно
s, d = call("/api/build/start", {"kind": "factory", "id": "robots"}, tok)
q2 = d.get("queued") or {}
print("стройка 2:", s, "| секунд:", q2.get("seconds"), "| в очереди:", len(d.get("queue") or []))

# 3. корабль
s, d = call("/api/build/start", {"kind": "ship", "id": "jet_scout"}, tok)
q3 = d.get("queued") or {}
print("корабль:", s, "|", q3.get("title"), "| секунд:", q3.get("seconds"))

# 4. статус очереди
s, d = call("/api/build/status", {}, tok)
queue = d.get("queue") or []
print("статус:", s, "| в очереди:", len(queue), "| остаток первой:", queue[0].get("remaining") if queue else None)

# 5. ускоряем первую (1 кристалл за минуту)
s, d = call("/api/build/accelerate", {"uid": queue[0]["uid"]}, tok)
print("ускорение:", s, "| кристаллов:", d.get("crystals"), "| осталось кристаллов:", d.get("eternity"),
      "| применено:", [a.get("title") for a in (d.get("applied") or [])])

# 6. статус: уровень должен вырасти
s, d = call("/api/build/status", {}, tok)
print("после ускорения: factories =", (d.get("factories") or {}).get("robots"), "| в очереди:", len(d.get("queue") or []))

# 7. без кристаллов
p = profile(tok)
p["resources"]["eternity"] = 0
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/build/status", {}, tok)
q = (d.get("queue") or [])
if q:
    s2, d2 = call("/api/build/accelerate", {"uid": q[0]["uid"]}, tok)
    print("ускорение без кристаллов:", s2, d2.get("error"))
