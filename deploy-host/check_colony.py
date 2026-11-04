import http.client, ssl
ctx = ssl.create_default_context()
def get(path):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=30, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s, "| colony.js подключён:", "colony.js?v=1" in html)
s, js = get("/js/colony.js?v=1")
print("colony.js:", s, len(js), "символов | ColonyMath:", "ColonyMath" in js, "| кнопка:", "🏙 Колония" in js)