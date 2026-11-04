import http.client, ssl
ctx = ssl.create_default_context()
def get(path):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=30, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s)
for name in ("colony.js?v=1", "ranks.js?v=1", "payments.js?v=3", "solar.js?v=629"):
    print("  ", name, ":", name in html)
for path in ("/js/colony.js?v=1", "/js/ranks.js?v=1"):
    s, js = get(path)
    print(path, s, len(js), "символов")