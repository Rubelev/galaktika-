import json, ssl, urllib.error, urllib.request
ctx = ssl.create_default_context()
base = "https://warbattleuniverse.com"
def call(path, payload=None, token=None):
    h = {"User-Agent":"probe","Content-Type":"application/json"}
    if token: h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base+path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")
s, d = call("/api/npcmarket/quote")
print("quote:", s, {k: (v["stock"], v["buy"]) for k, v in list(d.get("prices", {}).items())[:3]})
s, d = call("/api/auth/register", {"email":"npctrade@test.ru","password":"test123456","lastName":"","gameName":"Трейдер","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"npctrade@test.ru","password":"test123456"})
tok = d["token"]
s, d = call("/api/npcmarket/trade", {"key":"grain","qty":100,"side":"buy"}, tok)
print("покупка 100 кг:", s, d)
s, d = call("/api/npcmarket/trade", {"key":"grain","qty":50,"side":"sell"}, tok)
print("продажа 50 кг:", s, d)