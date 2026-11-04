import os, socket, ssl, tempfile
def info(host):
    ctx = ssl._create_unverified_context()
    raw = socket.create_connection((host, 443), timeout=15)
    ss = ctx.wrap_socket(raw, server_hostname=host)
    der = ss.getpeercert(binary_form=True); ss.close()
    fd, path = tempfile.mkstemp(suffix=".pem"); os.close(fd)
    open(path, "w").write(ssl.DER_cert_to_PEM_cert(der))
    c = ssl._ssl._test_decode_cert(path); os.unlink(path)
    iss = dict(x[0] for x in c.get("issuer", []))
    san = [v for k, v in c.get("subjectAltName", []) if k == "DNS"]
    try:
        ctx2 = ssl.create_default_context()
        r2 = socket.create_connection((host, 443), timeout=15)
        s2 = ctx2.wrap_socket(r2, server_hostname=host); s2.close()
        trusted = "ДОВЕРЕННЫЙ"
    except Exception as e:
        trusted = "не доверенный: " + str(e)[:60]
    print(host)
    print("   издатель:", iss.get("commonName"), "|", iss.get("organizationName"))
    print("   до:", c.get("notAfter"), "| SAN:", ", ".join(san))
    print("   проверка:", trusted)

for h in ("warbattleuniverse.store", "www.warbattleuniverse.store", "warbattleuniverse.com"):
    try:
        info(h)
    except Exception as e:
        print(h, "ОШИБКА:", type(e).__name__, str(e)[:80])