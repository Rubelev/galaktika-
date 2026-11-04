# -*- coding: utf-8 -*-
import json, math, os

R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
d2 = json.load(open(os.path.join(R, "_scales2.json"), encoding="utf-8"))
d1 = json.load(open(os.path.join(R, "_scales.json"), encoding="utf-8"))
KM = 149600000.0 / 185.0
C = 299792.458
SIDS = ["trade-earth-mars-0", "fleet-0", "portal-in", "belt-0", "pirate-0", "civil-5"]
NAMES = {"trade-earth-mars-0": "торговец", "fleet-0": "флот", "portal-in": "портал",
         "belt-0": "пояс", "pirate-0": "пират", "civil-5": "гражданский"}
STEP = {1: "1 с", 59: "60 с", 3540: "1 ч", 82800: "1 сут", 31449600: "1 год"}

out = []
def w(s=""):
    out.append(str(s))

samples = d2["samples"]
w("=== ЗАМОРОЖЕННАЯ СЕРИЯ (шаг игрового времени; одинаково на всех масштабах) ===")
w("| Шаг | Тип | Смещение, px | px/45с | доля c | Скачок | От трассы, px | Курс, ° |")
w("|---|---|---|---|---|---|---|---|")
rows = []
for k in SIDS:
    prevd = None
    for i in range(1, len(samples)):
        a, b = samples[i - 1], samples[i]
        if k not in a["pos"] or k not in b["pos"]:
            continue
        dt = b["off"] - a["off"]
        dx = b["pos"][k][0] - a["pos"][k][0]
        dy = b["pos"][k][1] - a["pos"][k][1]
        dist = math.hypot(dx, dy)
        px45 = dist * 45 / dt
        cc = dist * KM / dt / C
        course = math.atan2(dy, dx) * 180 / math.pi + 90
        ang = a["ang"].get(k)
        dh = None if ang is None else (ang - course + 540) % 360 - 180
        jump = "нет"
        if prevd is not None and dist > 3 * prevd and dist > 5:
            jump = "ДА"
        dev = b["dev"].get(k)
        rows.append(dict(k=k, dt=dt, dist=dist, px45=px45, c=cc, jump=jump, dev=dev, dh=dh))
        w("| %s | %s | %.2f | %.2f | %.4f | %s | %s | %s |" % (
            STEP.get(dt, str(dt)), NAMES[k], dist, px45, cc, jump,
            ("%.1f" % dev) if dev is not None else "нет линии",
            ("%.1f" % dh) if dh is not None else "нет rotate"))
        prevd = dist
w("")

w("=== ЖИВОЙ РЕЖИМ (1,5 с реального времени на каждом масштабе) ===")
w("| Масштаб | ts | Δt игры за 1,5 с | Тип | Смещение, px | px/45с | доля c |")
w("|---|---|---|---|---|---|---|")
for l in d1["live"]:
    for k in SIDS:
        r = l["rows"].get(k)
        if not r: continue
        w("| %s | %d | %d с | %s | %.2f | %.4f | %.4f |" % (l["mode"], l["ts"], l["dg"], NAMES[k], r["d"], r["px45"], r["c"]))
w("")

w("=== ПЕРЕКЛЮЧЕНИЕ МАСШТАБОВ ===")
for s in d1["switching"]:
    w("| %s | Δt игры = %d с | %s |" % (s["step"], s["dg"], ", ".join("%s %.1f px" % (NAMES[k], v) for k, v in s["d"].items())))
for s in d1["frozenDiff"]:
    w("| %s | Δt игры = %d с | %s |" % (s["step"], s["dg"], ", ".join("%s %.1f px" % (NAMES[k], v) for k, v in s["d"].items())))
w("")

# сводка по типам
w("=== ПО КАЖДОМУ ТИПУ: ГДЕ ЛОМАЕТСЯ ===")
for k in SIDS:
    rs = [r for r in rows if r["k"] == k]
    if not rs: continue
    mx = max(rs, key=lambda r: r["px45"])
    stuck = [STEP.get(r["dt"]) for r in rs if r["dist"] < 0.05]
    jumps = [STEP.get(r["dt"]) for r in rs if r["jump"] == "ДА"]
    w("%-13s макс %.2f px/45с (%.3f c) на шаге %s; нулевые шаги: %s; скачки: %s; от трассы %s" % (
        NAMES[k], mx["px45"], mx["c"], STEP.get(mx["dt"]),
        ", ".join(stuck) if stuck else "нет", ", ".join(jumps) if jumps else "нет",
        ("%.1f" % rs[-1]["dev"]) if rs[-1]["dev"] is not None else "нет линии"))
w("")

open(os.path.join(R, "_scales_table.md"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
