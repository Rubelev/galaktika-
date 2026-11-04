"""Прогон тестовых игроков: разные стили игры, замер прогресса и метрик."""
import json
import ssl
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
ADMIN = "ab@btema.ru"
PWD_FILE = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\ADMIN-PASSWORD.txt"


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


def prof(tok):
    return json.loads(call("/api/auth/me", None, tok)[1]["profile"])


def register(email, name, faction):
    s, d = call("/api/auth/register", {"email": email, "password": "test123456", "lastName": "",
                                       "gameName": name, "faction": faction})
    if s != 200:
        s, d = call("/api/auth/login", {"email": email, "password": "test123456"})
    return d["token"], d["token"]


def report(tok, label, start_credits):
    p = prof(tok)
    print("  %-14s кредиты %8s (было %s) | кораблей %s | колония %s | звание %s" % (
        label, p.get("credits"), start_credits,
        len(p.get("ships") or []), "есть" if p.get("colony") else "нет",
        "—"))


# --- игрок 1: торговец (играет на NPC-рынке) ---
t0 = time.time()
tok1, _ = register("p_trader@test.ru", "Торговец", "earth")
p1 = prof(tok1)
s1 = p1.get("credits")
call("/api/npcmarket/trade", {"key": "grain", "qty": 500, "side": "sell"}, tok1)
call("/api/npcmarket/trade", {"key": "steel", "qty": 200, "side": "sell"}, tok1)
report(tok1, "торговец", s1)

# --- игрок 2: промышленник (копит и строит) ---
tok2, _ = register("p_maker@test.ru", "Промышленник", "mars")
p2 = prof(tok2)
s2 = p2.get("credits")
call("/api/auth/profile", {"profile": json.dumps({**p2, "resources": {"steel": 400}})}, tok2)
s, d = call("/api/build/start", {"kind": "factory", "id": "robots"}, tok2)
print("  промышленник поставил стройку:", s, "| очередь:", len((d.get("queue") or [])))
report(tok2, "промышленник", s2)

# --- игрок 3: новичок, сразу колония ---
tok3, _ = register("p_new@test.ru", "Новичок", "earth")
p3 = prof(tok3)
s3 = p3.get("credits")
s, d = call("/api/colony/found", {}, tok3)
print("  новичок основал колонию:", s, "| население:", ((d.get("colony") or {}).get("population")))
report(tok3, "новичок", s3)
call("/api/chat/send", {"text": "всем привет, только начал"}, tok3)

elapsed = time.time() - t0
print("время прогона: %.1f с" % elapsed)

# --- метрики ---
raw = open(PWD_FILE, encoding="utf-8").read()
import re
password = next(ln.strip() for ln in raw.splitlines() if ln.strip() and re.fullmatch(r"[A-Za-z0-9@#$%^&*!_+\-=]{8,}", ln.strip()))
s, d = call("/api/auth/login", {"email": ADMIN, "password": password})
s, st = call("/api/stats", None, d.get("token"))
print("\nМЕТРИКИ:", s)
print(json.dumps(st, ensure_ascii=False, indent=2))
