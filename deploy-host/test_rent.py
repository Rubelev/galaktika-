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

s, d = call("/api/auth/register", {"email":"rent@test.ru","password":"test123456","lastName":"","gameName":"Арендатор","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"rent@test.ru","password":"test123456"})
tok = d["token"]
print("стартовые кредиты:", json.loads(call("/api/auth/me",None,tok)[1]["profile"]).get("credits"))

for i in range(2):
    s, d = call("/api/rent", {"what":"dock"}, tok)
    print("аренда дока:", s, "| мест:", d.get("dockSlots"), "| кредиты:", round(d.get("credits",0)), d.get("error") or "")
s, d = call("/api/rent", {"what":"workshop"}, tok)
print("мастерская:", s, "| всего:", d.get("workshops"), "| кредиты:", round(d.get("credits",0)))
s, d = call("/api/rent", {"what":"dock"}, tok)
print("третье место:", s, "| мест:", d.get("dockSlots"), "| кредиты:", round(d.get("credits",0)))
s, d = call("/api/rent", {"what":"nope"}, tok)
print("неизвестная аренда:", s, d.get("error"))
s, d = call("/api/rent", {"what":"dock"})
print("без токена:", s, d.get("error"))