import json, ssl, urllib.parse, urllib.request
CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500/ispmgr"
def api(**p):
    p.setdefault("out","json")
    url = BASE + "?" + urllib.parse.urlencode(p)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"deploy"}), timeout=30, context=CTX) as r:
        return r.read().decode("utf-8","replace")
for user, pwd in [("u3699164","xZbjCI5SdM7049mO"), ("ab@btema.ru","xZbjCI5SdM7049mO")]:
    body = api(func="auth", username=user, password=pwd)
    d = json.loads(body)
    doc = d.get("doc", {})
    print("=== login", user)
    print("   ключи:", [k for k in doc.keys() if k in ("sessid","session","$func","error","msg")])
    print("   error:", doc.get("error"), "| msg:", doc.get("msg"), "| $func:", doc.get("$func"))
    print("   фрагмент:", body[:200].replace("\n"," "))