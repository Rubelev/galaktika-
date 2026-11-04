"""Прогон первых минут игры глазами новичка: что видит, что может, где спотыкается."""
import json
import ssl
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
LOG = []


def call(path, payload=None, token=None):
    h = {"User-Agent": "test", "Content-Type": "application/json"}
    if token:
        h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=h)
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, json.loads(r.read().decode() or "{}"), time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}"), time.time() - t0


def step(name, s, d, dt, ok=None):
    good = ok if ok is not None else (s == 200 and not d.get("error"))
    LOG.append((name, s, good))
    print(("✅ " if good else "❌ ") + f"{name} — {s} ({dt*1000:.0f} мс)" + (f" | {d.get('error')}" if d.get("error") else ""))


t_start = time.time()
email = "first%d@test.ru" % int(time.time() % 100000)

s, d, dt = call("/api/auth/register", {"email": email, "password": "test123456", "lastName": "",
                                       "gameName": "Новичок", "faction": "earth"})
step("регистрация", s, d, dt)
tok = d.get("token")

s, d, dt = call("/api/auth/me", None, tok)
p = json.loads(d["profile"])
step("профиль после входа", s, d, dt)
print(f"   кредиты: {p.get('credits')} | доки: {p.get('dockSlots')} | ресурсы: {sorted((p.get('resources') or {}).keys())}")

s, d, dt = call("/api/quests", None, tok)
quests = d.get("quests") or []
step("список заданий", s, d, dt)
print("   задания:", [q["key"] for q in quests])

# 1. продажа
s, d, dt = call("/api/npcmarket/trade", {"key": "steel", "qty": 50, "side": "sell"}, tok)
step("первая продажа (сталь 50)", s, d, dt)

# 2. чат
s, d, dt = call("/api/chat/send", {"text": "привет, только начал"}, tok)
step("сообщение в чат", s, d, dt)

# 3. корабль
s, d, dt = call("/api/build/start", {"kind": "ship", "id": "jet_scout"}, tok)
step("заложить разведчик", s, d, dt)
if s != 200:
    print("   → причина:", d.get("error"))

# 4. колония сразу (денег хватает?)
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
print(f"   кредитов перед колонией: {p.get('credits')}")
s, d, dt = call("/api/colony/found", {}, tok)
step("основать колонию с порога", s, d, dt)
print("   →", "колония доступна сразу" if s == 200 else d.get("error"))

# 5. сооружение (после колонии)
s, d, dt = call("/api/build/start", {"kind": "factory", "id": "robots"}, tok)
step("построить фабрику", s, d, dt)

# 6. аренда дока
s, d, dt = call("/api/rent", {"what": "dock"}, tok)
step("арендовать место в доке", s, d, dt)

# 7. найм
s, d, dt = call("/api/hire", {"count": 100, "source": "earth"}, tok)
step("нанять 100 землян", s, d, dt)

s, d, dt = call("/api/quests", None, tok)
done = [q["key"] for q in (d.get("quests") or []) if q["done"]]
step("итоговый статус заданий", s, d, dt)
print("   закрыто:", done, "| осталось:", [q["key"] for q in (d.get("quests") or []) if not q["done"]])
print(f"   капитал в конце: {json.loads(call('/api/auth/me', None, tok)[1]['profile']).get('credits')}")
print(f"\nвся первая сессия: {time.time() - t_start:.1f} с, шагов 11, провалов: {sum(1 for _, _, g in LOG if not g)}")
