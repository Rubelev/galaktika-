import http.client, ssl
ctx = ssl.create_default_context()
def get(path):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=30, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s)
for name in ("colony.js?v=2", "ranks.js?v=1", "market.js?v=1"):
    print("  ", name, ":", name in html)
for p in ("/js/market.js?v=1", "/js/colony.js?v=2", "/js/ranks.js?v=1"):
    s, js = get(p)
    print(p, s, len(js), "символов")