import json, ssl, urllib.request
ctx = ssl._create_unverified_context()
base = "https://warbattleuniverse.store"
def get(p):
    with urllib.request.urlopen(urllib.request.Request(base+p, headers={"User-Agent":"probe"}), timeout=30, context=ctx) as r:
        return r.status, r.read()
for p in ("/", "/js/payments.js", "/api/pay/settings", "/api/health"):
    s, b = get(p)
    print(p, s, len(b), "bytes")
s, b = get("/api/pay/settings")
print("settings:", b.decode("utf-8")[:120])
data = json.dumps({"email":"ab@btema.ru","password":"Docent@1973Docent"}).encode()
req = urllib.request.Request(base+"/api/auth/login", data=data, headers={"Content-Type":"application/json","User-Agent":"probe"})
with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
    print("admin login:", r.status)