import hashlib, socket, ssl
ctx = ssl._create_unverified_context()
for i in range(6):
    raw = socket.create_connection(("warbattleuniverse.com", 443), timeout=15)
    peer = raw.getpeername()[0]
    ss = ctx.wrap_socket(raw, server_hostname="warbattleuniverse.com")
    der = ss.getpeercert(binary_form=True)
    ss.close()
    print(i, "peer:", peer, "sha1:", hashlib.sha1(der).hexdigest()[:16], "len:", len(der))