import json, ssl, urllib.request
ctx = ssl.create_default_context()
with urllib.request.urlopen(urllib.request.Request("https://warbattleuniverse.com/api/status", headers={"User-Agent":"probe"}), timeout=25, context=ctx) as r:
    d = json.loads(r.read().decode())
print("status:", r.status)
print(json.dumps(d, ensure_ascii=False, indent=2)[:700])