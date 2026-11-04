import http.client, ssl
ctx = ssl.create_default_context()
def get(p):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=25, context=ctx)
    c.request("GET", p, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read(); c.close()
    return r.status, len(d)
for p in ("/", "/js/solar.js?v=632", "/api/status", "/api/health"):
    print(p, get(p))