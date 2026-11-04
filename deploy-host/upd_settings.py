import json, os
p = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\clean-settings.json"
s = json.load(open(p, encoding="utf-8"))
s["enabled"] = False
s["packages"] = [
    {"id": "p1", "title": "Стартовый", "credits": 25, "price": 100},
    {"id": "p2", "title": "Капитанский", "credits": 150, "price": 500},
    {"id": "p3", "title": "Адмиральский", "credits": 500, "price": 1500},
]
open(p, "w", encoding="utf-8").write(json.dumps(s, ensure_ascii=False, indent=2))
print("пакеты:", [(x["title"], x["credits"], x["price"]) for x in s["packages"]])