"""Проверка заброшенных колоний: состарить профиль с постройками, прогнать world-tick, колонизировать."""
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
import ssl

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
    r = subprocess.run(["ssh"] + OPTS + [HOST, cmd], capture_output=True, text=True, env=ENV)
    return r.stdout


def login(email):
    s, d = call("/api/auth/register", {"email": email, "password": "test123456", "lastName": "",
                                       "gameName": "Тест", "faction": "earth"})
    if s != 200:
        s, d = call("/api/auth/login", {"email": email, "password": "test123456"})
    return d["token"]


# 1. игрок с колонией и постройками
tok = login("idle2@test.ru")
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["credits"] = 250000
p["factories"] = {"robots": 2, "equipment": 1}
p["resources"] = {"steel": 3000, "grain": 50000}
p["colony"] = None
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
s, d = call("/api/colony/found", {}, tok)
print("колония:", s)

# 2. состариваем: 45 дней без входа, население 300000, постройки 2 и 1
users = json.loads(ssh("cat " + DATA + "/users.json"))
for u in users:
    if u["Email"].lower() == "idle2@test.ru":
        prof = json.loads(u["Profile"])
        prof["lastSeen"] = int(time.time()) - 45 * 86400
        prof["factories"] = {"robots": 2, "equipment": 1}
        prof["colony"]["population"] = 300000
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
tmp = os.path.join(HERE, "_users_tmp.json")
open(tmp, "w", encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))

subprocess.run(["scp"] + OPTS + [tmp, "u3699164@31.31.196.115:" + DATA + "/users.json"],
               capture_output=True, env=ENV)
print("world-tick:", ssh("php /var/www/u3699164/data/bin/world-tick.php; tail -2 /var/www/u3699164/data/logs/world.log").strip()[-160:])

# 3. реестр
s, d = call("/api/worlds/abandoned")
worlds = d.get("worlds") or []
print("брошенных миров:", len(worlds))
w = worlds[0] if worlds else None
if w:
    print("   ", w["name"], "| дней:", w["days"], "| остаток:", w["richness"], "| население:", w["population"], "| постройки:", w["factories"])

# 4. новый игрок колонизирует
tok2 = login("settler2@test.ru")
p2 = json.loads(call("/api/auth/me", None, tok2)[1]["profile"])
p2["credits"] = 300000
p2["colony"] = None
call("/api/auth/profile", {"profile": json.dumps(p2)}, tok2)
if w:
    s, d = call("/api/colony/colonize", {"worldId": w["id"]}, tok2)
    col = d.get("colony") or {}
    print("колонизация:", s, "| население:", round(col.get("population", 0)),
          "| руины:", d.get("ruins"), "| кредиты:", d.get("credits"), "| ресурсы:", d.get("resources"))
    s, d2 = call("/api/worlds/abandoned")
    print("миров после захвата:", len(d2.get("worlds") or []))

# 5. своя же брошенная колония — нельзя (проверим на первом игроке, если мир свободен)
if w:
    s, d = call("/api/colony/colonize", {"worldId": w["id"]}, tok)
    print("повторный захват:", s, d.get("error"))
