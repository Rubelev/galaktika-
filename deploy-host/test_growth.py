"""Рост населения и волны переселенцев: профиль правим на сервере, тик — через API."""
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


def load_users():
    return json.loads(ssh("cat " + DATA + "/users.json"))


def save_users(users):
    tmp = os.path.join(HERE, "_users_tmp.json")
    open(tmp, "w", encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))
    subprocess.run(["scp"] + OPTS + [tmp, "u3699164@31.31.196.115:" + DATA + "/users.json"],
                   capture_output=True, env=ENV)


s, d = call("/api/auth/register", {"email": "growth@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Рост", "faction": "earth"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "growth@test.ru", "password": "test123456"})
tok = d["token"]

users = load_users()
for u in users:
    if u["Email"].lower() == "growth@test.ru":
        prof = json.loads(u["Profile"])
        prof["credits"] = 200000
        prof["colony"] = {
            "world": "kepler", "name": "Новый Кеплер", "founded": int(time.time()) - 120 * 86400,
            "lastTick": int(time.time()), "population": 50000, "happiness": 70, "taxRate": 0.10,
            "taxCollected": 0, "daysLived": 0, "defense": 0, "raids": 0,
            "lastRaid": int(time.time()), "nextRaidIn": 999 * 3600, "lastReport": None, "ruins": [],
        }
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
save_users(users)

print("старт: 50 000 жителей, 200 000 кр")
for step in range(1, 5):
    users = load_users()
    for u in users:
        if u["Email"].lower() == "growth@test.ru":
            prof = json.loads(u["Profile"])
            prof["colony"]["lastTick"] = int(time.time()) - 30 * 86400
            prof["resources"] = {"grain": 3_000_000, "water": 200_000}
            u["Profile"] = json.dumps(prof, ensure_ascii=False)
    save_users(users)

    s, d = call("/api/colony/tick", {}, tok)
    col = d.get("colony") or {}
    rep = d.get("report") or {}
    print("%3d дн: население %9.0f | налоги %11.0f | счастье %3.0f | волна %s | зерно %s" % (
        step * 30, col.get("population", 0), rep.get("credits", 0), col.get("happiness", 0),
        rep.get("wave"), round((d.get("resources") or {}).get("grain", 0))))

p = json.loads(sshonline := call("/api/auth/me", None, tok)[1]["profile"])
print("кредиты после 120 дней:", round(p.get("credits", 0)))
