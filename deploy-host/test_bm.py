import json, ssl, time, urllib.error, urllib.request
ctx = ssl.create_default_context()
base = "https://warbattleuniverse.com"
def call(path, payload=None, token=None):
    h = {"User-Agent":"test","Content-Type":"application/json"}
    if token: h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base+path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

s, d = call("/api/auth/register", {"email":"bmtest@test.ru", "password":"test123456","lastName":"","gameName":"Барыга","faction":"earth"})
if s != 200:
    s, d = call("/api/auth/login", {"email": "bmtest@test.ru", "password": "test123456"})
tok = d.get("token")
print("регистрация/вход:", s, bool(tok))
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["resources"] = {"quartz": 5000, "eternity": 0}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)

s, d = call("/api/bm/sell", {"resource":"quartz","qty":1000}, tok)
print("продажа 1000 кварца:", s, d)
s, d = call("/api/bm/sell", {"resource":"quartz","qty":50}, tok)
print("меньше 100:", s, d.get("error"))
s, d = call("/api/bm/sell", {"resource":"grain","qty":100}, tok)
print("не принимают:", s, d.get("error"))
s, d = call("/api/bm/sell", {"resource":"quartz","qty":999999}, tok)
print("больше склада:", s, d.get("error"))
prof = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
print("кварц остался:", prof["resources"].get("quartz"), "| кристаллы:", prof["resources"].get("eternity"))