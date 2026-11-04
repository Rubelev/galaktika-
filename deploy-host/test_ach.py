import json, ssl, urllib.error, urllib.request
ctx = ssl.create_default_context(); base = "https://warbattleuniverse.com"
def call(path, payload=None, token=None):
    h = {"User-Agent":"t","Content-Type":"application/json"}
    if token: h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base+path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")
s, d = call("/api/auth/register", {"email":"ach@test.ru","password":"test123456","lastName":"","gameName":"Достиженец","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"ach@test.ru","password":"test123456"})
tok = d["token"]
s, d = call("/api/quests", None, tok)
print("квестов:", len(d.get("quests") or []), "| достижений:", len(d.get("achievements") or []))
print("квесты:", [q["key"] for q in (d.get("quests") or [])])
print("достижения:", [a["title"] for a in (d.get("achievements") or [])][:4], "...")
s, d = call("/api/npcmarket/trade", {"key":"steel","qty":50,"side":"sell"}, tok)
s, d = call("/api/rent", {"what":"dock"}, tok)
print("аренда:", s, "| кредиты:", round(d.get("credits",0)))
s, d = call("/api/quests", None, tok)
done = [q["key"] for q in (d.get("quests") or []) if q["done"]]
print("закрыто:", done, "| кристаллы:", d.get("eternity"))