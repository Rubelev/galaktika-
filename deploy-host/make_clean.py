import json, os
base = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host"
seed = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\src\data\data\users.json"
raw = open(seed, "rb").read()
if raw.startswith(b"\xef\xbb\xbf"): raw = raw[3:]
users = json.loads(raw.decode("utf-8"))
users = [u for u in users if u["Email"].lower() == "ab@btema.ru"]
open(os.path.join(base, "clean-users.json"), "wb").write(json.dumps(users, ensure_ascii=False, indent=2).encode("utf-8"))

settings = {
    "enabled": False, "currency": "RUB",
    "sbp": {"link": "", "phone": "", "recipient": ""},
    "card": {"number": "", "recipient": ""},
    "note": "Укажите код платежа в комментарии к переводу.",
    "packages": [
        {"id": "p1", "title": "Стартовый", "credits": 50000, "price": 100},
        {"id": "p2", "title": "Капитанский", "credits": 300000, "price": 500},
        {"id": "p3", "title": "Адмиральский", "credits": 1000000, "price": 1500},
    ],
}
open(os.path.join(base, "clean-settings.json"), "wb").write(json.dumps(settings, ensure_ascii=False, indent=2).encode("utf-8"))
open(os.path.join(base, "clean-orders.json"), "wb").write(b"[]")
print("ok")