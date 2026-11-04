import os, socket, ssl, tempfile
ctx = ssl._create_unverified_context()
def info(host):
    raw = socket.create_connection((host, 443), timeout=15)
    ss = ctx.wrap_socket(raw, server_hostname=host)
    der = ss.getpeercert(binary_form=True)
    ss.close()
    pem = ssl.DER_cert_to_PEM_cert(der)
    fd, path = tempfile.mkstemp(suffix=".pem"); os.close(fd)
    open(path, "w").write(pem)
    c = ssl._ssl._test_decode_cert(path)
    os.unlink(path)
    iss = dict(x[0] for x in c.get("issuer", []))
    sub = dict(x[0] for x in c.get("subject", []))
    san = [v for k, v in c.get("subjectAltName", []) if k == "DNS"]
    print(host)
    print("   subject:", sub.get("commonName"))
    print("   issuer :", iss.get("commonName"), "|", iss.get("organizationName"))
    print("   до     :", c.get("notAfter"))
    print("   SAN    :", ", ".join(san))
    try:
        ctx2 = ssl.create_default_context()
        raw2 = socket.create_connection((host, 443), timeout=15)
        ss2 = ctx2.wrap_socket(raw2, server_hostname=host); ss2.close()
        print("   проверка: ДОВЕРЕННЫЙ")
    except Exception as e:
        print("   проверка: НЕ доверенный —", str(e)[:70])
for h in ("warbattleuniverse.com", "warbattleuniverse.store"):
    info(h)