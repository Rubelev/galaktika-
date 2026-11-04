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

s, d = call("/api/auth/register", {"email":"hire@test.ru","password":"test123456","lastName":"","gameName":"Наниматель","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"hire@test.ru","password":"test123456"})
tok = d["token"]
p = json.loads(call("/api/auth/me",None,tok)[1]["profile"])
print("доки по умолчанию:", p.get("dockSlots"), "| кредиты:", p.get("credits"), "| зерно:", (p.get("resources") or {}).get("grain"))

for i in range(3):
    s, d = call("/api/rent", {"what":"dock"}, tok)
    print("  место в доке:", s, "| всего:", d.get("dockSlots"), "| кредиты:", round(d.get("credits",0)))
s, d = call("/api/rent", {"what":"workshop"}, tok)
print("мастерская:", s, "| всего:", d.get("workshops"), "| кредиты:", round(d.get("credits",0)))

s, d = call("/api/hire", {"count": 1000}, tok)
print("найм 1000 (деньги+зерно):", s, d)

s, d = call("/api/hire", {"count": 50}, tok)
print("найм меньше 100:", s, d.get("error"))