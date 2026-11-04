import http.client, json, ssl
ctx = ssl.create_default_context()
def get(path):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=30, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
mods = ["colony.js?v=2","ranks.js?v=1","market.js?v=2","payments.js?v=3","solar.js?v=629"]
print("index:", s, "| модули:", {m: (m in html) for m in mods})
for p in ("/js/market.js?v=2", "/js/colony.js?v=2", "/js/ranks.js?v=1"):
    s, js = get(p); print(p, s, len(js), "символов")
s, d = get("/api/market/list"); print("GET /api/market/list:", s, d[:60])
s, d = get("/api/health"); print("GET /api/health:", s, d[:40])