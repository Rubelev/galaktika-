import socket, ssl, json, urllib.request
ctx = ssl._create_unverified_context()
for host in ("warbattleuniverse.store", "www.warbattleuniverse.store"):
    with socket.create_connection((host, 443), timeout=15) as s:
        with ctx.wrap_socket(s, server_hostname=host) as ss:
            c = ss.getpeercert()
    iss = dict(x[0] for x in c.get("issuer", [])).get("commonName")
    sub = dict(x[0] for x in c.get("subject", [])).get("commonName")
    print(host, "| subject:", sub, "| issuer:", iss, "| до:", c.get("notAfter"))

# что вообще выпускалось для домена
try:
    req = urllib.request.Request("https://crt.sh/?q=warbattleuniverse.store&output=json", headers={"User-Agent":"probe"})
    data = json.loads(urllib.request.urlopen(req, timeout=25, context=ctx).read().decode())
    seen = set()
    for row in data[:20]:
        key = (row.get("issuer_name","")[:60], row.get("not_after",""))
        if key in seen: continue
        seen.add(key)
        print("crt.sh:", row.get("issuer_name","")[:60], "|", row.get("not_before",""), "->", row.get("not_after",""))
except Exception as e:
    print("crt.sh недоступен:", type(e).__name__, str(e)[:80])