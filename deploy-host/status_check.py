import http.client, ssl, socket
ctx = ssl.create_default_context()
def get(path, host="warbattleuniverse.com"):
    c = http.client.HTTPSConnection(host, timeout=20, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read(); c.close()
    return r.status, d
try:
    s, _ = get("/")
    print("https://warbattleuniverse.com/ ->", s)
    s, d = get("/api/health"); print("/api/health ->", s, d[:40].decode())
    s, d = get("/api/market/list"); print("/api/market/list ->", s, d[:40].decode())
    s, d = get("/api/pay/settings"); print("/api/pay/settings ->", s, len(d), "байт")
except Exception as e:
    print("ОШИБКА:", type(e).__name__, str(e)[:100])
try:
    ctx2 = ssl.create_default_context()
    raw = socket.create_connection(("warbattleuniverse.store", 443), timeout=10)
    ss = ctx2.wrap_socket(raw, server_hostname="warbattleuniverse.store"); ss.close()
    print(".store TLS: доверенный")
except Exception as e:
    print(".store TLS: не доверенный —", str(e)[:60])