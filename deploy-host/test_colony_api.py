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


# игрок
s, d = call("/api/auth/register", {"email": "colony@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Колонист", "faction": "mars"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "colony@test.ru", "password": "test123456"})
tok = d["token"]
print("игрок:", bool(tok))

# подготовим кошелёк: 700 000 кр, 200 т зерна, 5000 т воды
prof = {"credits": 700000, "resources": {"grain": 200000, "water": 5000},
        "fleet": {"a": 1}, "factories": {}, "colony": None}
print("профиль:", call("/api/auth/profile", {"profile": json.dumps(prof)}, tok)[0])

# основание
s, d = call("/api/colony/found", {}, tok)
print("found:", s, "| население:", d.get("colony", {}).get("population"), "| кредиты:", d.get("credits"))
print("повторное основание:", call("/api/colony/found", {}, tok)[0], call("/api/colony/found", {}, tok)[1].get("error"))

# состарим колонию на 3 суток и прогоним тик
s, d = call("/api/auth/me", None, tok)
prof = json.loads(d["profile"])
prof["colony"]["lastTick"] = int(time.time()) - 3 * 86400
call("/api/auth/profile", {"profile": json.dumps(prof)}, tok)

s, d = call("/api/colony/tick", {}, tok)
rep = d.get("report", {})
print("tick:", s, "| дней:", round(3.0, 2), "| налоги:", round(rep.get("credits", 0)),
      "| дефицит:", round(rep.get("deficit", 0), 3), "| население:", round(d.get("colony", {}).get("population", 0)))
print("   зерно:", round(d.get("resources", {}).get("grain", 0)), "| вода:", round(d.get("resources", {}).get("water", 0)))

# голод: обнуляем еду и состариваем на 5 суток
s, d = call("/api/auth/me", None, tok)
prof = json.loads(d["profile"])
prof["resources"]["grain"] = 0
prof["colony"]["lastTick"] = int(time.time()) - 5 * 86400
call("/api/auth/profile", {"profile": json.dumps(prof)}, tok)
s, d = call("/api/colony/tick", {}, tok)
rep = d.get("report", {})
print("голод:", s, "| дефицит:", round(rep.get("deficit", 0), 3), "| умерло:", round(rep.get("died", 0)),
      "| счастье:", round(d.get("colony", {}).get("happiness", 0)))

# без колонии
s, d = call("/api/auth/register", {"email": "nocolony@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Без", "faction": "earth"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "nocolony@test.ru", "password": "test123456"})
print("тик без колонии:", call("/api/colony/tick", {}, d["token"])[0])
