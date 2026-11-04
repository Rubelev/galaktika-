import re, ssl, urllib.parse, urllib.request, http.cookiejar, json
CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500/ispmgr"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPSHandler(context=CTX), urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent","Mozilla/5.0")]
html = op.open(BASE, timeout=30).read().decode("utf-8","replace")
print("login page:", len(html), "bytes, cookies:", [c.name for c in cj])
sok = re.search(r'name="sok"\s+value="([^"]+)"', html)
print("sok:", sok.group(1)[:16] if sok else "нет")
data = {"func":"auth","username":"u3699164","password":"xZbjCI5SdM7049mO","out":"json"}
if sok: data["sok"] = sok.group(1)
req = urllib.request.Request(BASE, data=urllib.parse.urlencode(data).encode(), headers={"Content-Type":"application/x-www-form-urlencoded"})
body = op.open(req, timeout=30).read().decode("utf-8","replace")
d = json.loads(body) if body.strip().startswith("{") else {}
doc = d.get("doc", {})
print("after POST: sessid =", doc.get("sessid"), "| error =", doc.get("error"))
print("cookies:", [c.name for c in cj])