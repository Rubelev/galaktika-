import json
import ssl
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"


def call(path, payload=None, token=None):
    headers = {"User-Agent": "probe", "Content-Type": "application/json"}
    if token:
        headers["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body[:200]}


def login(email, password):
    s, d = call("/api/auth/login", {"email": email, "password": password})
    return d.get("token")


def ensure(email, password, name):
    s, d = call("/api/auth/register", {"email": email, "password": password,
                                       "lastName": "", "gameName": name, "faction": "earth"})
    if s != 200:
        s, d = call("/api/auth/login", {"email": email, "password": password})
    return d.get("token")


admin = login("ab@btema.ru", "Rubelev@1973Rubelev")
seller = ensure("seller@test.ru", "test123456", "Продавец")
buyer = ensure("buyer@test.ru", "test123456", "Покупатель")
print("токены:", bool(admin), bool(seller), bool(buyer))

# у продавца есть зерно (регистрация даёт стартовые ресурсы? проверим профиль)
s, d = call("/api/auth/me", None, seller)
prof = json.loads(d.get("profile") or "{}")
res = prof.get("resources") or {}
print("зерно у продавца:", res.get("grain"), "| кредиты:", prof.get("credits"))

# если склада нет — кладём вручную через профиль
if not res.get("grain"):
    prof.setdefault("resources", {})["grain"] = 5000
    prof["resources"].setdefault("water", 1000)
    s, d = call("/api/auth/profile", {"profile": json.dumps(prof, ensure_ascii=False)}, seller)
    print("профиль продавца подготовлен:", s)
    s, d = call("/api/auth/me", None, seller)
    prof = json.loads(d.get("profile"))
    print("зерно теперь:", prof["resources"].get("grain"))

# выставление лота
s, d = call("/api/market/offer", {"resource": "grain", "qty": 1000, "price": 5}, seller)
offer = d.get("offer") or {}
print("лот:", s, offer.get("id"), offer.get("qty"), "по", offer.get("price"))

# список
s, d = call("/api/market/list")
print("предложений на рынке:", s, len(d.get("offers", [])))

# покупка
s, d = call("/api/market/buy", {"id": offer.get("id"), "qty": 400}, buyer)
print("покупка 400:", s, d)

# проверяем балансы
s, d = call("/api/auth/me", None, buyer)
bp = json.loads(d.get("profile") or "{}")
s, d = call("/api/auth/me", None, seller)
sp = json.loads(d.get("profile") or "{}")
print("у покупателя зерна:", (bp.get("resources") or {}).get("grain"), "| кредиты:", bp.get("credits"))
print("у продавца зерна:", (sp.get("resources") or {}).get("grain"), "| кредиты:", sp.get("credits"))

# отмена остатка
s, d = call("/api/market/cancel", {"id": offer.get("id")}, seller)
print("отмена остатка:", s, d)
s, d = call("/api/auth/me", None, seller)
sp = json.loads(d.get("profile") or "{}")
print("зерно продавца после отмены:", (sp.get("resources") or {}).get("grain"))
