import json, ssl, urllib.request, urllib.error
ctx = ssl._create_unverified_context()
base = "https://warbattleuniverse.store"
def login(pwd):
    data = json.dumps({"email":"ab@btema.ru","password":pwd}).encode()
    req = urllib.request.Request(base+"/api/auth/login", data=data, headers={"Content-Type":"application/json","User-Agent":"probe"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            body = json.loads(r.read().decode())
            return r.status, body.get("role"), bool(body.get("token"))
    except urllib.error.HTTPError as e:
        return e.code, None, False
print("новый пароль :", login("Rubelev@1973Rubelev"))
print("старый пароль:", login("Docent@1973Docent"))