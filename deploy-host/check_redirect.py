import ssl, urllib.request
ctx = ssl._create_default_https_context()
for u in ("http://warbattleuniverse.com/", "https://www.warbattleuniverse.com/", "http://warbattleuniverse.store/"):
    try:
        req = urllib.request.Request(u, headers={"User-Agent":"probe"})
        with urllib.request.urlopen(req, timeout=20) as r:
            print("%-38s %s -> %s" % (u, r.status, r.geturl()))
    except Exception as e:
        print("%-38s ОШИБКА %s %s" % (u, type(e).__name__, str(e)[:60]))