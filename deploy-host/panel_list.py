import json
import ssl
import sys
import urllib.parse
import urllib.request

CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500/ispmgr"
USER = "u3699164"
PWD = "xZbjCI5SdM7049mO"


def api(**params):
    params.setdefault("out", "json")
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "deploy"})
    with urllib.request.urlopen(req, timeout=40, context=CTX) as r:
        return r.read().decode("utf-8", "replace")


def as_json(text):
    try:
        return json.loads(text)
    except Exception:
        return None


auth = as_json(api(func="auth", username=USER, password=PWD))
sid = None
if auth:
    doc = auth.get("doc", auth)
    sid = doc.get("sessid") or doc.get("session")
print("sessid:", (sid or "НЕТ")[:16])

if not sid:
    print(json.dumps(auth, ensure_ascii=False)[:500])
    sys.exit(1)

for func in ("ftp", "webdomain", "site", "wwwdomain"):
    try:
        data = as_json(api(func=func, sessid=sid))
        print("\n===", func)
        if not data:
            print("не JSON")
            continue
        items = data.get("doc", {}).get("elem", [])
        if isinstance(items, dict):
            items = [items]
        print("записей:", len(items))
        for it in items[:12]:
            keep = {k: it.get(k) for k in ("name", "id", "login", "home", "docroot", "domain", "owner", "email") if it.get(k)}
            print("   ", json.dumps(keep, ensure_ascii=False))
    except Exception as e:
        print("\n===", func, "ERR", type(e).__name__, str(e)[:120])
