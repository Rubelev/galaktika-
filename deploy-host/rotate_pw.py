import base64, hashlib, json, os, secrets, string

base = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika"
alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
pwd = "".join(secrets.choice(alphabet) for _ in range(24))

def update(path, bom=False):
    raw = open(path, "rb").read()
    if raw.startswith(b"\xef\xbb\xbf"): raw = raw[3:]
    users = json.loads(raw.decode("utf-8"))
    salt = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", pwd.encode(), salt, 120000, 32)
    for u in users:
        if u["Email"].lower() == "ab@btema.ru":
            u["Salt"] = base64.b64encode(salt).decode()
            u["Hash"] = base64.b64encode(h).decode()
    data = json.dumps(users, ensure_ascii=False, indent=2).encode("utf-8")
    if bom: data = b"\xef\xbb\xbf" + data
    open(path, "wb").write(data)

for p, bom in [(os.path.join(base, r"src\data\data\users.json"), True),
               (os.path.join(base, r"deploy-host\clean-users.json"), False),
               (os.path.join(base, r"app-lite\data\users.json"), True)]:
    update(p, bom)

secret_file = os.path.join(base, r"deploy-host\ADMIN-PASSWORD.txt")
open(secret_file, "w", encoding="utf-8").write(
    "Пароль администратора (ab@btema.ru)\n\n" + pwd +
    "\n\nСмените на свой в любой момент: скажите агенту, либо через /api/auth/password.\n")
print("пароль создан, длина:", len(pwd))
print("файл:", secret_file)
print("старый пароль больше не подходит (хеш перезаписан)")