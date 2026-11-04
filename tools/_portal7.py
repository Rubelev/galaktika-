# -*- coding: utf-8 -*-
import json, math, os

R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
frames = {f["cfg"]["name"]: f for f in json.load(open(os.path.join(R, "_frames.json"), encoding="utf-8"))}
base = frames["z0"]["data"]
KM = 149600000.0 / 185.0
C = 299792.458

def ships(n):
    return {s["sid"]: s for s in frames[n]["data"]["ships"] if s.get("sid")}

S = {n: ships(n) for n in frames}
paths = base["paths"]["trade"]

def dist_pts(x, y, pts):
    return min(math.hypot(q[0] - x, q[1] - y) for q in pts)

out = []
def w(s=""):
    out.append(str(s))

w("build=%s cam=%s" % (base["build"], json.dumps(base["cam"])))
w("торговых путей: %d; последний (portal-path): %s" % (len(paths), paths[-1]["d"][:60] if paths else "-"))
w("")
w("%-11s %8s %10s %7s %8s %8s %9s %9s" % ("sid", "dpx600", "км/с", "c", "px45", "dpx60", "до линии", "до др.линии"))
rows = []
for sid in ("portal-out", "portal-in"):
    a, b600, b60 = S["z0"][sid], S["z600"][sid], S["z60"][sid]
    d600 = math.hypot(b600["x"] - a["x"], b600["y"] - a["y"])
    d60 = math.hypot(b60["x"] - a["x"], b60["y"] - a["y"])
    v = d600 * KM / 600
    own = dist_pts(a["x"], a["y"], paths[-1]["pts"])
    others = min(dist_pts(a["x"], a["y"], p["pts"]) for p in paths[:-1])
    rows.append((sid, d600, v, v / C, d600 * 45 / 600, d60, own, others))
    w("%-11s %8.2f %10.0f %7.3f %8.2f %8.2f %9.2f %9.2f" % (sid, d600, v, v / C, d600 * 45 / 600, d60, own, others))
w("")
# шаги серии
series = ["z0", "z60", "z120", "z180", "z240", "z300"]
for sid in ("portal-out", "portal-in"):
    steps = []
    for i in range(5):
        p1, p2 = S[series[i]][sid], S[series[i + 1]][sid]
        steps.append(math.hypot(p2["x"] - p1["x"], p2["y"] - p1["y"]))
    w("%s шаги 60 с: %s | медиана %.2f | макс %.2f" % (sid, " ".join("%6.2f" % s for s in steps),
      sorted(steps)[2], max(steps)))
w("")
# контроль: флот и торговцы
fl = [r for r in frames["z600"]["data"]["ships"] if (r["sid"] or "").startswith("fleet-")]
w("контроль флота: N=%d" % len(fl))
mx = 0
for s in fl:
    a = S["z0"][s["sid"]]; b = S["z600"][s["sid"]]
    d = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
    mx = max(mx, d)
w("  макс dpx600 = %.1f px = %.0f км/с = %.3f c" % (mx, mx * KM / 600, mx * KM / 600 / C))
tr = []
for sid, s in S["z0"].items():
    if not sid.startswith("trade-"): continue
    a, b = S["z0"][sid], S["z600"][sid]
    tr.append(math.hypot(b["x"] - a["x"], b["y"] - a["y"]))
w("торговцы: N=%d, макс %.0f км/с = %.3f c, макс px45 %.2f" % (len(tr), max(tr) * KM / 600, max(tr) * KM / 600 / C, max(tr) * 45 / 600))
# пояс и пираты
for pref, name in (("belt-", "пояс"), ("pirate-", "пираты")):
    rows2 = []
    for sid, s in S["z0"].items():
        if not sid.startswith(pref): continue
        a, b = S["z0"][sid], S["z600"][sid]
        rows2.append((math.hypot(b["x"] - a["x"], b["y"] - a["y"]), sid))
    rows2.sort(reverse=True)
    w("%s: N=%d, макс %.0f км/с = %.3f c (%s), топ dpx600: %s" % (name, len(rows2), rows2[0][0] * KM / 600,
      rows2[0][0] * KM / 600 / C, rows2[0][1], ", ".join("%s=%.1f" % (s, d) for d, s in rows2[:3])))
open(os.path.join(R, "_portal7.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
