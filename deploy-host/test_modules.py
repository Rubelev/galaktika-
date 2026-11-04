import json, ssl, urllib.error, urllib.request
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

s, d = call("/api/auth/register", {"email":"mod@test.ru","password":"test123456","lastName":"","gameName":"Модуль","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"mod@test.ru","password":"test123456"})
tok = d["token"]
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["credits"] = 700000
p["resources"] = {"steel": 300, "chips": 100}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)

s, d = call("/api/build/module", {"kind":"cloner"}, tok)
print("клон-комплекс:", s, "| всего:", d.get("count"), "| кредиты:", d.get("credits"))
s, d = call("/api/build/module", {"kind":"medical_build"}, tok)
print("медмодуль (постройка):", s, "| всего:", d.get("count"), "| кредиты:", d.get("credits"))
s, d = call("/api/build/module", {"kind":"medical_buy"}, tok)
print("медмодуль (покупка) без денег:", s, d.get("error"))
s, d = call("/api/build/module", {"kind":"nope"}, tok)
print("неизвестный модуль:", s, d.get("error"))