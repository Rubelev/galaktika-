"""10 000 игроков, 365 дней. Модель по серверным правилам (numpy, суточный шаг)."""
import json
import numpy as np

rng = np.random.default_rng(20261028)
N, DAYS = 10_000, 365

# ---- характеры: доля, налог, доля дохода в найм, источник, добыча, отток/мес ----
PERSONAS = [
    ("Казуал",        0.40, 0.10, 0.10, 3,  0.15),
    ("Торговец",      0.20, 0.12, 0.30, 8,  0.09),
    ("Промышленник",  0.15, 0.15, 0.40, 14, 0.06),
    ("Колонист",      0.15, 0.20, 0.50, 10, 0.04),
    ("Хардкор",       0.10, 0.25, 0.60, 25, 0.02),
]
counts = [int(round(N * p[1])) for p in PERSONAS]
counts[-1] = N - sum(counts[:-1])

tax = np.zeros(N); hire = np.zeros(N); mine = np.zeros(N); churn = np.zeros(N); persona = np.zeros(N, dtype=int)
start = 0
for i, (name, share, t, h, m, c) in enumerate(PERSONAS):
    n = counts[i]
    sl = slice(start, start + n)
    tax[sl] = t; hire[sl] = h; mine[sl] = m; churn[sl] = c; persona[sl] = i
    start += n

EN = np.full(N, 1200.0)              # цена землянина
BASE_TAX = 18.0
CAP = np.full(N, 250_000.0)          # начинают на луне
stage = np.zeros(N, dtype=int)       # 0 луна, 1 планета, 2 лифт
CAPS = np.array([250_000.0, 1_500_000.0, 5_000_000.0])

pop = np.full(N, 50_000.0)
credits = np.full(N, 250_000.0 - 100_000 - 18_000 - 200_000)   # после аренды, корабля и колонии
credits = np.maximum(credits, 0.0)
happy = np.full(N, 70.0)
steel = np.full(N, 250.0)
chips = np.full(N, 24.0)
earth = np.zeros(N); mars = np.zeros(N); astral = np.zeros(N)
lived = np.zeros(N)                  # дней жизни колонии
alive = np.ones(N, dtype=bool)
quit_day = np.zeros(N, dtype=int)
reached_planet = np.zeros(N, dtype=bool); reached_lift = np.zeros(N, dtype=bool)

daily_churn = churn / 30.0

for day in range(1, DAYS + 1):
    # уход
    leave = alive & (rng.random(N) < daily_churn)
    alive &= ~leave
    quit_day[leave] = day

    act = alive
    # добыча
    steel[act] += mine[act]
    chips[act] += np.where(mine[act] >= 10, 0.5, 0.2)
    credits[act] += mine[act] * 12

    # экономика колонии
    astral_b = np.minimum(0.4, astral / 100_000 * 0.4)
    earth_b = np.minimum(0.5, earth / 100_000 * 0.5)
    food = pop * 0.3
    cost = food * 4.0 + pop * 0.003 * 7.0
    income = pop * tax * BASE_TAX * (1 + astral_b)
    upkeep = pop ** 2 * 1e-6
    net = income - upkeep

    poor = act & (credits + net < cost)
    rate = np.where(poor, -0.05, 0.01 * np.where(happy > 70, 2.0, 1.0) * (1 + earth_b))
    happy = np.where(poor, np.maximum(0, happy - 5), np.minimum(100, happy + 0.4))
    over = happy > 70
    happy = np.where(tax > 0.15, np.maximum(0, happy - (tax * 100 - 15) * 0.1), happy)

    credits = np.where(poor, 0.0, credits + net - cost)
    pop = np.minimum(CAPS[stage], np.maximum(0, pop * np.exp(np.where(act, rate, 0.0))))

    # волны переселенцев
    before = lived.copy(); lived[act] += 1
    for m in (30, 60, 90):
        wave = act & (before < m) & (lived >= m)
        pop[wave] = np.minimum(CAPS[stage[wave]], pop[wave] * 1.5)

    # этапы
    can_planet = act & (stage == 0) & (pop >= 100_000) & (credits >= 500_000) & (steel >= 500)
    credits[can_planet] -= 500_000; steel[can_planet] -= 500
    stage[can_planet] = 1; reached_planet |= can_planet
    can_lift = act & (stage == 1) & (pop >= 500_000) & (credits >= 2_000_000) & (steel >= 2000) & (chips >= 200)
    credits[can_lift] -= 2_000_000; steel[can_lift] -= 2000; chips[can_lift] -= 200
    stage[can_lift] = 2; reached_lift |= can_lift

    # найм раз в N дней (упрощённо: раз в неделю для активных)
    if day % 7 == 0:
        spend = credits * hire
        n = np.floor(spend / EN).astype(int)
        ok = act & (n >= 100)
        credits[ok] -= n[ok] * EN[ok]
        earth[ok] += n[ok]
        pop[ok] += n[ok]
        pop[ok] = np.minimum(CAPS[stage[ok]], pop[ok])

