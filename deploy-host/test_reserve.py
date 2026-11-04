"""Проверка резерва: месяц без входа → мир в реестре, чужой не может, хозяин возвращает бесплатно."""
import json
import os
import subprocess
import time
import ssl
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


def login(email):
    s, d = call("/api/auth/register", {"email": email, "password": "test123456", "lastName": "",
                                       "gameName": "Тест", "faction": "earth"})
    if s != 200:
        s, d = call("/api/auth/login", {"email": email, "password": "test123456"})
    return d["token"]


def me(tok):
    return json.loads(call("/api/auth/me", None, tok)[1]["profile"])


# хозяин
tokA = login("owner@test.ru")
p = me(tokA)
p["credits"] = 250000
p["colony"] = None
p["factories"] = {"robots": 2}
call("/api/auth/profile", {"profile": json.dumps(p)}, tokA)
print("колония:", call("/api/colony/found", {}, tokA)[0])

# состариваем на 45 дней
users = json.loads(ssh("cat " + DATA + "/users.json"))
for u in users:
    if u["Email"].lower() == "owner@test.ru":
        prof = json.loads(u["Profile"])
        prof["lastSeen"] = int(time.time()) - 45 * 86400
        prof["colony"]["population"] = 120000
        prof["factories"] = {"robots": 2}
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
tmp = os.path.join(HERE, "_users_tmp.json")
open(tmp, "w", encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))
subprocess.run(["scp"] + OPTS + [tmp, "u3699164@31.31.196.115:" + DATA + "/users.json"], capture_output=True, env=ENV)
ssh("php /var/www/u3699164/data/bin/world-tick.php")

# реестр
s, d = call("/api/worlds/abandoned")
w = (d.get("worlds") or [None])[0]
print("мир в реестре:", bool(w), "| резерв:", w and w.get("reserved"),
      "| до:", time.strftime("%d.%m.%Y", time.localtime(w["reservedUntil"])) if w else None)

# чужой пытается забрать
tokB = login("stranger@test.ru")
pB = me(tokB)
pB["credits"] = 300000
pB["colony"] = None
call("/api/auth/profile", {"profile": json.dumps(pB)}, tokB)
if w:
    s, d = call("/api/colony/colonize", {"worldId": w["id"]}, tokB)
    print("чужой захват:", s, "|", d.get("error"))

# хозяин возвращает бесплатно
before = me(tokA).get("credits")
if w:
    s, d = call("/api/colony/colonize", {"worldId": w["id"]}, tokA)
    after = me(tokA).get("credits")
    print("возврат хозяина:", s, "| стоило:", d.get("cost"), "| кредиты было/стало:", before, "/", after,
          "| население:", round((d.get("colony") or {}).get("population", 0)), "| руины:", d.get("ruins"))
