"""Проверка: чужой забрал колонию → прежний хозяин начинает с нуля."""
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
    return subprocess.run(["ssh"] + OPTS + [HOST, cmd], capture_output=True, text=True, env=ENV).stdout


def scp_up(local, remote):
    subprocess.run(["scp"] + OPTS + [local, "u3699164@31.31.196.115:" + remote], capture_output=True, env=ENV)


def login(email):
    s, d = call("/api/auth/register", {"email": email, "password": "test123456", "lastName": "",
                                       "gameName": "Тест", "faction": "earth"})
    if s != 200:
        s, d = call("/api/auth/login", {"email": email, "password": "test123456"})
    return d["token"]


def me(tok):
    return json.loads(call("/api/auth/me", None, tok)[1]["profile"])


# 1. хозяин с колонией, флотом и ресурсами
tokA = login("lost@test.ru")
p = me(tokA)
p["credits"] = 250000
p["colony"] = None
p["factories"] = {"robots": 2}
p["ships"] = [{"id": "jet_scout", "builtAt": int(time.time())}]
p["resources"] = {"steel": 900, "grain": 20000}
call("/api/auth/profile", {"profile": json.dumps(p)}, tokA)
call("/api/colony/found", {}, tokA)

# 2. состариваем на 45 дней и прогоняем обход
users = json.loads(ssh("cat " + DATA + "/users.json"))
for u in users:
    if u["Email"].lower() == "lost@test.ru":
        prof = json.loads(u["Profile"])
        prof["lastSeen"] = int(time.time()) - 45 * 86400
        prof["colony"]["population"] = 150000
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
tmp = os.path.join(HERE, "_users_tmp.json")
open(tmp, "w", encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))
scp_up(tmp, DATA + "/users.json")
ssh("php /var/www/u3699164/data/bin/world-tick.php")

# 3. снимаем резерв (как будто месяц прошёл)
worlds = json.loads(ssh("cat " + DATA + "/worlds.json"))
for w in worlds:
    w["reservedUntil"] = int(time.time()) - 60
open(tmp, "w", encoding="utf-8").write(json.dumps(worlds, ensure_ascii=False, indent=2))
scp_up(tmp, DATA + "/worlds.json")

# 4. чужой забирает
tokB = login("taker@test.ru")
w = worlds[0]
s, d = call("/api/colony/colonize", {"worldId": w["id"]}, tokB)
print("чужой забрал:", s, "| стоило:", d.get("cost"), "| руины:", d.get("ruins"))

# 5. хозяин заходит снова — должен начать с нуля
s, d = call("/api/auth/login", {"email": "lost@test.ru", "password": "test123456"})
prof = json.loads(d["profile"])
print("вход хозяина:", s)
print("   кредиты:", prof.get("credits"), "| колония:", prof.get("colony"),
      "| фабрики:", prof.get("factories"), "| корабли:", prof.get("ships"),
      "| ресурсы:", prof.get("resources"), "| причина:", prof.get("resetReason"))
