import ssl, urllib.request
ctx = ssl.create_default_context()
base = "https://warbattleuniverse.com"
with urllib.request.urlopen(urllib.request.Request(base+"/", headers={"User-Agent":"probe"}), timeout=30, context=ctx) as r:
    t = r.read().decode("utf-8","replace")
print("index:", r.status, "| поле имени убрано:", "reg-name" not in t, "| v627:", "solar.js?v=627" in t)
with urllib.request.urlopen(urllib.request.Request(base+"/js/solar.js?v=627", headers={"User-Agent":"probe"}), timeout=30, context=ctx) as r:
    js = r.read().decode("utf-8","replace")
print("solar.js:", r.status, len(js), "| регистрация на сервере:", "window.apiRegister({ email, password, lastName: ''" in js)
print("  обращений к reg-name в JS:", js.count("reg-name"))