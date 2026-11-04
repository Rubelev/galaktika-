import json, ssl, urllib.error, urllib.request
ctx = ssl.create_default_context(); base = "https://warbattleuniverse.com"
def call(path, payload=None, token=None):
    h = {"User-Agent":"agent","Content-Type":"application/json"}
    if token: h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base+path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")
def login(email, pwd):
    return call("/api/auth/login", {"email": email, "password": pwd})[1]["token"]
def me(tok):
    return json.loads(call("/api/auth/me", None, tok)[1]["profile"])

T = login("trader@warbattleuniverse.com", "GalaktikaTrader2026!")
A = login("agent@warbattleuniverse.com", "GalaktikaAgent2026!")

# Караванщик не закупается, если у него уже висит непроданный лот
s, mk = call("/api/market/list")
mine = [o for o in (mk.get("offers") or []) if str(o.get("seller")) == "Караванщик"]
pt0 = me(T)
have0 = int((pt0.get("resources") or {}).get("grain", 0))
if mine:
    print("уже есть лот на рынке:", len(mine), "— новых закупок нет")
    off = {"id": None}
elif have0 < 500:
    s, d = call("/api/npcmarket/trade", {"key":"grain","qty":5000,"side":"buy"}, T)
    print("Караванщик купил 5000 кг:", s, "за", round(d.get("sum",0)))
    s, d = call("/api/market/offer", {"resource":"grain","qty":5000,"price":6.5}, T)
    off = d.get("offer") or {}
    print("выставил лот:", s, "| id:", off.get("id"))
else:
    s, d = call("/api/market/offer", {"resource":"grain","qty":have0,"price":6.5}, T)
    off = d.get("offer") or {}
    print("выставил склад:", s, have0, "кг | id:", off.get("id"))
if off.get("id"):
    pa = me(A)
    pop = (pa.get("colony") or {}).get("population", 0)
    have = int((pa.get("resources") or {}).get("grain", 0))
    days = have / max(1.0, pop * 0.3)
    buy = 0
    if days < 12:                      # держим запас 12–17 дней
        buy = int(pop * 0.3 * 5)       # докупаем ровно на 5 дней
    if buy >= 100:
        s, d = call("/api/market/buy", {"id": off["id"], "qty": buy}, A)
        print("Автопилот купил", buy, "кг:", s, "за", round(d.get("sum",0)))

pa, pt = me(A), me(T)
print("Автопилот: кредиты", round(pa.get("credits",0)), "| зерно", round((pa.get("resources") or {}).get("grain",0)),
      "| вода", round((pa.get("resources") or {}).get("water",0)), "| население", round((pa.get("colony") or {}).get("population",0)))
print("Караванщик: кредиты", round(pt.get("credits",0)), "| зерно", round((pt.get("resources") or {}).get("grain",0)),
      "| до колонии", 300000 - round(pt.get("credits",0)))