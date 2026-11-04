import ssl, urllib.request
ctx = ssl.create_default_context()
base = "https://warbattleuniverse.com"
def get(p):
    with urllib.request.urlopen(urllib.request.Request(base+p, headers={"User-Agent":"probe"}), timeout=30, context=ctx) as r:
        return r.status, r.read()
s, h = get("/"); t = h.decode("utf-8","replace")
print("index:", s, "| payments v2:", "payments.js?v=2" in t)
s, j = get("/js/payments.js?v=2"); js = j.decode("utf-8","replace")
print("payments.js:", s, len(j), "| кнопка:", "💎 Купить кристаллы" in js, "| старая '💰 Оплата' в меню:", "b.textContent = '💰 Оплата'" in js)