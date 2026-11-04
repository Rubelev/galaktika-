"""Аварийное восстановление экономики агентов.

Зачем: если у агента кончились кредиты, а товар лежит на складе, он не может
ни купить, ни выставить лот — наступает тупик (наблюдалось у Интенданта:
35 т зерна и 2 862 кредита).

Правила (только через API, без правок сервера):
  1) кредитов меньше порога и есть излишек зерна  -> продать излишек NPC-рынку;
  2) воды больше 400 т                            -> продать излишек;
  3) у торговца нет товара                        -> купить партию на NPC-рынке.

Запуск:  python play_recover.py            # все агенты
         python play_recover.py trader     # только торговец
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

LOW_CREDITS = 8000
GRAIN_KEEP = 3000
WATER_KEEP = 400
TRADER_MIN_GRAIN = 1500


def call(path, payload=None, token=None):
    headers = {"User-Agent": "agent", "Content-Type": "application/json"}
    if token:
        headers["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def login(email, password):
    return call("/api/auth/login", {"email": email, "password": password})[1].get("token")


def profile(token):
    return json.loads(call("/api/auth/me", {}, token)[1].get("profile") or "{}")


def npc_trade(token, key, qty, side):
    return call("/api/npcmarket/trade", {"key": key, "qty": int(qty), "side": side}, token)


def recover(name):
    email, password = AGENTS[name]
    token = login(email, password)
    if not token:
        print(f"{name}: вход не удался")
        return
    p = profile(token)
    res = p.get("resources") or {}
    credits = float(p.get("credits") or 0)
    grain = int(res.get("grain") or 0)
    water = int(res.get("water") or 0)
    print(f"{name}: {round(credits)} кр | зерно {grain} | вода {water}")

    acted = False

    # 1) нет денег, но есть излишек зерна — продаём NPC-рынку
    if credits < LOW_CREDITS and grain > GRAIN_KEEP:
        qty = min(grain - GRAIN_KEEP, 5000)
        st, d = npc_trade(token, "grain", qty, "sell")
        print(f"  продал {qty} кг зерна: {st} {d.get('error') or 'ok'}")
        acted = True

    # 2) излишек воды
    if water > WATER_KEEP:
        qty = min(water - WATER_KEEP, 200)
        st, d = npc_trade(token, "water", qty, "sell")
        print(f"  продал {qty} т воды: {st} {d.get('error') or 'ok'}")
        acted = True

    # 3) торговцу нужен товар для оборота
    if name == "trader":
        p2 = profile(token)
        g2 = int((p2.get("resources") or {}).get("grain") or 0)
        if g2 < TRADER_MIN_GRAIN:
            qty = TRADER_MIN_GRAIN * 2
            st, d = npc_trade(token, "grain", qty, "buy")
            print(f"  купил {qty} кг зерна: {st} {d.get('error') or 'ok'}")
            acted = True

    p3 = profile(token)
    res3 = p3.get("resources") or {}
    print(f"  итог: {round(float(p3.get('credits') or 0))} кр | зерно {int(res3.get('grain') or 0)} | вода {int(res3.get('water') or 0)}")
    if not acted:
        print("  действий не требовалось")


def main(argv):
    targets = [argv[1]] if len(argv) > 1 and argv[1] in AGENTS else list(AGENTS)
    for name in targets:
        recover(name)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
