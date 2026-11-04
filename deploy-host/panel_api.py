import json
import ssl
import sys
import urllib.parse
import urllib.request

CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500"
USER = "u3699164"
PWD = "xZbjCI5SdM7049mO"


def api(params):
    url = BASE + "/api/v5?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "deploy"})
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        return r.status, r.read().decode("utf-8", "replace")


try:
    st, body = api({"func": "auth", "username": USER, "password": PWD, "out": "json"})
    print("auth:", st, body[:300])
except Exception as e:
    print("auth ERR:", type(e).__name__, str(e)[:200])
    sys.exit(1)

try:
    data = json.loads(body)
    sid = data.get("doc", {}).get("sessid") or data.get("sessid")
except Exception:
    sid = None
print("sessid:", (sid or "")[:12], "...")

if sid:
    for func in ("ftp", "webdomain", "site"):
        try:
            st, body = api({"func": func, "sessid": sid, "out": "json"})
            print("\n===", func, st)
            print(body[:800])
        except Exception as e:
            print("\n===", func, "ERR", type(e).__name__, str(e)[:150])
