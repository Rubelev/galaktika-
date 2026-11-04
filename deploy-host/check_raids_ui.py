import http.client, ssl
ctx = ssl.create_default_context()
def get(p):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=25, context=ctx)
    c.request("GET", p, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s, "| colony v4:", "colony.js?v=4" in html)
s, js = get("/js/colony.js?v=4")
print("colony.js:", s, "| оборона:", "buy-defense" in js, "| отчёт о налёте:", "lastReport" in js, "| API обороны:", "colony/defense" in js)