alive_n = int(alive.sum())
survivors = np.where(alive)[0]

print(f"ИГРОКОВ: {N:,} | ДНЕЙ: {DAYS}")
print(f"дожили до года: {alive_n:,} ({alive_n / N:.1%})")
print()

# кривая удержания по месяцам
print("УДЕРЖАНИЕ ПО МЕСЯЦАМ")
for m in (1, 3, 6, 9, 12):
    d = m * 30
    n = int(((quit_day == 0) | (quit_day > d)).sum())
    print(f"  к {m:>2} мес: {n:>6,} ({n / N:>5.1%})")
print()

print("ЭТАПЫ ЗА ГОД")
print(f"  луна:     {N:>6,} (100.0%)")
print(f"  планета:  {int(reached_planet.sum()):>6,} ({reached_planet.mean():.1%})")
print(f"  лифт:     {int(reached_lift.sum()):>6,} ({reached_lift.mean():.1%})")
print()

print("ИТОГИ ДОЖИВШИХ")
if alive_n:
    p = pop[survivors]
    c = credits[survivors]
    print(f"  население: медиана {np.median(p):>10,.0f} | 90-й перцентиль {np.percentile(p, 90):>10,.0f} | макс {p.max():>10,.0f}")
    print(f"  кредиты:   медиана {np.median(c):>10,.0f} | 90-й перцентиль {np.percentile(c, 90):>10,.0f} | макс {c.max():>12,.0f}")
    print(f"  энергия:   медиана {np.median(happy[survivors]):.0f} счастья")
print()

print("ПО ХАРАКТЕРАМ")
print(f"{'характер':<14}{'дожили':<10}{'планета':<10}{'лифт':<10}{'нас. медиана':<16}{'кредиты медиана'}")
for i, (name, share, t, h, m, c) in enumerate(PERSONAS):
    mask = persona == i
    surv = mask & alive
    n_surv = int(surv.sum())
    pl = int((mask & reached_planet).sum())
    lf = int((mask & reached_lift).sum())
    med_pop = np.median(pop[surv]) if n_surv else 0
    med_cr = np.median(credits[surv]) if n_surv else 0
    print(f"{name:<14}{n_surv:>6,}    {pl:>6,}    {lf:>6,}     {med_pop:>12,.0f}    {med_cr:>14,.0f}")

# отток по месяцам
print()
print("КОГДА УХОДЯТ")
for lo, hi, name in ((1, 7, "1-7 дней"), (8, 30, "8-30 дней"), (31, 90, "31-90"), (91, 180, "91-180"), (181, 365, "181-365")):
    n = int(((quit_day >= lo) & (quit_day <= hi)).sum())
    print(f"  {name:<10} {n:>6,}  {'█' * int(60 * n / N)}")

json.dump({
    "n": N, "alive": alive_n,
    "planet": int(reached_planet.sum()), "lift": int(reached_lift.sum()),
    "months": {m: int(((quit_day == 0) | (quit_day > m * 30)).sum()) for m in (1, 3, 6, 9, 12)},
}, open(r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\sim10000.json", "w"), indent=1)
