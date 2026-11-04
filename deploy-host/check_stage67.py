import http.client, json, ssl
ctx = ssl.create_default_context()
def get(path):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=25, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s, "| v631:", "solar.js?v=631" in html, "| market v3:", "market.js?v=3" in html)
s, js = get("/js/market.js?v=3")
print("market.js:", s, "| серверный рынок NPC:", "npcmarket/trade" in js, "| серверный рынок игроков:", "market/offer" in js)
s, js2 = get("/js/solar.js?v=631")
print("solar.js:", s, "| подтягивание профиля:", "pullServerProfile" in js2, "| периодическая синхронизация:", "setInterval(() => { if (authToken && currentUser) syncProfile(); }, 60000)" in js2)
s, d = get("/api/npcmarket/quote"); print("quote:", s, d[:80])