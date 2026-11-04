# -*- coding: utf-8 -*-
import json, math, os, re, statistics

ROOT = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika"
R = os.path.join(ROOT, "reports")
KM_PER_PX = 149600000.0 / 185.0
C = 299792.458

frames = {f["cfg"]["name"]: f for f in json.load(open(os.path.join(R, "_frames.json"), encoding="utf-8"))}
base = frames["z0"]["data"]
planets = {p["id"]: p["wc"] for p in base["planets"] if p.get("wc")}

def ships(n):
    return {s["sid"] or s["title"]: s for s in frames[n]["data"]["ships"]}

S = {n: ships(n) for n in frames}

out = []
def w(s=""):
    out.append(str(s))

# ---------- маршруты ----------
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

routes = {}
for layer in ("fleet", "trade"):
    routes[layer] = []
    for p in base["paths"][layer]:
        pd = parse_d(p["d"])
        r = None
        if pd:
            f, t = nearest_body(pd[0]), nearest_body(pd[2])
            if f and t:
                r = (f, t)
        routes[layer].append(r)

def dist_pts(x, y, pts):
    return min(math.hypot(q[0] - x, q[1] - y) for q in pts)

# ---------- тип агента ----------
def kind_of(s):
    sid = s["sid"] or ""
    t = s.get("title") or ""
    if sid.startswith("fleet-"): return "флот"
    if sid.startswith("portal-"): return "портальный рейс"
    if sid.startswith("trade-"): return "торговец"
    if sid.startswith("belt-"): return "рудный транспорт"
    if sid.startswith("pirate-"): return "пират"
    if sid.startswith("civil-"):
        if t.startswith("газовый"): return "газовый танкер"
        if t.startswith("снабжение"): return "снабжение колоний"
        if t.startswith("лунная"): return "лунная линия"
        return "гражданский прочий"
    return "прочее"

TYPES = ["флот", "торговец", "портальный рейс", "снабжение колоний", "газовый танкер",
         "рудный транспорт", "пират", "лунная линия"]

# ---------- расстояния до линии ----------
line = {}
for sid, s in S["z0"].items():
    if s["x"] is None:
        continue
    own = None
    if s.get("from") and s.get("to"):
        want = (s["from"], s["to"])
        for i, r in enumerate(routes[s["layer"]]):
            if r and (r == want or r == (want[1], want[0])):
                own = dist_pts(s["x"], s["y"], base["paths"][s["layer"]][i]["pts"])
                break
    line[sid] = own

w("=== МАРШРУТЫ ТРАСС ===")
for layer in ("fleet", "trade"):
    w("%s: %s" % (layer, ", ".join("%d:%s" % (i, routes[layer][i]) for i in range(len(routes[layer])))))
w("")

w("=== РАССТОЯНИЕ ДО СВОЕЙ ТРАССЫ (scene px, порог 12) ===")
rows = sorted(((line[k], k, S["z0"][k]["title"]) for k in line if line[k] is not None), reverse=True)
for d, sid, title in rows:
    w("  %-24s %7.2f px  %s" % (sid, d, title[:46]))
w("")

# ---------- скорости ----------
def measure(na, nb, dt):
    A, B = S[na], S[nb]
    res = []
    for sid in A:
        if sid not in B: continue
        a, b = A[sid], B[sid]
        if a["x"] is None or b["x"] is None: continue
        dpx = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
        v = dpx * KM_PER_PX / dt
        course = math.atan2(b["y"] - a["y"], b["x"] - a["x"]) * 180 / math.pi + 90
        dh = None if a["ang"] is None else (a["ang"] - course + 540) % 360 - 180
        res.append(dict(sid=sid, k=kind_of(a), dpx=dpx, v=v, c=v / C, px45=dpx * 45 / dt, dh=dh,
                        title=a["title"], moving=a.get("moving")))
    return res

m600 = measure("z0", "z600", 600)
m60 = measure("z0", "z60", 60)

