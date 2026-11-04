import socket, ssl
for host in ("warbattleuniverse.store", "www.warbattleuniverse.store"):
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=15) as s:
            with ctx.wrap_socket(s, server_hostname=host) as ss:
                c = ss.getpeercert()
        print(host, "-> доверенный, до", c.get("notAfter"), "| издатель:", dict(x[0] for x in c["issuer"]).get("commonName"))
    except Exception as e:
        print(host, "-> не доверенный:", type(e).__name__, str(e)[:70])