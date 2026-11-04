import ssl, urllib.request
ctx = ssl.create_default_context()
for p in ("/", "/js/colony.js?v=6", "/api/worlds/abandoned", "/api/status"):
    req = urllib.request.Request("https://warbattleuniverse.com" + p, headers={"User-Agent": "probe"})
    with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
        print(p, r.status)