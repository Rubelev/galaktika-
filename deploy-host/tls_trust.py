import socket, ssl
for host in ("warbattleuniverse.com", "warbattleuniverse.store", "www.warbattleuniverse.com"):
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=15) as s:
            with ctx.wrap_socket(s, server_hostname=host) as ss:
                c = ss.getpeercert()
        print(host, "-> ДОВЕРЕННЫЙ | до", c.get("notAfter"))
    except Exception as e:
        print(host, "-> не доверенный:", str(e)[:90])