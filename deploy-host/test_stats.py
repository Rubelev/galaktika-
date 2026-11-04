"""Метрики роста и интереса: вход админом и чтение /api/stats."""
import json
import ssl
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
ADMIN = "ab@btema.ru"


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


raw = open(r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\ADMIN-PASSWORD.txt", encoding="utf-8").read()
import re
lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
password = next(ln for ln in lines if re.fullmatch(r"[A-Za-z0-9@#$%^&*!_+\-=]{8,}", ln))
s, d = call("/api/auth/login", {"email": ADMIN, "password": password})
print("вход админом:", s)
tok = d.get("token")

s, d = call("/api/stats", None, tok)
print("stats:", s)
print(json.dumps(d, ensure_ascii=False, indent=2))

s, d = call("/api/stats")
print("без токена:", s)
