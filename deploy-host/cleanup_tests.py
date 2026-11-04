"""Уборка после автотестов.

ВАЖНО: удаляются ТОЛЬКО аккаунты, похожие на тестовые:
  *@test.ru, suite*, free*, stage*, raid*, ship*, chat*, colony*, spread*, upg*,
  lost*, back*, hired*, bmtest*, имена «Тестер».

Живых игроков скрипт не трогает. Перед записью users.json делается резервная копия.
"""
import json
import os
import re
import subprocess
import time

HERE = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host"
DATA = "/var/www/u3699164/data/www/galaktika-data"
HOST = "u3699164@31.31.196.115"

TEST_EMAIL_RE = re.compile(
    r"^("
    r"[^@]*@test\.(ru|com|local)$"
    r"|suite\d+@.*|free\d+@.*|stage@.*|raid\d*@.*|ship@.*|chat\d*@.*|colony\d*@.*"
    r"|spread\d*@.*|upg@.*|lost@.*|back@.*|hired@.*|bmtest@.*|noraid@.*|idle\d*@.*"
    r"|owner@.*|fresh@.*|stranger@.*|lost@.*|autark@.*|build@.*|mod@.*|queen@.*"
    r")",
    re.IGNORECASE,
)
TEST_NAMES = {"Тестер", "тест"}

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


def read_json(name, default):
    raw = ssh("cat " + DATA + "/" + name)
    return json.loads(raw) if raw.strip() else default


def write_json(name, data):
    tmp = os.path.join(HERE, "_tmp_" + name)
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    scp_up(tmp, DATA + "/" + name)
    os.remove(tmp)


def is_test_account(email):
    return bool(TEST_EMAIL_RE.match(email))


def main():
    users = read_json("users.json", [])
    keep = [u for u in users if not is_test_account(u["Email"])]
    removed = [u["Email"] for u in users if is_test_account(u["Email"])]

    if removed:
        # резервная копия перед удалением
        stamp = time.strftime("%Y%m%d-%H%M%S")
        ssh("cp " + DATA + "/users.json /var/www/u3699164/data/backups/users-before-cleanup-" + stamp + ".json")
        write_json("users.json", keep)

    chat = read_json("chat.json", [])
    clean_chat = [m for m in chat
                  if str(m.get("name")) not in TEST_NAMES and "тест чата" not in str(m.get("text", ""))]
    if len(clean_chat) != len(chat):
        write_json("chat.json", clean_chat)

    ranks = read_json("ranks.json", {})
    keep_emails = {u["Email"].lower() for u in keep}
    clean_ranks = {k: v for k, v in ranks.items() if k.lower() in keep_emails}
    if len(clean_ranks) != len(ranks):
        write_json("ranks.json", clean_ranks)

    print(f"удалено тестовых аккаунтов: {len(removed)}")
    for e in removed[:10]:
        print("   ", e)
    print(f"чат: {len(chat)} → {len(clean_chat)} | званий: {len(ranks)} → {len(clean_ranks)}")
    print("осталось игроков:", len(keep), [u["Email"] for u in keep])


if __name__ == "__main__":
    main()
