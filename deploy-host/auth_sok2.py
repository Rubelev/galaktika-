import json, ssl, urllib.parse, urllib.request, http.cookiejar
CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500/ispmgr"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPSHandler(context=CTX), urllib.request.HTTPCookieProcessor(cj))
H = {"User-Agent":"Mozilla/5.0","X-Requested-With":"XMLHttpRequest","Accept":"application/json, text/plain, */*"}

def get(url):
    return op.open(urllib.request.Request(url, headers=H), timeout=30).read().decode("utf-8","replace")

# 1) свежая страница логина -> забираем $features
page = json.loads(get(BASE + "?func=auth&out=json"))
feat = page.get("doc", {}).get("$features", "")
print("features:", feat[:16], "| cookies:", [c.name for c in cj])

# 2) POST с sok
data = urllib.parse.urlencode({"func":"auth","username":"u3699164","password":"xZbjCI5SdM7049mO","sok":feat,"out":"json","lang":"ru"}).encode()
req = urllib.request.Request(BASE, data=data, headers=dict(H, **{"Content-Type":"application/x-www-form-urlencoded"}))
body = op.open(req, timeout=30).read().decode("utf-8","replace")
d = json.loads(body); doc = d.get("doc", {})
print("POST sok -> sessid:", doc.get("sessid"), "| error:", str(doc.get("error"))[:80], "| cookies:", [c.name for c in cj])

# 3) GET с sok
url = BASE + "?" + urllib.parse.urlencode({"func":"auth","username":"u3699164","password":"xZbjCI5SdM7049mO","sok":feat,"out":"json"})
d = json.loads(get(url)); doc = d.get("doc", {})
print("GET sok  -> sessid:", doc.get("sessid"), "| error:", str(doc.get("error"))[:80])