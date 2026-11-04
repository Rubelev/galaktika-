"""100 игроков с разными характерами, 365 игровых дней. Модель по серверным правилам.

Правила (как в api.php):
  налоги  = население * ставка * 18 * (1 + бонус астровитян)
  еда     = население * 0.3 кг * 4 кр/кг, вода = население * 0.003 т * 7 кр/т
  содержание = население^2 * 1e-6, при автономии −25%
  рост    = exp(rate*days), rate = 1% (2% при счастье > 70), * (1 + бонус землян)
  волны   = +50% на 30, 60, 90 день жизни колонии
  потолки = луна 250k, планета 1.5M, лифт 5M
"""
import json
import math
import random

random.seed(20261028)

DAYS = 365
FOOD_KG, WATER_T, FOOD_PRICE, WATER_PRICE = 0.3, 0.003, 4.0, 7.0
TAX_BASE, UPKEEP_K = 18.0, 0.000001
CAP = {"moon": 250_000, "planet": 1_500_000, "elevator": 5_000_000}


class Player:
    def __init__(self, pid, persona):
        self.id = pid
        self.persona = persona
        self.credits = 250_000.0
        self.pop = 0.0
        self.happy = 70.0
        self.tax = persona["tax"]
        self.stage = None
        self.lived = 0.0
        self.grain = 2_000.0
        self.steel = 250.0
        self.chips = 24.0
        self.earth = 0
        self.mars = 0
        self.astral = 0
        self.alive = True
        self.quit_day = None
        self.last_login = 0
        self.stage_reached = []
        self.achievements = 0
        self.days_active = 0

    # --- экономика колонии за день ---
    def colony_day(self):
        if self.pop <= 0:
            return
        earth_b = min(0.5, self.earth / 100000 * 0.5)
        astral_b = min(0.4, self.astral / 100000 * 0.4)
        food = self.pop * FOOD_KG
        water = self.pop * WATER_T
        cost = food * FOOD_PRICE + water * WATER_PRICE
        income = self.pop * self.tax * TAX_BASE * (1 + astral_b)
        upkeep = self.pop ** 2 * UPKEEP_K
        net = income - upkeep

        if self.credits + net < cost:           # нечем кормить
            rate = -0.05
            self.happy = max(0, self.happy - 5)
            self.credits = 0
        else:
            self.credits += net - cost
            rate = 0.01 * (2 if self.happy > 70 else 1) * (1 + earth_b)
            self.happy = min(100, self.happy + 0.4)
            if self.tax > 0.15:
                self.happy = max(0, self.happy - (self.tax * 100 - 15) * 0.1)

        self.pop = min(CAP[self.stage], self.pop * math.exp(rate))
        before = self.lived
        self.lived += 1
        for m in (30, 60, 90):
            if before < m <= self.lived:
                self.pop = min(CAP[self.stage], self.pop * 1.5)

    def try_stage(self, persona):
        if self.stage == "moon" and self.pop >= 100_000 and self.credits >= 500_000 and self.steel >= 500:
            self.credits -= 500_000
            self.steel -= 500
            self.stage = "planet"
            self.stage_reached.append("planet")
            self.achievements += 1
        if self.stage == "planet" and self.pop >= 500_000 and self.credits >= 2_000_000 \
                and self.steel >= 2000 and self.chips >= 200:
            self.credits -= 2_000_000
            self.steel -= 2000
            self.chips -= 200
            self.stage = "elevator"
            self.stage_reached.append("elevator")
            self.achievements += 1

    def hire(self, persona):
        """Тратит излишки на найм переселенцев."""
        if self.credits < 300_000:
            return
        budget = self.credits * persona["hire_share"]
        source = persona["hire_source"]
        price = {"earth": 1200, "mars": 2000, "astral": 1500}[source]
        n = int(budget / price)
        if n < 100:
            return
        self.credits -= n * price
        setattr(self, source, getattr(self, source) + n)
        if self.stage:
            self.pop += n
        self.achievements += 0


