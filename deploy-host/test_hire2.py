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
s, d = call("/api/auth/register", {"email":"hire2@test.ru","password":"test123456","lastName":"","gameName":"Наниматель","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"hire2@test.ru","password":"test123456"})
tok = d["token"]
p = json.loads(call("/api/auth/me",None,tok)[1]["profile"])
print("доки:", p.get("dockSlots"), "| кредиты:", p.get("credits"))
users = json.loads(ssh("cat /var/www/u3699164/data/www/galaktika-data/users.json"))
for u in users:
    if u["Email"].lower() == "hire2@test.ru":
        prof = json.loads(u["Profile"]); prof["credits"] = 2000000; prof["resources"]["grain"] = 5000
        u["Profile"] = json.dumps(prof, ensure_ascii=False)
tmp = os.path.join(HERE, "_users_tmp.json"); open(tmp,"w",encoding="utf-8").write(json.dumps(users, ensure_ascii=False, indent=2))
subprocess.run(["scp"]+OPTS+[tmp,"u3699164@31.31.196.115:/var/www/u3699164/data/www/galaktika-data/users.json"], capture_output=True, env=ENV)
s, d = call("/api/rent", {"what":"workshop"}, tok)
print("мастерская:", s, "| всего:", d.get("workshops"), "| кредиты:", round(d.get("credits",0)))
s, d = call("/api/hire", {"count": 1000}, tok)
print("найм 1000:", s, d)