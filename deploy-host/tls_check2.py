import socket, ssl
for host in ("warbattleuniverse.store", "www.warbattleuniverse.store"):
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=15) as s:
            with ctx.wrap_socket(s, server_hostname=host) as ss:
                c = ss.getpeercert()
        iss = dict(x[0] for x in c["issuer"]).get("commonName")
        sub = dict(x[0] for x in c["subject"]).get("commonName")
        san = [v for k, v in c.get("subjectAltName", []) if k == "DNS"]
        print(host, "-> ДОВЕРЕННЫЙ")
        print("   издатель:", iss)
        print("   на имя:  ", sub, "| SAN:", ", ".join(san))
        print("   действует до:", c["notAfter"])
    except Exception as e:
        print(host, "-> ОШИБКА:", type(e).__name__, str(e)[:100])