import json, ssl, urllib.parse, urllib.request
CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500/ispmgr"
def call(**p):
    p.setdefault("out","json")
    url = BASE + "?" + urllib.parse.urlencode(p)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"}), timeout=30, context=CTX) as r:
            return r.read().decode("utf-8","replace")
    except Exception as e:
        return "ERR %s %s" % (type(e).__name__, str(e)[:80])
for key in ("password","passwd","pwd"):
    body = call(func="auth", username="u3699164", **{key: "xZbjCI5SdM7049mO"})
    try:
        d = json.loads(body); doc = d.get("doc", {})
        print("%-9s sessid=%s error=%s keys=%s" % (key, bool(doc.get("sessid")), doc.get("error"), [k for k in doc if k.startswith("$") or k in ("sessid","twofactor","error")][:8]))
    except Exception:
        print("%-9s не JSON: %s" % (key, body[:120]))