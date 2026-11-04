"""Проверка заброшенных колоний: состарить профиль, прогнать world-tick, колонизировать мир."""
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
ASKPASS = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\askpass.bat"
ENV = dict(os.environ)
ENV["SSH_ASKPASS"] = ASKPASS
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
    return subprocess.run(["ssh"] + OPTS + [HOST, cmd], capture_output=True, text=True,
                          env=ENV).stdout


# 1. игрок с колонией
s, d = call("/api/auth/register", {"email": "idle@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Ушедший", "faction": "earth"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "idle@test.ru", "password": "test123456"})
tok = d["token"]
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["credits"] = 250000
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/colony/found", {}, tok)
print("колония основана:", s)

# 2. состариваем профиль: lastSeen 40 дней назад, построек 2
users = json.loads(ssh("cat " + DATA + "/users.json"))
for u in users:
    if u["Email"].lower() == "idle@test.ru":
        prof = json.loads(u["Profile"])
        prof["lastSeen"] = int(time.time()) - 40 * 86400
        prof["colony"]["population"] = 200000
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
        print("профиль состарен: lastSeen -40 дней, население 200000")
open(r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\_users_tmp.json", "w", encoding="utf-8").write(
    json.dumps(users, ensure_ascii=False, indent=2))

# 3. заливаем обратно и прогоняем world-tick
subprocess.run(["scp"] + OPTS + [r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\_users_tmp.json",
                                 "u3699164@31.31.196.115:" + DATA + "/users.json"],
               capture_output=True, env=ENV)
ssh("php /var/www/u3699164/data/bin/world-tick.php; tail -3 /var/www/u3699164/data/logs/world.log")

# 4. мир в реестре
s, d = call("/api/worlds/abandoned")
worlds = d.get("worlds") or []
print("брошенных миров:", s, len(worlds))
if worlds:
    w = worlds[0]
    print("   ", w["name"], "| дней:", w["days"], "| остаток:", w["richness"], "| население:", w["population"])

# 5. другой игрок колонизирует
s, d = call("/api/auth/register", {"email": "settler@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Поселенец", "faction": "mars"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "settler@test.ru", "password": "test123456"})
tok2 = d["token"]
p2 = json.loads(call("/api/auth/me", None, tok2)[1]["profile"])
p2["credits"] = 300000
call("/api/auth/profile", {"profile": json.dumps(p2)}, tok2)
if worlds:
    s, d = call("/api/colony/colonize", {"worldId": worlds[0]["id"]}, tok2)
    col = d.get("colony") or {}
    print("колонизация:", s, "| население:", round(col.get("population", 0)),
          "| руины:", d.get("ruins"), "| кредиты:", d.get("credits"))
    s, d2 = call("/api/worlds/abandoned")
    print("миров после захвата:", len(d2.get("worlds") or []))
# 6. повторный захват того же мира
if worlds:
    s, d = call("/api/colony/colonize", {"worldId": worlds[0]["id"]}, tok)
    print("повторный захват:", s, d.get("error"))
