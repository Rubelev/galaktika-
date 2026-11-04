"""Замкнутая экономика: агрокомплекс кормит колонию без Земли."""
import json
import os
import ssl
import subprocess
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
HOST = "u3699164@31.31.196.115"
DATA = "/var/www/u3699164/data/www/galaktika-data"
HERE = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host"
ENV = dict(os.environ)
ENV["SSH_ASKPASS"] = os.path.join(HERE, "askpass.bat")
ENV["SSH_ASKPASS_REQUIRE"] = "force"
ENV["DISPLAY"] = "localhost:0"
OPTS = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL",
        "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no"]


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


def ssh(cmd):
    return subprocess.run(["ssh"] + OPTS + [HOST, cmd], capture_output=True, text=True, encoding="utf-8", errors="replace", env=ENV).stdout


def save_users(users):
    tmp = os.path.join(HERE, "_users_tmp.json")
    open(tmp, "w", encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))
    subprocess.run(["scp"] + OPTS + [tmp, "u3699164@31.31.196.115:" + DATA + "/users.json"],
                   capture_output=True, env=ENV)


s, d = call("/api/auth/register", {"email": "autark@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Автоном", "faction": "earth"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "autark@test.ru", "password": "test123456"})
tok = d["token"]

users = json.loads(ssh("cat " + DATA + "/users.json"))
for u in users:
    if u["Email"].lower() == "autark@test.ru":
        prof = json.loads(u["Profile"])
        prof["credits"] = 600000
        prof["resources"] = {"grain": 0, "water": 0, "steel": 5000}
        prof["factories"] = {}
        prof["colony"] = {
            "world": "kepler", "name": "Новый Кеплер", "founded": int(time.time()),
            "lastTick": int(time.time()), "population": 200000, "happiness": 70, "taxRate": 0.10,
            "taxCollected": 0, "daysLived": 0, "defense": 0, "raids": 0,
            "lastRaid": int(time.time()), "nextRaidIn": 999 * 3600, "lastReport": None,
            "ruins": [], "autonomy": False,
        }
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
save_users(users)

print("колония 200 000 жителей, склады пустые:")
s, d = call("/api/colony/tick", {}, tok)
rep = d.get("report") or {}
print("  тик без еды: дефицит", round(rep.get("deficit", 0), 2), "| счастье", round((d.get("colony") or {}).get("happiness", 0)))

s, d = call("/api/colony/autonomy", {"on": True}, tok)
print("включить автономию без агрокомплекса:", s, d.get("error"))

# строим агрокомплекс сразу (через профиль, чтобы не ждать таймер)
users = json.loads(ssh("cat " + DATA + "/users.json"))
for u in users:
    if u["Email"].lower() == "autark@test.ru":
        prof = json.loads(u["Profile"])
        prof["factories"] = {"agro": 1}   # кормит 250 000
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
save_users(users)

s, d = call("/api/colony/autonomy", {"on": True}, tok)
print("включить автономию при агро 1:", s, "| вместимость:", d.get("capacity"), "| население:", round(d.get("population", 0)))

p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["colony"]["lastTick"] = int(time.time()) - 10 * 86400
p["resources"] = {"grain": 0, "water": 0}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/colony/tick", {}, tok)
rep = d.get("report") or {}
col = d.get("colony") or {}
print("тик 10 суток в автономии: дефицит", round(rep.get("deficit", 0), 3),
      "| население", round(col.get("population", 0)), "| счастье", round(col.get("happiness", 0)),
      "| содержание", rep.get("upkeep"))

# переполнение: население больше вместимости
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["colony"]["population"] = 400000
p["colony"]["lastTick"] = int(time.time()) - 10 * 86400
p["resources"] = {"grain": 0, "water": 0}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/colony/tick", {}, tok)
rep = d.get("report") or {}
print("переполнение: автономия потеряна:", rep.get("autonomyLost"),
      "| дефицит", round(rep.get("deficit", 0), 2),
      "| население", round((d.get("colony") or {}).get("population", 0)))
