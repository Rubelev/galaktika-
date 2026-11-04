"""Мой игрок в «Галактике»: одна сессия игры через те же API, что и клиент."""
import json
import ssl
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
BASE = "https://warbattleuniverse.com"
EMAIL = "agent@warbattleuniverse.com"
PASSWORD = "GalaktikaAgent2026!"


def call(path, payload=None, token=None):
    h = {"User-Agent": "agent-player", "Content-Type": "application/json"}
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
                                       "gameName": "Автопилот", "faction": "earth"})
    if s == 200:
        return d["token"], "зарегистрирован"
    raise SystemExit(f"не смог войти: {s} {d}")


def profile(tok):
    return json.loads(call("/api/auth/me", None, tok)[1]["profile"])


def main():
    tok, how = login()
    print(f"игрок {EMAIL}: {how}")
    acts = []

    # 1. достраиваем то, что в очереди
    s, d = call("/api/build/status", {}, tok)
    for a in (d.get("applied") or []):
        acts.append("достроено: " + str(a.get("title")))

    # 2. состояние
    p = profile(tok)
    s, q = call("/api/quests", None, tok)
    done = {x["key"] for x in (q.get("quests") or []) if x["done"]}
    print(f"кредиты {round(p.get('credits', 0))} | кораблей {len(p.get('ships') or [])} | "
          f"колония {'есть' if p.get('colony') else 'нет'} | заданий закрыто {len(done)}")

    # 3. квесты, которые можно закрыть сейчас
    if "sold" not in done:
        res = p.get("resources") or {}
        key = next((k for k in ("steel", "grain", "water", "copper") if res.get(k, 0) >= 50), None)
        if key:
            s, d = call("/api/npcmarket/trade", {"key": key, "qty": 50, "side": "sell"}, tok)
            acts.append(f"продал 50 {key}: {s}")

    if "chat" not in done:
        s, d = call("/api/chat/send", {"text": "Автопилот на связи. Начинаю осваивать систему."}, tok)
        acts.append(f"написал в чат: {s}")

    if "rent" not in done:
        s, d = call("/api/rent", {"what": "dock"}, tok)
        acts.append(f"арендовал место в доке: {s}")

    # 3.5 тик колонии — иначе население и налоги не двигаются
    p = profile(tok)
    if p.get("colony"):
        s, d = call("/api/colony/tick", {}, tok)
        col = d.get("colony") or {}
        rep = d.get("report") or {}
        if s == 200:
            acts.append("тик колонии: население %s, счастье %s, налоги %s" % (
                round(col.get("population", 0)), round(col.get("happiness", 0)), round(rep.get("credits", 0))))

    # 3.6 если зерна меньше 15 дней — покупаем самый дешёвый лот на рынке
    p = profile(tok)
    col = p.get("colony") or {}
    if col:
        pop = col.get("population", 0)
        res = p.get("resources") or {}
        days = res.get("grain", 0) / max(1, pop * 0.3)
        if days < 15:
            s, mk = call("/api/market/list")
            lots = sorted([o for o in (mk.get("offers") or [])
                           if o.get("resource") == "grain" and str(o.get("seller")) != p.get("gameName")],
                          key=lambda o: float(o.get("price") or 99))
            credits = p.get("credits", 0)
            for lot in lots:
                price = float(lot.get("price") or 99)
                if price > 6.1:
                    break
                want = int(pop * 0.3 * 6)          # на 6 дней
                budget = credits * 0.6
                qty = min(int(lot.get("qty") or 0), want, int(budget / price))
                if qty < 200:
                    continue
                s2, d2 = call("/api/market/buy", {"id": lot["id"], "qty": qty}, tok)
                if s2 == 200:
                    credits -= d2.get("sum", 0)
                    acts.append("купил %d кг зерна по %.2f" % (qty, price))
                    break

    # 4. корабль, если его нет
    p = profile(tok)
    if not (p.get("ships") or []) and not any(True for _ in []):
        s, d = call("/api/build/status", {}, tok)
        queued = [q2 for q2 in (d.get("queue") or []) if q2["kind"] == "ship"]
        if not queued:
            s, d = call("/api/build/start", {"kind": "ship", "id": "jet_scout"}, tok)
            acts.append(f"заложил разведчик: {s}" + (f" ({d.get('error')})" if d.get("error") else ""))

    # 4.5 если на колонию не хватает — продаём излишки со склада
    p = profile(tok)
    guard = 0
    while not p.get("colony") and p.get("credits", 0) < 210000 and guard < 14:
        guard += 1
        res = p.get("resources") or {}
        # при наличии колонии зерно и воду не трогаем — это еда и питьё
        keys = ("silver", "gold", "steel", "copper", "nickel", "chips", "boards")
        if not p.get("colony"):
            keys = ("water", "grain") + keys
        key = next((k for k in keys if res.get(k, 0) >= 10), None)
        if not key:
            break
        s, d = call("/api/npcmarket/trade", {"key": key, "qty": min(50, int(res[key])), "side": "sell"}, tok)
        if s != 200:
            break
        acts.append(f"продал {min(50, int(res[key]))} {key} ради колонии")
        p = profile(tok)

    # 5. колония, если корабль готов
    p = profile(tok)
    if not p.get("colony") and len(p.get("ships") or []) >= 1 and p.get("credits", 0) >= 200000:
        s, d = call("/api/colony/found", {}, tok)
        acts.append(f"основал колонию: {s}" + (f" ({d.get('error')})" if d.get("error") else ""))
        if s == 200:
            s, d = call("/api/colony/tick", {}, tok)
            acts.append(f"первый тик колонии: {s}")

    # 6. найм, если есть лишние деньги
    p = profile(tok)
    if p.get("credits", 0) > 400000:
        s, d = call("/api/hire", {"count": 100, "source": "earth"}, tok)
        acts.append(f"нанял 100 землян: {s}")

    for a in acts:
        print("  •", a)
    if not acts:
        print("  • пока делать нечего: жду таймеры")

    p = profile(tok)
    s, st = call("/api/build/status", {}, tok)
    queue = st.get("queue") or []
    print(f"ИТОГ: кредиты {round(p.get('credits', 0))}, "
          f"колония {'есть' if p.get('colony') else 'нет'}, "
          f"население {round((p.get('colony') or {}).get('population', 0))}, "
          f"кораблей {len(p.get('ships') or [])}, в очереди {len(queue)}")


if __name__ == "__main__":
    main()
