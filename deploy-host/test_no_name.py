import json, ssl, urllib.request, urllib.error
ctx = ssl.create_default_context()
base = "https://warbattleuniverse.com"
payload = {"email": "noname@test.ru", "password": "test123456", "gameName": "БезФамилии", "faction": "earth"}
req = urllib.request.Request(base+"/api/auth/register", data=json.dumps(payload).encode(),
                             headers={"Content-Type": "application/json", "User-Agent": "probe"})
try:
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        d = json.loads(r.read().decode())
        print("регистрация без ФИО:", r.status, "| роль:", d.get("role"), "| профиль:", d.get("profile")[:90])
except urllib.error.HTTPError as e:
    print("регистрация без ФИО:", e.code, e.read()[:120])