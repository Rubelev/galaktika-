import http.client, ssl
ctx = ssl.create_default_context()
def get(path, host="warbattleuniverse.com"):
    c = http.client.HTTPSConnection(host, timeout=25, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s, "| v630:", "solar.js?v=630" in html, "| ranks v2:", "ranks.js?v=2" in html, "| https-редирект:", "location.protocol" in html)
s, js = get("/js/ranks.js?v=2"); print("ranks.js:", s, "| серверная проверка:", "api/rank/check" in js)
s, d = get("/api/health"); print("health:", s)