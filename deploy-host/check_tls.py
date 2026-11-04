import json, socket, ssl, urllib.request, urllib.error
host = "warbattleuniverse.store"
# 1. проверка сертификата
try:
    ctx = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=20) as s:
        with ctx.wrap_socket(s, server_hostname=host) as ss:
            cert = ss.getpeercert()
    print("TLS: ДОВЕРЕННЫЙ, истекает", cert.get("notAfter"))
except Exception as e:
    print("TLS: не проходит проверку ->", type(e).__name__, str(e)[:120])
    ctx = ssl._create_unverified_context()
    with socket.create_connection((host, 443), timeout=20) as s:
        with ctx.wrap_socket(s, server_hostname=host) as ss:
            der = ss.getpeercert(binary_form=True)
    import hashlib
    print("   отпечаток:", hashlib.sha1(der).hexdigest())

# 2. регистрация тестового пользователя
ctx = ssl._create_unverified_context()
payload = json.dumps({"email": "tester2026@test.ru", "password": "test123456", "lastName": "Тестер", "gameName": "Тестер", "faction": "earth"}).encode()
req = urllib.request.Request("https://warbattleuniverse.store/api/auth/register", data=payload, headers={"Content-Type": "application/json", "User-Agent": "probe"})
try:
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        print("REGISTER:", r.status, r.read()[:160].decode("utf-8", "replace"))
except urllib.error.HTTPError as e:
    print("REGISTER:", e.code, e.read()[:160].decode("utf-8", "replace"))