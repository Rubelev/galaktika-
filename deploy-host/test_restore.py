"""Проверка восстановления руин: кнопка даёт 1 уровень (2 при свежем броске) и исчезает."""
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


def login(email):
    s, d = call("/api/auth/register", {"email": email, "password": "test123456", "lastName": "",
                                       "gameName": "Тест", "faction": "earth"})
    if s != 200:
        s, d = call("/api/auth/login", {"email": email, "password": "test123456"})
    return d["token"]


def me(tok):
    return json.loads(call("/api/auth/me", None, tok)[1]["profile"])


def make_world(owner_email, idle_days, factories, population):
    """Создаёт колонию у игрока и состаривает её, чтобы после обхода она ушла в реестр."""
    tok = login(owner_email)
    p = me(tok)
    p["credits"] = 250000
    p["colony"] = None
    p["factories"] = factories
    call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
    call("/api/colony/found", {}, tok)
    users = json.loads(ssh("cat " + DATA + "/users.json"))
    for u in users:
        if u["Email"].lower() == owner_email:
            prof = json.loads(u["Profile"])
            prof["lastSeen"] = int(time.time()) - idle_days * 86400
            prof["colony"]["population"] = population
            prof["factories"] = factories
            u["Profile"] = json.dumps(prof, ensure_ascii=False)
    tmp = os.path.join(HERE, "_users_tmp.json")
    open(tmp, "w", encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))
    subprocess.run(["scp"] + OPTS + [tmp, "u3699164@31.31.196.115:" + DATA + "/users.json"], capture_output=True, env=ENV)
    ssh("php /var/www/u3699164/data/bin/world-tick.php")
    return tok


# свежий бросок (33 дня) → max 2 уровня
tokA = make_world("fresh@test.ru", 33, {"robots": 2, "equipment": 1}, 90000)
s, d = call("/api/worlds/abandoned")
w = next((x for x in (d.get("worlds") or []) if x["name"]), None)
print("мир:", bool(w), "| остаток:", w and w["richness"])

tokB = tokA  # мир зарезервирован за хозяином — колонизирует он же
pB = me(tokB)
pB["credits"] = 300000
pB["colony"] = None
pB["resources"] = {"steel": 1000}
call("/api/auth/profile", {"profile": json.dumps(pB)}, tokB)
s, d = call("/api/colony/colonize", {"worldId": w["id"]}, tokB)
col = d.get("colony") or {}
print("колонизация:", s, "| руины:", col.get("ruins"), "| фабрики:", col.get("ruins") and "пусто")

# восстанавливаем роботов
s, d = call("/api/colony/restore", {"id": "robots"}, tokB)
print("восстановление:", s, "| уровень:", (d.get("factory") or {}).get("level"), "| цена:", d.get("cost"),
      "| осталось руин:", len(d.get("ruins") or []))
s, d = call("/api/colony/restore", {"id": "robots"}, tokB)
print("повторно:", s, d.get("error"))

# проверяем, что кнопка исчезла: в профиле руин меньше, фабрика есть
p = me(tokB)
print("после: factories =", p.get("factories"), "| ruins =", (p.get("colony") or {}).get("ruins"))
