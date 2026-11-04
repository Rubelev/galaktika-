import json
import os
import ssl
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
PWD_FILE = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\ADMIN-PASSWORD.txt"
ADMIN_PWD = open(PWD_FILE, encoding="utf-8").read().splitlines()[2]


def call(path, payload=None, token=None):
    headers = {"User-Agent": "probe", "Content-Type": "application/json"}
    if token:
        headers["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body[:200]}


admin = call("/api/auth/login", {"email": "ab@btema.ru", "password": ADMIN_PWD})[1].get("token")
print("админ:", bool(admin))

# тестовый игрок
s, d = call("/api/auth/register", {"email": "ranktest@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "РангТест", "faction": "earh".replace("earh", "earth")})
if s != 200:
    s, d = call("/api/auth/login", {"email": "ranktest@test.ru", "password": "test123456"})
player = d.get("token")
print("игрок:", bool(player))

# профиль: 250 000 кр, 5 кораблей → сервер должен выдать «Торговец» и «Владелец флота»
prof = {"credits": 250000, "fleet": {"transport": 3, "fighter": 2}, "factories": {"a": 1},
        "colony": {"population": 60000, "happiness": 75}}
s, d = call("/api/auth/profile", {"profile": json.dumps(prof, ensure_ascii=False)}, player)
print("профиль сохранён:", s)

s, d = call("/api/rank/check", {}, player)
print("rank/check #1:", s, d.get("rank"), "| повышений:", d.get("promoted"), "| награда:", d.get("bonus"), "| кредиты:", d.get("credits"))

# повторный вызов не должен давать награду снова
s, d = call("/api/rank/check", {}, player)
print("rank/check #2:", s, d.get("rank"), "| повышений:", d.get("promoted"), "| награда:", d.get("bonus"))

# поднимаем до губернатора: колония 600 000, счастье 70, 5 кораблей, 3 постройки
prof.update({"factories": {"a": 1, "b": 1, "c": 1}, "colony": {"population": 600000, "happiness": 70}})
call("/api/auth/profile", {"profile": json.dumps(prof, ensure_ascii=False)}, player)
s, d = call("/api/rank/check", {}, player)
print("после роста колонии:", s, d.get("rank"), "| повышений:", d.get("promoted"), "| кредиты:", d.get("credits"))

# без токена — отказ
s, d = call("/api/rank/check", {})
print("без токена:", s, d.get("error"))
