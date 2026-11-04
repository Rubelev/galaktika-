import ssl, urllib.request
ctx = ssl.create_default_context()
for p in ("/", "/js/stats.js?v=1", "/api/stats", "/api/status"):
    req = urllib.request.Request("https://warbattleuniverse.com" + p, headers={"User-Agent": "probe"})
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
            print(p, r.status)
    except Exception as e:
        print(p, "->", getattr(e, "code", e))