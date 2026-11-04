# -*- coding: utf-8 -*-
import json, math, os

R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
d = json.load(open(os.path.join(R, "_scales.json"), encoding="utf-8"))
KM = 149600000.0 / 185.0
C = 299792.458

SIDS = ["trade-earth-mars-0", "fleet-0", "portal-in", "belt-0", "pirate-0", "civil-5"]
NAMES = {"trade-earth-mars-0": "торговец", "fleet-0": "флот", "portal-in": "портал",
         "belt-0": "пояс", "pirate-0": "пират", "civil-5": "гражданский"}

out = []
def w(s=""):
    out.append(str(s))

frozen = d["frozen"]
w("=== ЗАМОРОЖЕННАЯ СЕРИЯ (шаги игрового времени) ===")
w("%-13s %-10s %10s %10s %8s %8s %9s %7s %8s" % ("тип", "шаг", "смещение", "px/45с", "доля c", "скачок", "от трассы", "курс", "|pos|"))
rows = []
for k in SIDS:
    prev = None
    prevd = None
    for i in range(1, len(frozen)):
        a, b = frozen[i - 1], frozen[i]
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
        r = math.hypot(b["pos"][k][0], b["pos"][k][1])
        rows.append(dict(k=k, dt=dt, dist=dist, px45=px45, c=cc, jump=jump, dev=b["dev"].get(k), dh=dh, r=r))
        w("%-13s %10d %10.2f %10.3f %8.4f %8s %9s %7s %8.1f" % (
            NAMES[k], dt, dist, px45, cc, jump,
            ("%.1f" % b["dev"][k]) if b["dev"].get(k) is not None else "-",
            ("%.1f" % dh) if dh is not None else "-", r))
        prevd = dist
w("")

w("=== ЖИВОЙ РЕЖИМ ПО МАСШТАБАМ ===")
w("%-8s %4s %10s %-13s %10s %10s %8s" % ("масштаб", "ts", "Δt игры", "тип", "смещение", "px/45с", "доля c"))
for l in d["live"]:
    for k in SIDS:
        r = l["rows"].get(k)
        if not r:
            continue
        w("%-8s %4d %10d %-13s %10.2f %10.3f %8.4f" % (l["mode"], l["ts"], l["dg"], NAMES[k], r["d"], r["px45"], r["c"]))
w("")

w("=== ПЕРЕКЛЮЧЕНИЕ МАСШТАБОВ ===")
for s in d["switching"]:
    w("%-16s Δt игры = %d с; смещения: %s" % (s["step"], s["dg"],
      ", ".join("%s=%.1f" % (NAMES.get(k, k), v) for k, v in s["d"].items())))
for s in d["frozenDiff"]:
    w("%-16s Δt игры = %d с; смещения: %s" % (s["step"], s["dg"],
      ", ".join("%s=%.1f" % (NAMES.get(k, k), v) for k, v in s["d"].items())))
w("")

# сводка по типам: где ломается
w("=== ГДЕ ЛОМАЕТСЯ (по живым замерам) ===")
for k in SIDS:
    vals = [(l["mode"], l["rows"].get(k, {}).get("px45")) for l in d["live"] if l["rows"].get(k)]
    w("%-13s %s" % (NAMES[k], ", ".join("%s=%s" % (m, ("%.3f" % v) if v is not None else "-") for m, v in vals)))
w("")

# максимумы
mx = max(rows, key=lambda r: r["px45"])
w("макс px/45с в замороженной серии: %.2f (%s, шаг %d с) — %.3f c" % (mx["px45"], NAMES[mx["k"]], mx["dt"], mx["c"]))
jumps = [r for r in rows if r["jump"] == "ДА"]
w("шагов со скачком (смещение > 3× предыдущего и > 5 px): %d" % len(jumps))
for r in jumps[:8]:
    w("  %s шаг %d с: %.1f px" % (NAMES[r["k"]], r["dt"], r["dist"]))

open(os.path.join(R, "_scales_table.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
