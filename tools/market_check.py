"""
Рыночные метрики «Галактики» в 10 строк.

Считает по users.json на сервере:
  • регистрации по дням (последние 7);
  • активацию: сколько игроков реально играли (события, казино, завод, колония);
  • платящих (pay-orders);
  • пороги из docs/MARKETING.md и статус «успех/нет».

Запуск: python tools/market_check.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = "/var/www/u3699164/data/www/galaktika-data"

THRESHOLDS = {"cr": 0.05, "activation": 0.40, "d1": 0.25, "d7": 0.10, "paying": 0.02}


def ssh(cmd):
    sys.path.insert(0, os.path.join(ROOT, "deploy-host"))
    import audit_all as aud
    return aud.ssh(cmd)


def main():
    raw = ssh("cat %s/users.json" % DATA)
    users = json.loads(raw)
    profiles = []
    for u in users:
        p = u.get("Profile")
        if isinstance(p, str):
            try:
                p = json.loads(p)
            except Exception:
                p = {}
        profiles.append(p or {})

    total = len(profiles)
    registered_days = {}
    for u in users:
        c = (u.get("Created") or "")[:10]
        if c:
            registered_days[c] = registered_days.get(c, 0) + 1

    def played(p):
        return bool(p.get("worldRevenue") or p.get("casinoNet") or p.get("casinoHistory")
                    or p.get("food_factories") or p.get("colony"))

    active = sum(1 for p in profiles if played(p))
    with_colony = sum(1 for p in profiles if p.get("colony"))
    paying = sum(1 for p in profiles if p.get("paid") or p.get("payments"))

    days = sorted(registered_days.items())[-7:]
    print("ИГРОКИ: всего %d | играли %d (%.0f%%) | с колонией %d | платящих %d"
          % (total, active, 100.0 * active / total if total else 0, with_colony, paying))
    print("РЕГИСТРАЦИИ ПО ДНЯМ:", ", ".join("%s: %d" % (d[5:], n) for d, n in days) or "нет данных")
    print("ПОРОГИ: CR %d%% · активация %d%% · D1 %d%% · D7 %d%% · платящие %d%%"
          % tuple(int(THRESHOLDS[k] * 100) for k in ("cr", "activation", "d1", "d7", "paying")))
    print("АКТИВАЦИЯ:", "успех" if total and active / total >= THRESHOLDS["activation"] else "ниже порога",
          "(%.0f%%)" % (100.0 * active / total if total else 0))
    print("ВЫВОД: сначала продукт и воронка, трафик — после активации" if (not total or active / total < THRESHOLDS["activation"])
          else "ВЫВОД: можно запускать платный тест канала")


if __name__ == "__main__":
    main()
