"""Онбординг: стартовый набор и пять заданий с наградами."""
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


def prof(tok):
    return json.loads(call("/api/auth/me", None, tok)[1]["profile"])


s, d = call("/api/auth/register", {"email": "quest%d@test.ru" % int(time.time() % 100000),
                                   "password": "test123456", "lastName": "", "gameName": "Новичок", "faction": "earth"})
tok = d["token"]
p = prof(tok)
print("стартовый набор:", p.get("resources"))
print("кредиты:", p.get("credits"))

s, d = call("/api/quests", None, tok)
print("задания:", s, [(q["key"], q["done"]) for q in (d.get("quests") or [])])

# 1. продажа на рынке
s, d = call("/api/npcmarket/trade", {"key": "steel", "qty": 50, "side": "sell"}, tok)
print("продажа:", s, "| кредиты после:", round(d.get("credits", 0)))

# 2. чат
s, d = call("/api/chat/send", {"text": "первое сообщение"}, tok)
print("чат:", s)

# 3. корабль
s, d = call("/api/build/start", {"kind": "ship", "id": "jet_scout"}, tok)
print("корабль в очередь:", s)

# 4. сооружение
s, d = call("/api/build/start", {"kind": "factory", "id": "robots"}, tok)
print("стройка:", s, d.get("error") or "")

s, d = call("/api/quests", None, tok)
print("после шагов:", [(q["key"], q["done"]) for q in (d.get("quests") or [])], "| кредиты:", round(d.get("credits", 0)))
