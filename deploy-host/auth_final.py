import json, ssl, urllib.parse, urllib.request
CTX = ssl._create_unverified_context()
BASE = "https://server249.hosting.reg.ru:1500/ispmgr"
url = BASE + "?" + urllib.parse.urlencode({"func":"auth","username":"u3699164","password":"xZbjCI5SdM7049mO","out":"json"})
body = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"}), timeout=30, context=CTX).read().decode("utf-8","replace")
d = json.loads(body); doc = d.get("doc", {})
print("ключи:", sorted(k for k in doc if not k.startswith("$"))[:10])
print("sessid:", doc.get("sessid"))
print("error:", doc.get("error"))