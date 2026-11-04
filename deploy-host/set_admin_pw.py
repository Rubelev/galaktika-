import base64, hashlib, json, os, secrets

base = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika"
new_password = "Rubelev@1973Rubelev"

def make(path, bom=False):
    raw = open(path, "rb").read()
    if raw.startswith(b"\xef\xbb\xbf"): raw = raw[3:]
    users = json.loads(raw.decode("utf-8"))
    salt = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", new_password.encode(), salt, 120000, 32)
    for u in users:
        if u["Email"].lower() == "ab@btema.ru":
            u["Salt"] = base64.b64encode(salt).decode()
            u["Hash"] = base64.b64encode(h).decode()
    data = json.dumps(users, ensure_ascii=False, indent=2).encode("utf-8")
    if bom: data = b"\xef\xbb\xbf" + data
    open(path, "wb").write(data)
    print("обновлён:", path, "| пользователей:", len(users))
    return salt, h

# 1. копия, которая уедет на хостинг
salt, h = make(os.path.join(base, r"deploy-host\clean-users.json"))
# 2. исходная база проекта (.NET пишет с BOM)
make(os.path.join(base, r"src\data\data\users.json"), bom=True)

# проверка, что хеш действительно соответствует новому паролю
ok = hashlib.pbkdf2_hmac("sha256", new_password.encode(), salt, 120000, 32) == h
old = hashlib.pbkdf2_hmac("sha256", b"Docent@1973Docent", salt, 120000, 32) == h
print("новый пароль совпадает:", ok, "| старый пароль отклонён:", not old)