series = ["z0", "z60", "z120", "z180", "z240", "z300"]
steps = {}
for sid in S["z0"]:
    ss, ok = [], True
    for i in range(5):
        a, b = S[series[i]].get(sid), S[series[i + 1]].get(sid)
        if not a or not b or a["x"] is None or b["x"] is None:
            ok = False; break
        ss.append(math.hypot(b["x"] - a["x"], b["y"] - a["y"]))
    if ok and len(ss) == 5:
        steps[sid] = dict(steps=ss, med=statistics.median(ss), mx=max(ss), mn=min(ss))

# ---------- сводка ----------
w("=== СВОДКА ПО ТИПАМ ===")
w("%-20s %3s %9s %8s %8s %7s %7s %7s %7s %7s" % ("тип", "N", "макс км/с", "макс c", "px/45c", "скор", "скач", "линия", "курс", "итог"))
summ = {}
for t in TYPES:
    rs = [r for r in m600 if r["k"] == t]
    if not rs:
        continue
    ok_speed = [r for r in rs if r["c"] <= 0.95 and r["px45"] <= 1.0]
    js = [steps[r["sid"]] for r in rs if r["sid"] in steps]
    ok_jump = [r for r in rs if r["sid"] in steps and steps[r["sid"]]["mx"] <= 12]
    ls = [r for r in rs if line.get(r["sid"]) is not None]
    ok_line = [r for r in ls if line[r["sid"]] <= 12]
    hs = [r for r in rs if r["dh"] is not None and r["dpx"] > 2]
    ok_head = [r for r in hs if min(abs(r["dh"]), abs(180 - abs(r["dh"]))) <= 20]
    summ[t] = dict(N=len(rs), maxv=max(r["v"] for r in rs), maxc=max(r["c"] for r in rs),
                   max45=max(r["px45"] for r in rs), ok_speed=len(ok_speed), ok_jump=len(ok_jump),
                   nj=len(js), ok_line=len(ok_line), nl=len(ls), ok_head=len(ok_head), nh=len(hs),
                   maxstep=max(j["mx"] for j in js) if js else 0,
                   minstep=min(j["mn"] for j in js) if js else 0)
    w("%-20s %3d %9.0f %8.3f %8.2f %6d/%-2d %6d/%-2d %6d/%-2d %6d/%-2d" % (
        t, len(rs), summ[t]["maxv"], summ[t]["maxc"], summ[t]["max45"],
        summ[t]["ok_speed"], len(rs), summ[t]["ok_jump"], len(js),
        summ[t]["ok_line"], len(ls), summ[t]["ok_head"], len(hs)))
w("")
w("пояснение: скор = борта с c<=0.95 И <=1 px/45с; скач = борта без шага >12 px в серии из 5 шагов по 60 с;")
w("линия = dOwn<=12 px; курс = |угол маркера - курс| <= 20° (на Δt=600 с, только смещение > 2 px).")
w("")
w("=== ШАГИ ЗА 60 с (мин/медиана/макс по типу) ===")
for t in TYPES:
    if t not in summ or not summ[t]["nj"]: continue
    allsteps = []
    for r in m600:
        if r["k"] == t and r["sid"] in steps:
            allsteps += steps[r["sid"]]["steps"]
    w("  %-20s мин %6.1f  медиана %6.1f  макс %6.1f px" % (t, min(allsteps), statistics.median(allsteps), max(allsteps)))
w("")

w("=== ТОП-12 СКОРОСТЕЙ (Δt=600 с) ===")
for r in sorted(m600, key=lambda x: -x["v"])[:12]:
    w("  %-22s %-16s %8.2f px %9.0f км/с %7.3f c %8.2f px/45c" % (r["sid"], r["k"], r["dpx"], r["v"], r["c"], r["px45"]))
w("")
w("=== ТОП-12 СКОРОСТЕЙ (Δt=60 с) ===")
for r in sorted(m60, key=lambda x: -x["v"])[:12]:
    w("  %-22s %-16s %8.2f px %9.0f км/с %7.3f c %8.2f px/45c" % (r["sid"], r["k"], r["dpx"], r["v"], r["c"], r["px45"]))
