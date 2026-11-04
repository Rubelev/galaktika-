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

s, d = call("/api/auth/register", {"email":"ship@test.ru","password":"test123456","lastName":"","gameName":"Корабел","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"ship@test.ru","password":"test123456"})
tok = d["token"]
p = json.loads(call("/api/auth/me", None, tok)[1]["profile"])
p["resources"] = {"steel": 500, "copper": 200, "nickel": 100, "silver": 5, "gold": 2, "chips": 20, "boards": 30, "manip": 5}
call("/api/auth/profile", {"profile": json.dumps(p)}, tok)

s, d = call("/api/ship/buy", {"id": "jet_scout"}, tok)
print("покупка разведчика:", s, "| кораблей:", d.get("ships"), "| кредиты:", d.get("credits"), "| сталь:", (d.get("resources") or {}).get("steel"))
s, d = call("/api/ship/buy", {"id": "grav_colossus"}, tok)
print("линкор без денег/деталей:", s, d.get("error"))
s, d = call("/api/ship/buy", {"id": "nope"}, tok)
print("неизвестный корабль:", s, d.get("error"))
s, d = call("/api/ship/sell", {"index": 0}, tok)
print("продажа:", s, "| возврат:", d.get("refund"), "| кораблей:", d.get("ships"))
s, d = call("/api/ship/sell", {"index": 5}, tok)
print("продажа несуществующего:", s, d.get("error"))
s, d = call("/api/ship/buy", {"id": "jet_scout"})
print("без токена:", s, d.get("error"))