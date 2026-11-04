import json, os
base = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host"
# только админ
src = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\src\data\data\users.json"
raw = open(src, "rb").read()
if raw.startswith(b"\xef\xbb\xbf"): raw = raw[3:]
users = [u for u in json.loads(raw.decode()) if u["Email"].lower() == "ab@btema.ru"]
open(os.path.join(base, "clean-users.json"), "wb").write(json.dumps(users, ensure_ascii=False, indent=2).encode())
open(os.path.join(base, "clean-orders.json"), "wb").write(b"[]")
# настройки: выключено, пустые реквизиты, кристаллы
s = json.load(open(os.path.join(base, "clean-settings.json"), encoding="utf-8"))
s.update({"enabled": False, "sbp": {"link": "", "phone": "", "recipient": ""},
          "card": {"number": "", "recipient": ""}})
open(os.path.join(base, "clean-settings.json"), "w", encoding="utf-8").write(json.dumps(s, ensure_ascii=False, indent=2))
print("ok")