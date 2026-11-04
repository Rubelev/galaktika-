import json, ssl, urllib.parse, urllib.request
CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500/ispmgr"
def auth(user, pwd):
    url = BASE + "?" + urllib.parse.urlencode({"func":"auth","username":user,"password":pwd,"out":"json"})
    body = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"}), timeout=30, context=CTX).read().decode("utf-8","replace")
    try:
        doc = json.loads(body).get("doc", {})
    except Exception:
        return "не JSON"
    return "sessid" in doc and "ЕСТЬ" or ("ошибка: " + str(doc.get("error", {}).get("detail", {}).get("$", "форма входа")))
for u, p in [("u3699164","Nnt49!!n"), ("ab@btema.ru","Nnt49!!n"), ("u3699164","xZbjCI5SdM7049mO")]:
    print("%-14s / %-18s -> %s" % (u, p, auth(u, p)))