PERSONAS = [
    dict(name="Казуал", tax=0.10, hire_share=0.1, hire_source="earth", churn=0.15, colony_day=14, greed=0.2, mine=3),
    dict(name="Торговец", tax=0.12, hire_share=0.3, hire_source="astral", churn=0.08, colony_day=8, greed=0.4, mine=8),
    dict(name="Промышленник", tax=0.15, hire_share=0.4, hire_source="mars", churn=0.05, colony_day=6, greed=0.5, mine=14),
    dict(name="Колонист", tax=0.20, hire_share=0.5, hire_source="earth", churn=0.04, colony_day=4, greed=0.7, mine=10),
    dict(name="Хардкор", tax=0.25, hire_share=0.6, hire_source="mars", churn=0.01, colony_day=2, greed=0.9, mine=25),
]


def play(persona, pid):
    p = Player(pid, persona)
    # первые дни: аренда дока и корабль
    p.credits -= 100_000      # аренда места
    p.credits -= 18_000       # корабль
    p.stage = "moon"
    p.pop = 50_000.0
    p.credits -= 200_000      # основание колонии
    p.achievements += 1

    for day in range(1, DAYS + 1):
        if not p.alive:
            break
        if random.random() < persona["churn"] / 30:   # месячный процент -> дневной
            p.quit_day = day
            p.alive = False
            break
        p.days_active += 1
        # добыча и продажа руды: сталь, чипы, немного кредитов
        p.steel += persona["mine"]
        p.chips += 0.5 if persona["mine"] >= 10 else 0.2
        p.credits += persona["mine"] * 12
        p.colony_day()
        p.try_stage(persona)
        if day % persona["colony_day"] == 0:
            p.hire(persona)
        if p.pop <= 0 and day > 60:
            p.quit_day = day
            p.alive = False
    return p


players = []
for i in range(100):
    persona = PERSONAS[i % len(PERSONAS)]
    players.append(play(persona, i))

alive = [p for p in players if p.alive]
quit_ = [p for p in players if not p.alive]

print("ИГРОКОВ: 100, ДНЕЙ: 365\n")
print(f"дошли до конца года: {len(alive)} | бросили: {len(quit_)}")
if quit_:
    print(f"средний день ухода: {sum(p.quit_day for p in quit_)/len(quit_):.0f}")
print()

print("КТО ЧЕГО ДОСТИГ (за год хоть раз)")
reached = {"moon": 0, "planet": 0, "elevator": 0}
for p in players:
    reached["moon"] += 1
    if "planet" in p.stage_reached or p.stage in ("planet", "elevator"): reached["planet"] += 1
    if "elevator" in p.stage_reached or p.stage == "elevator": reached["elevator"] += 1
for stage, title in (("moon", "лунная база"), ("planet", "планета"), ("elevator", "лифт")):
    print(f"  до этапа «{title}»: {reached[stage]}")

print("\nИТОГИ ПО ХАРАКТЕРАМ")
print(f"{'характер':<14}{'дошли':<7}{'нас.':<12}{'кредиты':<14}{'этап':<10}{'достиж.'}")
for persona in PERSONAS:
    group = [p for p in players if p.persona["name"] == persona["name"]]
    fin = [p for p in group if p.alive]
    pop = sum(p.pop for p in fin) / len(fin) if fin else 0
    cr = sum(p.credits for p in fin) / len(fin) if fin else 0
    stage = max((p.stage for p in fin), key=lambda s: ["moon", "planet", "elevator"].index(s)) if fin else "—"
    ach = sum(p.achievements for p in fin) / len(fin) if fin else 0
    print(f"{persona['name']:<14}{len(fin):<7}{pop:>10,.0f}  {cr:>12,.0f}  {stage:<10}{ach:>5.1f}")

pops = sorted(p.pop for p in alive)
if pops:
    print(f"\nнаселение: мин {pops[0]:,.0f} | медиана {pops[len(pops)//2]:,.0f} | макс {pops[-1]:,.0f}")

with open(r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\sim100.json", "w", encoding="utf-8") as f:
    json.dump([dict(persona=p.persona["name"], pop=round(p.pop), credits=round(p.credits),
                    stage=p.stage, alive=p.alive, quit_day=p.quit_day, achievements=p.achievements)
               for p in players], f, ensure_ascii=False, indent=1)
print("\nподробности: deploy-host/sim100.json")
