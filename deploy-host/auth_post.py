import json, ssl, urllib.parse, urllib.request, http.cookiejar
CTX = ssl._create_unverified_context()
URL = "https://server249.hosting.reg.ru:1500/ispmgr"
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=CTX), urllib.request.HTTPCookieProcessor(cj))
data = urllib.parse.urlencode({"func":"auth","username":"u3699164","password":"xZbjCI5SdM7049mO","out":"json"}).encode()
req = urllib.request.Request(URL, data=data, headers={"User-Agent":"deploy","Content-Type":"application/x-www-form-urlencoded"})
try:
    with opener.open(req, timeout=30) as r:
        body = r.read().decode("utf-8","replace")
    print("POST status ok")
    d = json.loads(body)
    doc = d.get("doc", {})
    print("keys:", list(doc.keys())[:12])
    print("sessid:", doc.get("sessid"))
    print("cookies:", [c.name for c in cj])
    print(body[:200].replace("\n"," "))
except Exception as e:
    print("ERR", type(e).__name__, str(e)[:200])