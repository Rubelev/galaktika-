import hashlib, socket, ssl
ctx = ssl._create_unverified_context()
for host in ("warbattleuniverse.store", "www.warbattleuniverse.store", "warbattleuniverse.com"):
    try:
        with socket.create_connection((host, 443), timeout=15) as s:
            with ctx.wrap_socket(s, server_hostname=host) as ss:
                der = ss.getpeercert(binary_form=True)
        print("%-32s sha1=%s  %d байт" % (host, hashlib.sha1(der).hexdigest()[:16], len(der)))
    except Exception as e:
        print(host, "ERR", type(e).__name__, str(e)[:60])