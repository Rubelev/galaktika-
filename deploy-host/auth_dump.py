import json, ssl, urllib.parse, urllib.request
CTX = ssl._create_unverified_context()
url = "https://server249.hosting.reg.ru:1500/ispmgr?" + urllib.parse.urlencode({
    "func":"auth","username":"u3699164","password":"xZbjCI5SdM7049mO","out":"json"})
body = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"}), timeout=30, context=CTX).read().decode("utf-8","replace")
d = json.loads(body)
doc = d.get("doc", {})
print("все ключи:", sorted(doc.keys()))
for k, v in doc.items():
    if isinstance(v, str) and len(v) < 80:
        print("  %-14s = %s" % (k, v))