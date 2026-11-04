import ssl
import urllib.parse
import urllib.request

CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500"
USER = "u3699164"
PWD = "xZbjCI5SdM7049mO"

ENDPOINTS = [
    "/",
    "/ispmgr",
    "/ispmgr?func=auth&username={u}&password={p}&out=json",
    "/api/v5/auth",
    "/api/v5/",
    "/api",
]

for ep in ENDPOINTS:
    url = BASE + ep.format(u=urllib.parse.quote(USER), p=urllib.parse.quote(PWD))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "deploy"})
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            body = r.read(400).decode("utf-8", "replace").replace("\n", " ")
            print("%-60s %s %s" % (ep[:60], r.status, body[:160]))
    except Exception as e:
        print("%-60s ERR %s %s" % (ep[:60], type(e).__name__, str(e)[:90]))
