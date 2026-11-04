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

s, d = call("/api/auth/register", {"email":"build@test.ru","password":"test123456","lastName":"","gameName":"Строитель","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"build@test.ru","password":"test123456"})
tok = d["token"]
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["credits"] = 300000
p["resources"] = {"steel": 1000}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)

s, d = call("/api/build/factory", {"id":"robots"}, tok)
print("стройка 1 уровня:", s, d)
s, d = call("/api/build/factory", {"id":"robots"}, tok)
print("стройка 2 уровня:", s, "| уровень:", d.get("level"), "| цена:", d.get("cost"))
s, d = call("/api/build/factory", {"id":"bad"}, tok)
print("неизвестное:", s, d.get("error"))
for i in range(3):
    s, d = call("/api/build/factory", {"id":"robots"}, tok)
print("после максимума:", s, d.get("error"))