w("")

w("=== СЛИПАНИЕ ФЛОТА (кадр z0) ===")
fl = [s for s in S["z0"].values() if (s["sid"] or "").startswith("fleet-") and s["x"] is not None]
pairs = []
for i in range(len(fl)):
    for j in range(i + 1, len(fl)):
        pairs.append((math.hypot(fl[i]["x"] - fl[j]["x"], fl[i]["y"] - fl[j]["y"]), fl[i]["sid"], fl[j]["sid"], fl[i]["title"]))
pairs.sort()
for p in pairs[:5]:
    w("  %6.2f px : %s / %s  (%s)" % (p[0], p[1], p[2], p[3][:40]))
w("")

w("=== КУРС ===")
for t in TYPES:
    rs = [r for r in m600 if r["k"] == t and r["dh"] is not None and r["dpx"] > 2]
    if not rs: continue
    bad = sorted(rs, key=lambda r: -min(abs(r["dh"]), abs(180 - abs(r["dh"]))) )
    w("  %-20s проверено %2d, вне 20°: %2d, макс %6.1f° (%s)" % (t, len(rs),
      sum(1 for r in rs if min(abs(r["dh"]), abs(180 - abs(r["dh"]))) > 20),
      min(abs(bad[0]["dh"]), abs(180 - abs(bad[0]["dh"]))), bad[0]["sid"]))
w("")

w("=== ПЛАНЕТЫ: DOM vs WorldCoords ===")
mx = 0
for p in base["planets"]:
    if p.get("pred"):
        mx = max(mx, math.hypot(p["r"]["cx"] - p["pred"]["x"], p["r"]["cy"] - p["pred"]["y"]))
w("  макс расхождение по 8 планетам с орбитальными элементами: %.3f px; pluto — без WorldCoords" % mx)
w("")

w("=== НАКЛОН ===")
for n in ("zt45a", "zt85a"):
    d = frames[n]["data"]
    w("  %s cam=%s планеты %d/%d в кадре, борта %d/%d, луны %d/%d, портал %s" % (
        n, json.dumps(d["cam"]),
        sum(1 for p in d["planets"] if p["inView"]), len(d["planets"]),
        sum(1 for s in d["ships"] if s["r"]["cx"] > -20 and s["r"]["cy"] > -20 and s["r"]["cx"] < d["viewport"][0] + 20 and s["r"]["cy"] < d["viewport"][1] + 20), len(d["ships"]),
        sum(1 for m in d["moons"] if m["inView"]), len(d["moons"]),
        d["portal"]["inView"] if d["portal"] else "-"))
A, B = S["z0"], S["zt45a"]
diffs = sorted(((math.hypot(A[k]["x"] - B[k]["x"], A[k]["y"] - B[k]["y"]), k) for k in A if k in B and A[k]["x"] is not None and B[k]["x"] is not None), reverse=True)
w("  scene-координаты z0 vs zt45a: различий >0.05 px: %d из %d, макс %.2f px (%s)" % (
    sum(1 for d, k in diffs if d > 0.05), len(diffs), diffs[0][0], diffs[0][1]))
w("  топ: " + ", ".join("%s=%.1f" % (k, d) for d, k in diffs[:4]))
w("")

w("=== NaN / отсутствие позиции ===")
w("  борта без позиции: %s" % ", ".join(s["sid"] for s in base["ships"] if s["x"] is None))
w("  NaN/Infinity в transform: %d" % sum(1 for s in base["ships"] if s.get("nan")))
w("  display:none: %d из %d" % (sum(1 for s in base["ships"] if s["display"] == "none"), len(base["ships"])))
w("")

# JSON для отчёта
json.dump({"summ": summ, "steps": {k: steps[k] for k in steps}, "line": line,
           "m600": m600, "dups": [[p[0], p[1], p[2], p[3]] for p in pairs[:5]]},
          open(os.path.join(R, "_metrics.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

open(os.path.join(R, "_analysis3.txt"), "w", encoding="utf-8").write("\n".join(out))
print("ok", len(out))
