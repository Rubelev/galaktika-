"""Второй агент — «Торговец»: играет на рынке, выставляет лоты, торгует с первым агентом."""
import json
import ssl
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
EMAIL = "trader@warbattleuniverse.com"
PASSWORD = "GalaktikaTrader2026!"


def call(path, payload=None, token=None):
    h = {"User-Agent": "agent-trader", "Content-Type": "application/json"}
    if token:
        h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def login():
    s, d = call("/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    if s == 200:
        return d["token"], "вошёл"
    s, d = call("/api/auth/register", {"email": EMAIL, "password": PASSWORD, "lastName": "",
                                       "gameName": "Караванщик", "faction": "mars"})
    if s == 200:
        return d["token"], "зарегистрирован"
    raise SystemExit(f"логин не удался: {s} {d}")


def profile(tok):
    return json.loads(call("/api/auth/me", None, tok)[1]["profile"])



def cancel_own_lots(tok, name, resource=None, above=None):
    """Снимает ВСЕ свои лоты (или только по ресурсу): один товар — один лот."""
    s, mk = call("/api/market/list")
    removed = 0
    for o in (mk.get("offers") or []):
        if str(o.get("seller")) != name:
            continue
        if resource and o.get("resource") != resource:
            continue
        s2, _ = call("/api/market/cancel", {"id": o["id"]}, tok)
        if s2 == 200:
            removed += 1
    return removed


def dedupe_lots(tok, name):
    """Оставляет один лот на ресурс — самый дешёвый, остальные снимает."""
    s, mk = call("/api/market/list")
    by_res = {}
    for o in (mk.get("offers") or []):
        if str(o.get("seller")) != name:
            continue
        by_res.setdefault(o.get("resource"), []).append(o)
    removed = 0
    for res, lots in by_res.items():
        lots.sort(key=lambda o: float(o.get("price") or 0))
        for o in lots[1:]:
            s2, _ = call("/api/market/cancel", {"id": o["id"]}, tok)
            if s2 == 200:
                removed += 1
    return removed

def main():
    tok, how = login()
    print(f"игрок {EMAIL}: {how}")
    acts = []

    s, d = call("/api/build/status", {}, tok)
    for a in (d.get("applied") or []):
        acts.append("достроено: " + str(a.get("title")))

    # Караванщик: выкупает оптовый лот у Интенданта и перепродаёт колонии
    s, mk = call("/api/market/list")
    lots = [o for o in (mk.get("offers") or [])
            if str(o.get("seller")) == "Интендант" and o.get("resource") == "grain"
            and float(o.get("price") or 99) <= 6.0]
    p = profile(tok)
    credits = p.get("credits", 0)
    for lot in lots:
        price = float(lot.get("price") or 0)
        budget = credits * 0.55
        qty = min(int(lot.get("qty") or 0), int(budget / price))
        if qty < 500:
            continue
        s2, d2 = call("/api/market/buy", {"id": lot["id"], "qty": qty}, tok)
        if s2 == 200:
            spent = d2.get("sum", 0)
            credits -= spent
            acts.append("выкупил опт %d кг у Интенданта по %.2f" % (qty, price))
            retail = min(round(price + 0.25, 2), 6.1)
            s3, off = call("/api/market/offer", {"resource": "grain", "qty": qty, "price": retail}, tok)
            if s3 == 200 and (off.get("offer") or {}).get("id"):
                acts.append("выставил колонии по %.2f" % retail)
        break

    p = profile(tok)
    s, q = call("/api/quests", None, tok)
    done = {x["key"] for x in (q.get("quests") or []) if x["done"]}
    print(f"кредиты {round(p.get('credits', 0))} | кораблей {len(p.get('ships') or [])} | "
          f"колония {'есть' if p.get('colony') else 'нет'} | заданий {len(done)}")

    # продаём излишки
    res = p.get("resources") or {}
    for key in ("grain", "water", "steel", "copper"):
        if res.get(key, 0) >= 50:
            s, d = call("/api/npcmarket/trade", {"key": key, "qty": min(100, int(res[key])), "side": "sell"}, tok)
            if s == 200:
                acts.append(f"продал {min(100, int(res[key]))} {key} за {round(d.get('sum', 0))}")

    if "chat" not in done:
        s, d = call("/api/chat/send", {"text": "Караванщик на связи: беру заказы на перевозки."}, tok)
        acts.append(f"написал в чат: {s}")

    if "rent" not in done and p.get("credits", 0) > 120000:
        s, d = call("/api/rent", {"what": "dock"}, tok)
        acts.append(f"арендовал док: {s}")

    # корабль
    p = profile(tok)
    if not (p.get("ships") or []):
        s, d = call("/api/build/status", {}, tok)
        if not [x for x in (d.get("queue") or []) if x["kind"] == "ship"]:
            s, d = call("/api/build/start", {"kind": "ship", "id": "jet_scout"}, tok)
            acts.append(f"заложил разведчик: {s}" + (f" ({d.get('error')})" if d.get("error") else ""))

    # закупка зерна у NPC, если цена низкая, и перепродажа Автопилоту
    s, q = call("/api/npcmarket/quote")
    gbuy = ((q.get("prices") or {}).get("grain") or {}).get("buy", 9)
    p = profile(tok)
    res = p.get("resources") or {}
    if gbuy <= 5.2 and res.get("grain", 0) < 500 and p.get("credits", 0) > 60000:
        qty = 5000
        s, d = call("/api/npcmarket/trade", {"key": "grain", "qty": qty, "side": "buy"}, tok)
        if s == 200:
            acts.append("купил %d кг зерна по %.2f" % (qty, gbuy))

    p = profile(tok)
    res = p.get("resources") or {}
    grain = int(res.get("grain", 0))
    if grain >= 500:
        s, d = call("/api/market/offer", {"resource": "grain", "qty": grain, "price": 5.4}, tok)
        off = (d.get("offer") or {})
        if off.get("id"):
            acts.append("выставил %d кг зерна по 6" % grain)

    # выставляем лот на рынке игроков, если есть что продать
    p = profile(tok)
    res = p.get("resources") or {}
    if res.get("steel", 0) >= 200:
        s, d = call("/api/market/offer", {"resource": "steel", "qty": 100, "price": 14}, tok)
        if s == 200:
            acts.append(f"выставил лот: 100 т стали по 14 кр")
        else:
            acts.append(f"лот не встал: {d.get('error')}")

    # покупаем на рынке игроков дешевле NPC, если есть что
    s, d = call("/api/market/list")
    offers = d.get("offers") or []
    mine = (profile(tok).get("email") or "").lower()
    for o in offers:
        if str(o.get("seller", "")).lower() == mine:
            continue
        if o.get("resource") == "steel" and o.get("price", 99) < 12:
            s, d = call("/api/market/buy", {"id": o.get("id"), "qty": min(50, o.get("qty", 50))}, tok)
            acts.append(f"купил лот у игрока: {s}")
            break

    dup = dedupe_lots(tok, "Караванщик")
    if dup:
        acts.append("убрал %d дубль-лот(ов)" % dup)

    for a in acts:
        print("  •", a)
    if not acts:
        print("  • действий нет, жду")

    p = profile(tok)
    s, st = call("/api/build/status", {}, tok)
    print(f"ИТОГ: кредиты {round(p.get('credits', 0))}, кораблей {len(p.get('ships') or [])}, "
          f"колония {'есть' if p.get('colony') else 'нет'}, в очереди {len(st.get('queue') or [])}")


if __name__ == "__main__":
    main()
