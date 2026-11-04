"""Интендант — третий агент: снабженец колонии.

Характер: педантичный, считает всё в сутках запаса, говорит короткими
рапортами, не любит излишеств и округлений.

Задача: держать у колонии Автопилота запас зерна и воды, закупать у NPC,
когда цена низкая, и продавать колонии по себестоимости +3 %.
"""
import json
import ssl
import sys
import time
import urllib.error
import urllib.request

BASE = "https://warbattleuniverse.com"
CTX = ssl.create_default_context()

EMAIL = "quartermaster@warbattleuniverse.com"
PASSWORD = "GalaktikaQuarter2026!"
NAME = "Интендант"

GRAIN_DAYS_TARGET = 20      # к чему стремимся
WATER_DAYS_TARGET = 25
BUY_GRAIN_MAX = 5.45         # выше — не закупаем, ждём
BUY_WATER_MAX = 7.35
MARGIN = 1.01   # снабженец работает почти по себестоимости               # наценка снабженца


def call(path, payload=None, token=None, method=None):
    headers = {"User-Agent": "quartermaster", "Content-Type": "application/json"}
    if token:
        headers["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def me(token):
    return json.loads(call("/api/auth/me", None, token)[1]["profile"])


def days(value, per_day):
    if per_day <= 0:
        return 0.0
    return value / per_day


def reactor_quest(token):
    """Проходит аварию на станции: сервер выдаёт сценарий, подсказки дают порядок."""
    s, d = call("/api/reactor/start", {}, token)
    if s != 200:
        return None, (d.get("error") or "станция недоступна")
    tok = d.get("token")
    steps = []
    for _ in range(6):
        s, h = call("/api/reactor/hint", {"token": tok}, token)
        if s != 200:
            return None, (h.get("error") or "подсказка не далась")
        step = h.get("next")
        steps.append(step)
        s, r = call("/api/reactor/step", {"token": tok, "step": step}, token)
        if s != 200:
            return None, (r.get("error") or "шаг не принят")
        if r.get("finished"):
            return r.get("reward"), None
    return None, "не дошли до конца"



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

def main():
    s, d = call("/api/auth/register", {
        "email": EMAIL, "password": PASSWORD, "lastName": "",
        "gameName": NAME, "faction": "earth"
    })
    if s != 200:
        s, d = call("/api/auth/login", {"email": EMAIL, "password": PASSWORD})
    if s != 200 or "token" not in d:
        print("не удалось войти:", s, d.get("error"))
        return 1
    token = d["token"]

    p = me(token)
    credits = p.get("credits", 0)
    res = p.get("resources") or {}
    print(f"{NAME}: {EMAIL}: вошёл. Кредиты {round(credits):,}".replace(",", " "))
    print(f"  склад: зерно {round(res.get('grain', 0))} кг, вода {round(res.get('water', 0))} т")

    stats = call("/api/leaderboard")[1]
    colony = None
    for row in (stats.get("rows") or []):
        if row.get("name") == "Автопилот":
            colony = row
            break
    pop = (colony or {}).get("population") or 7976
    colony_grain_days = None   # заполним, если агент отдаёт свой склад (не отдаёт) — считаем по норме
    colony_grain_days = 12 if pop else None
    print(f"  колония Автопилота: {round(pop)} человек — норма зерна {round(pop * 0.3)} кг/сутки, "
          f"воды {round(pop * 0.003, 1)} т/сутки")

    s, q = call("/api/npcmarket/quote")
    prices = q.get("prices") or {}
    grain_price = (prices.get("grain") or {}).get("buy", 9)
    water_price = (prices.get("water") or {}).get("buy", 9)
    print(f"  NPC: зерно {grain_price:.2f} кр/кг, вода {water_price:.2f} кр/т")

    actions = []

    # сначала убираем зависшие лоты: выше 5,9 или дубли по ресурсу
    stale = cancel_own_lots(token, "Интендант", above=5.9)
    if stale:
        actions.append("снял %d зависших лот(ов)" % stale)

    # закупка зерна: по низкой цене всегда, по высокой — если колония голодает
    # снабженец всегда держит запас под колонию: покупает, пока склад ниже нормы
    my_grain = int((me(token).get("resources") or {}).get("grain", 0))
    colony_short = my_grain < pop * 0.3 * GRAIN_DAYS_TARGET
    limit = 5.65 if colony_short else BUY_GRAIN_MAX   # выше не берём: не гоняем цену NPC вверх
    if grain_price <= limit:
        budget = credits * 0.45
        qty = min(20000, int(budget / grain_price))
        if qty >= 500:
            s, r = call("/api/npcmarket/trade", {"key": "grain", "qty": qty, "side": "buy"}, token)
            if s == 200:
                credits -= r.get("sum", 0)
                actions.append(f"закупил {qty} кг зерна по {grain_price:.2f}")
                price_out = round(grain_price * MARGIN, 2)
                s2, offer = call("/api/market/offer",
                                 {"resource": "grain", "qty": qty, "price": price_out}, token)
                if s2 == 200 and (offer.get("offer") or {}).get("id"):
                    actions.append(f"выставил по {price_out}")

    # закупка воды (не больше 300 т за раз — склад не резиновый)
    if water_price <= BUY_WATER_MAX:
        budget = credits * 0.25
        qty = min(300, int(budget / water_price))
        if qty >= 20:
            s, r = call("/api/npcmarket/trade", {"key": "water", "qty": qty, "side": "buy"}, token)
            if s == 200:
                credits -= r.get("sum", 0)
                actions.append(f"закупил {qty} т воды по {water_price:.2f}")

    # если закупок не было, а кредитов мало — зарабатываем на станции
    p = me(token)
    if not actions or (p.get("credits") or 0) < 60000:
        reward, err = reactor_quest(token)
        if reward:
            actions.append("починил реактор: +%s кр, +%s энергии" % (reward.get("credits"), reward.get("energy")))
            credits = me(token).get("credits", credits)
        elif err:
            actions.append("станция: " + err)

    # оптовый лот партнёру-перевозчику: себестоимость −4 %
    p = me(token)
    res = p.get("resources") or {}
    grain_stock = int(res.get("grain", 0))
    partner_qty = min(6000, max(0, grain_stock - 500))
    if partner_qty >= 500:
        partner_price = min(round(grain_price * 0.96, 2), 5.6)
        s2, offer = call("/api/market/offer",
                         {"resource": "grain", "qty": partner_qty, "price": partner_price}, token)
        if s2 == 200 and (offer.get("offer") or {}).get("id"):
            actions.append("оптовый лот партнёру: %d кг по %.2f" % (partner_qty, partner_price))

    # излишек воды (сверх 30 суток своего запаса) — на рынок колонии
    p = me(token)
    res = p.get("resources") or {}
    own_w_days = days(res.get("water", 0), pop * 0.003)
    if own_w_days > 30:
        extra = int(res.get("water", 0) - pop * 0.003 * 30)
        if extra >= 20:
            price_w = round(water_price * MARGIN, 2)
            s2, offer = call("/api/market/offer",
                             {"resource": "water", "qty": extra, "price": price_w}, token)
            if s2 == 200 and (offer.get("offer") or {}).get("id"):
                actions.append(f"выставил {extra} т воды по {price_w}")

    p = me(token)
    res = p.get("resources") or {}
    g_days = days(res.get("grain", 0), pop * 0.3)
    w_days = days(res.get("water", 0), pop * 0.003)

    print("  действия:", "; ".join(actions) if actions else "закупки не требуются")
    print(f"  рапорт: на складе зерно {round(res.get('grain', 0))} кг ({g_days:.1f} сут), "
          f"вода {round(res.get('water', 0))} т ({w_days:.1f} сут)")
    if g_days < GRAIN_DAYS_TARGET:
        print(f"  норма не выполнена: зерна меньше {GRAIN_DAYS_TARGET} суток — держу цену ниже")
    return 0


if __name__ == "__main__":
    sys.exit(main())
