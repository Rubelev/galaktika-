import json
import ssl
import sys
import urllib.error
import urllib.request

ctx = ssl._create_unverified_context()
base = sys.argv[1] if len(sys.argv) > 1 else "https://warbattleuniverse.store"


def get(path):
    req = urllib.request.Request(base + path, headers={"User-Agent": "probe"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, r.headers.get("Content-Type"), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type"), e.read()


def post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(base + path, data=data,
                                 headers={"Content-Type": "application/json", "User-Agent": "probe"})
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


for p in ("/", "/js/solar.js", "/app.css", "/images/tex/callisto.jpg", "/api/health"):
    s, t, b = get(p)
    extra = ""
    if p == "/":
        extra = " | есть 'Солнечная система': %s" % ("Солнечная система" in b.decode("utf-8", "replace"))
    print("%-26s %s %-30s %8d байт%s" % (p, s, (t or "")[:30], len(b), extra))

s, b = post("/api/auth/login", {"email": "ab@btema.ru", "password": "Docent@1973Docent"})
print("POST /api/auth/login        ", s, b[:160].decode("utf-8", "replace"))
