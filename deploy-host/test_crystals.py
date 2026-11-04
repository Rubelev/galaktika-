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


# 1. настройки по умолчанию — кристаллы
s, d = call("/api/pay/settings")
pk = d["settings"]["packages"]
print("пакеты по умолчанию:", [(p["title"], p["credits"], p["price"]) for p in pk])

# 2. админ включает оплату
s, d = call("/api/auth/login", {"email": "ab@btema.ru", "password": "Rubelev@1973Rubelev"})
admin = d["token"]
settings = {
    "enabled": True, "currency": "RUB",
    "sbp": {"link": "https://qr.nspk.ru/TEST", "phone": "+7 900 000-00-00", "recipient": "Тест"},
    "card": {"number": "0000 0000 0000 0000", "recipient": "ТЕСТ"},
    "note": "Код платежа в комментарии.",
    "packages": [
        {"id": "p1", "title": "Стартовый", "credits": 25, "price": 100},
        {"id": "p2", "title": "Капитанский", "credits": 150, "price": 500},
        {"id": "p3", "title": "Адмиральский", "credits": 500, "price": 1500},
    ],
}
s, d = call("/api/pay/settings", settings, admin)
print("включение оплаты:", s, d.get("saved"))

# 3. игрок и заказ
s, d = call("/api/auth/register", {"email": "crystal@test.ru", "password": "test123456",
                                   "lastName": "Тест", "gameName": "Кристалл", "faction": "mars"})
if s == 400:
    s, d = call("/api/auth/login", {"email": "crystal@test.ru", "password": "test123456"})
player = d["token"]
s, d = call("/api/pay/order", {"packageId": "p2", "method": "sbp"}, player)
order = d["order"]
print("заказ:", s, order["code"], "| кристаллов:", order["credits"], "| цена:", order["price"])

# 4. админ подтверждает
s, d = call("/api/pay/status", {"id": order["id"], "status": "paid"}, admin)
print("подтверждение:", s, d)

# 5. игрок видит начисление и профиль
s, d = call("/api/pay/my", None, player)
print("к начислению:", d.get("pendingCredits"))
s, d = call("/api/auth/me", None, player)
prof = json.loads(d.get("profile") or "{}")
print("resources.eternity в профиле:", prof.get("resources", {}).get("eternity"), "| credits:", prof.get("credits"))

s, d = call("/api/pay/ack", {"ids": [order["id"]]}, player)
print("ack:", s, d)
s, d = call("/api/pay/my", None, player)
print("после ack:", d.get("pendingCredits"))

# 6. выключаем обратно
settings["enabled"] = False
s, d = call("/api/pay/settings", settings, admin)
print("оплата выключена:", s, d.get("saved"))
