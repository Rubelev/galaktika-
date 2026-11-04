import json
import ssl
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"


def call(path, payload=None, token=None):
    h = {"User-Agent": "probe", "Content-Type": "application/json"}
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
    s, d = call("/api/auth/me", None, token)
    return json.loads(d["profile"])


s, d = call("/api/auth/register", {"email": "raid2@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Оборонщик", "faction": "earth"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "raid2@test.ru", "password": "test123456"})
tok = d["token"]

colony = {
    "world": "kepler", "name": "Новый Кеплер", "founded": int(time.time()), "lastTick": int(time.time()),
    "population": 50000, "happiness": 70, "taxRate": 0.10, "taxCollected": 0, "daysLived": 0,
    "defense": 0, "raids": 0, "lastRaid": int(time.time()) - 30 * 3600, "nextRaidIn": 3600, "lastReport": None,
}
prof = {"credits": 300000, "resources": {"grain": 40000, "water": 4000}, "fleet": {"a": 1}, "factories": {}, "colony": colony}
call("/api/auth/profile", {"profile": json.dumps(prof)}, tok)

s, d = call("/api/colony/tick", {}, tok)
rep = (d.get("report") or {}).get("raid")
print("налёт без обороны:", s, "|", rep, "| зерно:", round((d.get("resources") or {}).get("grain", 0)))

s, d = call("/api/colony/defense", {"levels": 1}, tok)
print("оборона 1:", s, "| уровень:", (d.get("colony") or {}).get("defense"), "| стоило:", d.get("cost"), "| кредиты:", round(d.get("credits", 0)))

p = profile(tok)
p["colony"]["lastRaid"] = int(time.time()) - 30 * 3600
p["colony"]["nextRaidIn"] = 3600
p["colony"]["raids"] = 0
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/colony/tick", {}, tok)
print("налёт с обороной 1:", s, "|", (d.get("report") or {}).get("raid"))

s, d = call("/api/colony/defense", {"levels": 10}, tok)
print("оборона 10 уровней разом:", s, d.get("error"))

s, d = call("/api/auth/register", {"email": "noraid@test.ru", "password": "test123456", "lastName": "", "gameName": "Без", "faction": "mars"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "noraid@test.ru", "password": "test123456"})
print("оборона без колонии:", call("/api/colony/defense", {"levels": 1}, d["token"])[0])
