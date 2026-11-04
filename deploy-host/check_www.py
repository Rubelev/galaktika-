import json, ssl, urllib.request
ctx = ssl.create_default_context()
for u in ("https://www.warbattleuniverse.com/", "https://warbattleuniverse.com/api/health"):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent":"probe"}), timeout=25, context=ctx) as r:
            print("%-46s %s %s" % (u, r.status, r.read()[:60].decode("utf-8","replace")))
    except Exception as e:
        print(u, "ОШИБКА", type(e).__name__, str(e)[:70])