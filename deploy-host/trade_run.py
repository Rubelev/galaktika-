"""Торговый рейс агента с правильным разбором ответа.

Ответ /api/trade/run имеет три исхода, и раньше я читал из него несуществующее
поле profit — из-за этого успешный рейс выглядел как «нулевая прибыль»:

    result = "lost"  → пираты перехватили груз (теряется только закупка)
    result = "kept"  → груз оставлен себе (вода/водород/кислород на склад)
    result = "sold"  → обычная продажа, есть поля earn и cost

    python trade_run.py agent europa-water 1
    python trade_run.py trader jupiter-hydrogen 2 --keep
"""
import json
import ssl
import sys
import urllib.error
import urllib.request

BASE = "https://warbattleuniverse.com"
CTX = ssl.create_default_context()

AGENTS = {
    "agent": ("agent@warbattleuniverse.com", "GalaktikaAgent2026!"),
    "trader": ("trader@warbattleuniverse.com", "GalaktikaTrader2026!"),
    "quartermaster": ("quartermaster@warbattleuniverse.com", "GalaktikaQuarter2026!"),
}

ROUTES = {
    "moon-orbit": ("Лёд с орбиты Луны (новичкам)", 20, 15.0, 50.0, 1, 0.005),
    "europa-water": ("Вода Европы", 500, 3.2, 12.0, 4, 0.02),
    "jupiter-hydrogen": ("Водород Юпитера", 4000, 6.5, 14.0, 6, 0.03),
    "earth-oxygen": ("Кислород Земли", 8000, 1.8, 3.6, 2, 0.01),
    "titan-methane": ("Метан Титана", 3000, 4.0, 9.0, 7, 0.04),
}


def call(path, payload=None, token=None):
    headers = {"User-Agent": "agent", "Content-Type": "application/json"}
    if token:
        headers["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def login(who):
    email, pwd = AGENTS[who]
    status, res = call("/api/auth/login", {"email": email, "password": pwd})
    if status != 200 or not res.get("token"):
        raise SystemExit("не удалось войти: %s %s" % (status, res.get("error")))
    return res["token"]


def profile(token):
    status, res = call("/api/auth/me", None, token)
    try:
        return json.loads(res.get("profile") or "{}")
    except Exception:
        return {}


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    who = argv[1]
    route = argv[2]
    qty = int(argv[3]) if len(argv) > 3 else 1
    keep = "--keep" in argv
    if who not in AGENTS:
        print("неизвестный агент:", who, "| есть:", ", ".join(AGENTS))
        return 1
    if route not in ROUTES:
        print("неизвестный маршрут:", route, "| есть:", ", ".join(ROUTES))
        return 1

    name, batch, buy, sell, hours, risk = ROUTES[route]
    mass = batch * qty
    print("маршрут: %s · %d кг/т · закупка %.2f → продажа %.2f · риск %d %% · кулдаун %d мин"
          % (name, mass, buy, sell, round(risk * 100), round(hours * 20)))

    token = login(who)
    before = profile(token)
    credits_before = float(before.get("credits") or 0)
    print("кредиты до рейса: %s" % round(credits_before))

    payload = {"route": route, "qty": qty}
    if keep:
        payload["keep"] = True
    status, res = call("/api/trade/run", payload, token)

    if status != 200:
        print("рейс не выполнен: %s %s" % (status, res.get("error")))
        left = res.get("error", "")
        if "рейсе" in left:
            print("  ждём окончания кулдауна и повторяем позже")
        return 2

    result = res.get("result")
    if result == "lost":
        print("⚠ ПИРАТЫ ПЕРЕХВАТИЛИ ГРУЗ: потеряна закупка %s кр" % round(mass * buy))
    elif result == "kept":
        print("✅ груз оставлен на склад: %s %s (закупка %s кр)"
              % (res.get("qty"), res.get("resource"), round(res.get("cost") or 0)))
    else:
        # успешный ответ: qty, buy (закупка), sell (выручка), profit (прибыль)
        revenue = float(res.get("sell") or 0)
        cost = float(res.get("buy") or mass * buy)
        profit = float(res.get("profit") if res.get("profit") is not None else revenue - cost)
        print("✅ продано %s: выручка %s кр, закупка %s кр, ПРИБЫЛЬ %s кр"
              % (res.get("qty"), round(revenue), round(cost), round(profit)))

    after = profile(token)
    credits_after = float(after.get("credits") or 0)
    trade = after.get("trade") or {}
    print("кредиты после: %s (дельта %+d)" % (round(credits_after), round(credits_after - credits_before)))
    print("прибыль рейсов всего: %s кр" % round(trade.get("totalProfit") or 0))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
