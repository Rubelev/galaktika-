import json, os, ssl, subprocess, urllib.error, urllib.request
ctx = ssl.create_default_context(); base = "https://warbattleuniverse.com"
HERE = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host"
ENV = dict(os.environ); ENV["SSH_ASKPASS"] = os.path.join(HERE, "askpass.bat")
ENV["SSH_ASKPASS_REQUIRE"] = "force"; ENV["DISPLAY"] = "localhost:0"
OPTS = ["-o","StrictHostKeyChecking=no","-o","UserKnownHostsFile=NUL","-o","PreferredAuthentications=password","-o","PubkeyAuthentication=no"]
def call(path, payload=None, token=None):
    h = {"User-Agent":"t","Content-Type":"application/json"}
    if token: h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base+path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")
def ssh(cmd):
    return subprocess.run(["ssh"]+OPTS+["u3699164@31.31.196.115",cmd], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", env=ENV).stdout
s, d = call("/api/auth/register", {"email":"frac@test.ru","password":"test123456","lastName":"","gameName":"Фракции","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"frac@test.ru","password":"test123456"})
tok = d["token"]
users = json.loads(ssh("cat /var/www/u3699164/data/www/galaktika-data/users.json"))
for u in users:
    if u["Email"].lower() == "frac@test.ru":
        prof = json.loads(u["Profile"]); prof["credits"] = 3000000; prof["resources"]["grain"] = 10000
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
tmp = os.path.join(HERE, "_users_tmp.json"); open(tmp,"w",encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))
subprocess.run(["scp"]+OPTS+[tmp,"u3699164@31.31.196.115:/var/www/u3699164/data/www/galaktika-data/users.json"], capture_output=True, env=ENV)
for src in ("earth","mars","astral"):
    s, d = call("/api/hire", {"count": 100, "source": src}, tok)
    print(src, ":", s, "| нанято:", d.get("hired"), "| всего:", d.get("colonistsTotal"), "| оплата:", d.get("paidCredits"), "кр +", d.get("paidGrain"), "кг")
s, d = call("/api/hire", {"count": 100, "source": "venera"}, tok)
print("неизвестный источник:", s, d.get("error"))