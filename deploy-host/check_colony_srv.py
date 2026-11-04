import http.client, ssl
ctx = ssl.create_default_context()
def get(p):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=25, context=ctx)
    c.request("GET", p, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s, "| colony v3:", "colony.js?v=3" in html)
s, js = get("/js/colony.js?v=3"); print("colony.js:", s, "| серверный тик:", "api/colony/tick" in js, "| основание на сервере:", "api/colony/found" in js)