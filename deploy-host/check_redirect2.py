import ssl, urllib.request
ctx = ssl.create_default_context()
for u in ("https://warbattleuniverse.com/", "http://warbattleuniverse.com/"):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent":"probe"}), timeout=20, context=ctx) as r:
            print("%-34s %s -> %s" % (u, r.status, r.geturl()))
    except urllib.error.HTTPError as e:
        print("%-34s HTTP %s (Location: %s)" % (u, e.code, e.headers.get("Location")))
    except Exception as e:
        print("%-34s ОШИБКА %s %s" % (u, type(e).__name__, str(e)[:70]))