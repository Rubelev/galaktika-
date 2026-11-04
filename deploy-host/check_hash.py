import base64, hashlib, json
p = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\src\data\data\users.json"
users = json.load(open(p, encoding="utf-8"))
u = users[0]
print("email:", u["Email"], "role:", u["Role"])
salt = base64.b64decode(u["Salt"]); expect = base64.b64decode(u["Hash"])
for pwd in ("Docent@1973Docent", "Nnt49!!n", "test1@test.ru", ""):
    calc = hashlib.pbkdf2_hmac("sha256", pwd.encode(), salt, 120000, 32)
    print("%-20s -> %s" % (pwd or "(пусто)", calc == expect))
print("salt b64:", u["Salt"], "| len salt:", len(salt), "| len hash:", len(expect))