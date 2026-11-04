import json
import ssl
import urllib.error
import urllib.request

CTX = ssl._create_unverified_context()
BASE = "https://warbattleuniverse.store"


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


def show(label, status, data, keys=None):
    if keys:
        brief = {k: data.get(k) for k in keys}
    else:
        brief = data
    text = json.dumps(brief, ensure_ascii=False)
    print("%-40s %s %s" % (label, status, text[:180]))


# 1. публичные настройки
s, d = call("/api/pay/settings")
show("GET /api/pay/settings", s, {"enabled": d.get("settings", {}).get("enabled"),
                                 "packages": len(d.get("settings", {}).get("packages", []))})

# 2. админ
s, d = call("/api/auth/login", {"email": "ab@btema.ru", "password": "Docent@1973Docent"})
admin = d.get("token")
print("login admin:", s, "token:", bool(admin))

# 3. включаем оплату и задаём реквизиты
settings = {
    "enabled": True,
    "currency": "RUB",
    "sbp": {"link": "https://qr.nspk.ru/AS1000TEST", "phone": "+7 900 000-00-00", "recipient": "Булатов А.Ю."},
    "card": {"number": "0000 0000 0000 0000", "recipient": "БУЛАТОВ АЛЕКСЕЙ ЮРЬЕВИЧ"},
    "note": "Укажите код платежа в комментарии к переводу.",
    "packages": [
        {"id": "p1", "title": "Стартовый", "credits": 50000, "price": 100},
        {"id": "p2", "title": "Капитанский", "credits": 300000, "price": 500},
        {"id": "p3", "title": "Адмиральский", "credits": 1000000, "price": 1500},
    ],
}
s, d = call("/api/pay/settings", settings, admin)
print("POST settings (admin):", s, d.get("saved"), "| пакетов:", len(d.get("settings", {}).get("packages", [])))

# 4. обычный игрок
s, d = call("/api/auth/register", {"email": "paytest@test.ru", "password": "test123456",
                                   "lastName": "Тестов", "gameName": "Тестов", "faction": "earth"})
if s == 400:
    s, d = call("/api/auth/login", {"email": "paytest@test.ru", "password": "test123456"})
player = d.get("token")
print("player token:", bool(player))

# 5. заказ
s, d = call("/api/pay/order", {"packageId": "p2", "method": "sbp"}, player)
order = d.get("order", {})
print("POST /api/pay/order:", s, "| код:", order.get("code"), "| кредиты:", order.get("credits"),
      "| цена:", order.get("price"), "| статус:", order.get("status"))

# 6. админ видит заказ
s, d = call("/api/pay/orders", None, admin)
ids = [o["id"] for o in d.get("orders", [])]
print("GET /api/pay/orders (admin):", s, "| всего:", len(ids))

# 7. подтверждение
s, d = call("/api/pay/status", {"id": order.get("id"), "status": "paid"}, admin)
print("POST status=paid:", s, d)

# 8. игрок видит начисление
s, d = call("/api/pay/my", None, player)
print("GET /api/pay/my:", s, "| к начислению:", d.get("pendingCredits"))

# 9. подтверждаем получение
s, d = call("/api/pay/ack", {"ids": [order.get("id")]}, player)
print("POST /api/pay/ack:", s, d)
s, d = call("/api/pay/my", None, player)
print("после ack, к начислению:", d.get("pendingCredits"))

# 10. профиль игрока на сервере — кредиты выросли
s, d = call("/api/auth/me", None, player)
prof = json.loads(d.get("profile") or "{}")
print("кредиты в профиле игрока:", prof.get("credits"))

# 11. отключаем оплату обратно
settings["enabled"] = False
s, d = call("/api/pay/settings", settings, admin)
print("оплата выключена:", s, d.get("saved"))
