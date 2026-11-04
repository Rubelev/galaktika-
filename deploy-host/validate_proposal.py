"""Проверка предложенного игроком контента на баланс.

Использование:
    python validate_proposal.py ship "Имя" 200 80 300 3 90000
    python validate_proposal.py building "Имя" 90000 120 "chips:2/20s"
    python validate_proposal.py equipment "Имя" 50000 "скорость ремонта +10%"

Существующие данные, из которых считаются ориентиры:
  корабли: цена / (корпус+щит) = 248…527 кр за единицу прочности, медиана ~364
  трюм: ~30 кр за тонну
  фабрики: роботы 45 000 кр за 1 андроида/25 с, оборудование 38 000 за 2 чипа/20 с
"""
import sys

# эталонные значения из игры
SHIP_PRICE_PER_POINT = 364     # кр за (корпус+щит)
CARGO_PER_TON = 30             # кр за тонну трюма
SHIP_MIN, SHIP_MAX = 248, 527  # допустимый коридор по цене за единицу

FACTORY_CATALOG = {
    "androids": {"cost": 45000, "per": 1, "every": 25},
    "chips": {"cost": 38000, "per": 2, "every": 20},
}


def ship_check(price, hull, shield, cargo, speed):
    points = hull + shield
    fair = points * SHIP_PRICE_PER_POINT + cargo * CARGO_PER_TON + speed * 3000
    lo = points * SHIP_MIN + cargo * CARGO_PER_TON
    hi = points * SHIP_MAX + cargo * CARGO_PER_TON * 2
    verdict = "ok"
    if price < lo * 0.8:
        verdict = "слишком дешёвый — это дыра в балансе"
    elif price > hi * 1.3:
        verdict = "слишком дорогой — никто не купит"
    flags = []
    if cargo > points * 6:
        flags.append("трюм непропорционален корпусу (грузовик не может быть быстрым и прочным)")
    if speed > 4:
        flags.append("скорость выше всех существующих кораблей (максимум 4)")
    if points > 900:
        flags.append("прочность выше линкора «Молот» (880)")
    return {
        "fair": round(fair), "range": (round(lo), round(hi)),
        "verdict": verdict, "flags": flags,
    }


def building_check(cost, out_key, per, every):
    ref = FACTORY_CATALOG.get(out_key)
    if not ref:
        return {"verdict": "неизвестный товар — сравнить не с чем", "flags": []}
    ref_rate = ref["per"] / ref["every"]
    rate = per / every
    ref_cost_per_unit = ref["cost"] / ref_rate
    cost_per_unit = cost / rate
    ratio = cost_per_unit / ref_cost_per_unit
    verdict = "ok" if 0.7 <= ratio <= 1.6 else (
        "дешевле эталона — ускорит экономику" if ratio < 0.7 else "дороже эталона — невыгодно")
    return {
        "ref_rate": round(ref_rate, 4), "rate": round(rate, 4),
        "ratio": round(ratio, 2), "verdict": verdict, "flags": [],
    }


def equipment_check(cost, effect_text):
    """Оборудование оцениваем по силе эффекта: 1 % эффекта ≈ 5 000 кр."""
    import re
    m = re.search(r"(\d+)\s*%", effect_text)
    pct = int(m.group(1)) if m else 0
    fair = pct * 5000
    verdict = "ok"
    if pct > 50:
        verdict = "эффект больше 50% — ломает баланс"
    elif cost < fair * 0.5:
        verdict = "слишком дешёвое для такого эффекта"
    return {"fair": fair, "verdict": verdict, "flags": []}


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    kind = sys.argv[1]
    if kind == "ship":
        name = sys.argv[2]
        price, hull, shield, cargo, speed = (int(x) for x in sys.argv[3:8])
        r = ship_check(price, hull, shield, cargo, speed)
        print(f"Корабль «{name}»: цена {price:,}, корпус {hull}, щит {shield}, трюм {cargo}, ход {speed}")
        print(f"  справедливая цена ≈ {r['fair']:,} кр (коридор {r['range'][0]:,}–{r['range'][1]:,})")
    elif kind == "building":
        name = sys.argv[2]
        cost, then = int(sys.argv[3]), sys.argv[4]
        out_key, per_every = then.split(":") if ":" in then else (then, "1/20")
        per, every = (int(x) for x in per_every.rstrip("s").split("/"))
        r = building_check(cost, out_key, per, every)
        print(f"Постройка «{name}»: {cost:,} кр за {per} {out_key} / {every} с")
        print(f"  соотношение с эталоном: {r.get('ratio')}")
    else:
        name = sys.argv[2]
        cost, effect = int(sys.argv[3]), sys.argv[4]
        r = equipment_check(cost, effect)
        print(f"Оборудование «{name}»: {cost:,} кр, эффект «{effect}»")
        print(f"  справедливая цена ≈ {r['fair']:,} кр")
    print(f"  вердикт: {r['verdict']}")
    for f in r["flags"]:
        print(f"  ⚠ {f}")


if __name__ == "__main__":
    main()
