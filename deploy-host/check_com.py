import json, ssl, urllib.request, urllib.error
ctx = ssl.create_default_context()   # строгая проверка
base = "https://warbattleuniverse.com"
def get(p):
    try:
        with urllib.request.urlopen(urllib.request.Request(base+p, headers={"User-Agent":"probe"}), timeout=30, context=ctx) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
for p in ("/", "/js/solar.js", "/js/payments.js", "/app.css", "/api/health", "/api/pay/settings"):
    s, b = get(p)
    print("%-22s %s %8d байт" % (p, s, len(b)))
data = json.dumps({"email":"ab@btema.ru","password":"Rubelev@1973Rubelev"}).encode()
req = urllib.request.Request(base+"/api/auth/login", data=data, headers={"Content-Type":"application/json","User-Agent":"probe"})
with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
    d = json.loads(r.read().decode())
print("вход админом:", r.status, "| роль:", d.get("role"))