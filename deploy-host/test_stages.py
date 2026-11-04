"""Этапы колонии: лунная база → планета → гравитационный лифт."""
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
    return subprocess.run(["ssh"] + OPTS + [HOST, cmd], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", env=ENV).stdout


def save_users(users):
    tmp = os.path.join(HERE, "_users_tmp.json")
    open(tmp, "w", encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))
    subprocess.run(["scp"] + OPTS + [tmp, "u3699164@31.31.196.115:" + DATA + "/users.json"],
                   capture_output=True, env=ENV)


def patch(email, fn):
    users = json.loads(ssh("cat " + DATA + "/users.json"))
    for u in users:
        if u["Email"].lower() == email:
            prof = json.loads(u["Profile"])
            fn(prof)
            u["Profile"] = json.dumps(prof, ensure_ascii=False)
    save_users(users)


s, d = call("/api/auth/register", {"email": "stage@test.ru", "password": "test123456",
                                   "lastName": "", "gameName": "Офицер", "faction": "earth"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "stage@test.ru", "password": "test123456"})
tok = d["token"]

patch("stage@test.ru", lambda p: p.update({
    "credits": 5000000,
    "resources": {"steel": 5000, "chips": 500, "grain": 100000, "water": 10000},
    "colony": {
        "world": "kepler", "name": "Новый Кеплер", "stage": "moon", "founded": int(time.time()),
        "lastTick": int(time.time()), "population": 120000, "happiness": 75, "taxRate": 0.10,
        "taxCollected": 0, "daysLived": 0, "defense": 0, "raids": 0, "lastRaid": int(time.time()),
        "nextRaidIn": 999 * 3600, "lastReport": None, "ruins": [], "autonomy": False,
    },
}))

s, d = call("/api/colony/tick", {}, tok)
col = d.get("colony") or {}
print("этап:", col.get("stage"), "| население:", round(col.get("population", 0)))

s, d = call("/api/colony/stage", {"to": "elevator"}, tok)
print("лифт на луне:", s, d.get("error"))

s, d = call("/api/colony/stage", {"to": "planet"}, tok)
print("спуск на планету:", s, "| этап:", d.get("stage"), "| потолок:", d.get("capacity"), "| кредиты:", round(d.get("credits", 0)))

s, d = call("/api/colony/stage", {"to": "elevator"}, tok)
print("лифт до 500 000 жителей:", s, d.get("error"))

patch("stage@test.ru", lambda p: p["colony"].update({"population": 600000}))
s, d = call("/api/colony/stage", {"to": "elevator"}, tok)
print("лифт при 600 000:", s, "| этап:", d.get("stage"), "| потолок:", d.get("capacity"))

s, d = call("/api/colony/tick", {}, tok)
print("после лифта: население", round((d.get("colony") or {}).get("population", 0)))
