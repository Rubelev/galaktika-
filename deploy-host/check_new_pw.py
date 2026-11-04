import json, os, ssl, urllib.error, urllib.request
ctx = ssl.create_default_context()
base = "https://warbattleuniverse.com"
pwd = open(r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\ADMIN-PASSWORD.txt", encoding="utf-8").read().splitlines()[2]
def login(p):
    req = urllib.request.Request(base + "/api/auth/login", data=json.dumps({"email": "ab@btema.ru", "password": p}).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "probe"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, json.loads(r.read().decode()).get("role")
    except urllib.error.HTTPError as e:
        return e.code, None
print("новый пароль из файла:", login(pwd))
print("прежний Rubelev@1973Rubelev:", login("Rubelev@1973Rubelev"))
print("старый Docent@1973Docent:", login("Docent@1973Docent"))