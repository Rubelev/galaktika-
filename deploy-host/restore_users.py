"""Восстановление аккаунтов, удалённых ошибочной чисткой.

Берём данные из wallet.json (кредиты, склад), создаём записи в users.json
с временным паролем. Колония и флот не восстанавливаются — их данных нет.
"""
import base64
import hashlib
import json
import os
import secrets
import subprocess
import time

HERE = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host"
DATA = "/var/www/u3699164/data/www/galaktika-data"
HOST = "u3699164@31.31.196.115"
TEMP_PASSWORD = "Galaktika-Vozvrat-2026"

ENV = dict(os.environ)
ENV["SSH_ASKPASS"] = os.path.join(HERE, "askpass.bat")
ENV["SSH_ASKPASS_REQUIRE"] = "force"
ENV["DISPLAY"] = "localhost:0"
OPTS = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL",
        "-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no"]


def ssh(cmd):
    return subprocess.run(["ssh"] + OPTS + [HOST, cmd], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", env=ENV).stdout


def scp_up(local, remote):
    subprocess.run(["scp"] + OPTS + [local, HOST + ":" + remote], capture_output=True, env=ENV)


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120000, 32)
    return base64.b64encode(salt).decode(), base64.b64encode(digest).decode()


def main():
    users = json.loads(ssh("cat " + DATA + "/users.json") or "[]")
    wallet = json.loads(ssh("cat " + DATA + "/wallet.json") or "{}")
    existing = {u["Email"].lower() for u in users}

    targets = ["puhnastik.mordor@gmail.com", "daynoveblan448@gmail.com"]
    added = []
    for email in targets:
        if email in existing:
            print("уже есть:", email)
            continue
        w = wallet.get(email)
        if not w:
            print("нет данных в wallet:", email)
            continue
        salt, digest = hash_password(TEMP_PASSWORD)
        name = email.split("@")[0].replace(".", " ").title()
        profile = {
            "lastName": "", "gameName": name, "faction": "earth",
            "credits": w.get("credits", 200000),
            "hasSeenLegend": True,
            "resources": w.get("resources", {}),
            "dockSlots": 2, "workshops": 0,
            "lastSeen": int(time.time()),
            "refCode": hashlib.md5((email + "glk").encode()).hexdigest()[:8],
            "referrals": 0,
            "restored": {"at": int(time.time()), "reason": "ошибочная чистка тестовых аккаунтов"},
        }
        users.append({
            "Email": email,
            "Salt": salt,
            "Hash": digest,
            "Profile": json.dumps(profile, ensure_ascii=False),
            "Role": "user",
            "Created": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
        })
        added.append(email)

    if not added:
        print("нечего восстанавливать")
        return

    # резервная копия перед записью
    stamp = time.strftime("%Y%m%d-%H%M%S")
    ssh("cp " + DATA + "/users.json /var/www/u3699164/data/backups/users-before-restore-" + stamp + ".json")

    tmp = os.path.join(HERE, "_users_restore.json")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)
    scp_up(tmp, DATA + "/users.json")
    os.remove(tmp)

    print("восстановлены:", added)
    print("временный пароль:", TEMP_PASSWORD)


if __name__ == "__main__":
    main()
