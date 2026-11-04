import http.client, ssl
ctx = ssl.create_default_context()
def get(p):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=25, context=ctx)
    c.request("GET", p, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s, "| chat.js:", "chat.js?v=1" in html)
s, js = get("/js/chat.js?v=1"); print("chat.js:", s, "| API чата:", "api/chat/send" in js)
s, d = get("/api/chat/list"); print("chat/list:", s, d[:40])