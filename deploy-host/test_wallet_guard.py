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

s, d = call("/api/auth/register", {"email":"cheat@test.ru","password":"test123456","lastName":"","gameName":"Читер","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"cheat@test.ru","password":"test123456"})
tok = d["token"]

def me():
    s, d = call("/api/auth/me", None, tok)
    p = json.loads(d["profile"])
    return p.get("credits"), (p.get("resources") or {}).get("grain")

print("стартовые:", me())
# обычная трата — не ловится
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"]); p["credits"] = 50000
print("обычное изменение 50000:", call("/api/auth/profile", {"profile": json.dumps(p)}, tok)[1], me())
# подмена: 999 999 999
p["credits"] = 999999999
s, d = call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
print("подмена кредитов:", s, d, "| стало:", me())
# подмена ресурсов
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["resources"] = {"grain": 10**9}
s, d = call("/api/auth/profile", {"profile": json.dumps(p)}, tok)
print("подмена зерна:", s, d.get("anomaly"), "| стало:", me())