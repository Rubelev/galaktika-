# -*- coding: utf-8 -*-
import json, math, os, re

R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
frames = {f["cfg"]["name"]: f for f in json.load(open(os.path.join(R, "_frames.json"), encoding="utf-8"))}
base = frames["z0"]["data"]
planets = {p["id"]: p["wc"] for p in base["planets"] if p.get("wc")}
paths = base["paths"]["fleet"]

def parse_d(d):
    m = re.match(r"\s*M\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)\s*([QL])\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)(?:\s*[ ,]\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+))?", d or "")
    if not m:
        return None
    a = (float(m.group(1)), float(m.group(2)))
    if m.group(3) == "Q":
        return a, (float(m.group(4)), float(m.group(5))), (float(m.group(6)), float(m.group(7)))
    return a, None, (float(m.group(4)), float(m.group(5)))

def nearest_body(p):
    best, bd = None, 6.0
    for k, v in planets.items():
        d = math.hypot(v["x"] - p[0], v["y"] - p[1])
        if d < bd:
            bd, best = d, k
    return best

routes = []
for p in paths:
    pd = parse_d(p["d"])
    r = None
    if pd:
        f, t = nearest_body(pd[0]), nearest_body(pd[2])
        if f and t:
            r = (f, t)
    routes.append(r)

def dist_pts(x, y, pts):
    return min(math.hypot(q[0] - x, q[1] - y) for q in pts)

def ships(n):
    return {s["sid"]: s for s in frames[n]["data"]["ships"] if s.get("sid")}

S = {n: ships(n) for n in frames}

out = []
def w(s=""):
    out.append(str(s))

w("build=%s cam=%s" % (base["build"], json.dumps(base["cam"])))
w("маршруты нарисованных трасс флота: %s" % routes)
w("")
w("%-9s %-24s %7s %8s %8s %8s %8s %6s %8s %8s" % ("sid", "title", "dpx600", "км/с", "c", "px45", "dOwn", "мед", "ближ.трасса", "планета"))
rows = []
for sid, s in sorted(S["z0"].items()):
    if not sid.startswith("fleet-"):
        continue
    a, b = S["z0"][sid], S["z600"][sid]
    dpx = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
    v = dpx * 149600000.0 / 185.0 / 600
    c = v / 299792.458
    px45 = dpx * 45 / 600
    own = None
    if s.get("from") and s.get("to"):
        want = (s["from"], s["to"])
        for i, r in enumerate(routes):
            if r and (r == want or r == (want[1], want[0])):
                own = dist_pts(s["x"], s["y"], paths[i]["pts"])
                break
    dany = min(dist_pts(s["x"], s["y"], p["pts"]) for p in paths)
    pl = min((math.hypot(s["x"] - v2["x"], s["y"] - v2["y"]), k) for k, v2 in planets.items())
    # медиана шага 60 c
    steps = []
    series = ["z0", "z60", "z120", "z180", "z240", "z300"]
    for i in range(5):
        p1, p2 = S[series[i]].get(sid), S[series[i + 1]].get(sid)
        steps.append(math.hypot(p2["x"] - p1["x"], p2["y"] - p1["y"]))
    steps_sorted = sorted(steps)
    med = steps_sorted[len(steps_sorted) // 2]
    rows.append(dict(sid=sid, title=s["title"], dpx=dpx, v=v, c=c, px45=px45, own=own, dany=dany,
                     planet=pl[1], planetD=pl[0], med=med, steps=steps))
    w("%-9s %-24s %7.1f %8.0f %8.3f %8.2f %8s %6.1f %8.1f %8.1f" % (
        sid, s["title"][:24], dpx, v, c, px45,
        ("%.1f" % own) if own is not None else "-", med, dany, pl[0]))
w("")
w("макс c = %.3f (%.0f км/с); макс px45 = %.2f; шаг 60 c: мин %.1f / мед %.1f / макс %.1f px" % (
    max(r["c"] for r in rows), max(r["v"] for r in rows), max(r["px45"] for r in rows),
    min(min(r["steps"]) for r in rows), min(r["med"] for r in rows), max(max(r["steps"]) for r in rows)))
w("dOwn: %s" % ", ".join("%s=%.1f" % (r["sid"], r["own"]) for r in rows if r["own"] is not None))
w("до ЛЮБОЙ трассы: %s" % ", ".join("%s=%.1f" % (r["sid"], r["dany"]) for r in rows))
w("до планеты: %s" % ", ".join("%s=%.1f(%s)" % (r["sid"], r["planetD"], r["planet"]) for r in rows))
w("прошли порог: %d из %d" % (sum(1 for r in rows if r["c"] <= 0.95 and r["px45"] <= 1.0), len(rows)))

# торговцы контроль
tr = []
for sid, s in S["z0"].items():
    if not sid.startswith("trade-"):
        continue
    a, b = S["z0"][sid], S["z600"][sid]
    dpx = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
    v = dpx * 149600000.0 / 185.0 / 600
    tr.append((v, v / 299792.458, dpx * 45 / 600, sid))
w("")
w("ТОРГОВЦЫ: N=%d, макс %.0f км/с = %.3f c, макс px45 %.2f, прошли %d" % (
    len(tr), max(t[0] for t in tr), max(t[1] for t in tr), max(t[2] for t in tr),
    sum(1 for t in tr if t[0] / 299792.458 <= 0.95 and t[2] <= 1.0)))

open(os.path.join(R, "_fleet4.txt"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
