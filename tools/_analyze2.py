import json, math, os, statistics

ROOT = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika"
R = os.path.join(ROOT, "reports")
KM_PER_PX = 149600000.0 / 185.0
C = 299792.458
AU_PX = 185.0

frames_raw = json.load(open(os.path.join(R, "_frames.json"), encoding="utf-8"))
frames = {}
order = []
for f in frames_raw:
    name = f["cfg"]["name"]
    frames[name] = f
    order.append(name)

out = []
def w(s=""):
    out.append(str(s))

base = frames["z0"]["data"]
w("=== FRAMES ===")
for n in order:
    d = frames[n]["data"]
    w("%-12s freeze=%-8s now=%-15s cam=%s viewport=%s build=%s title=%s" % (
        n, frames[n]["cfg"]["freeze"], d["now"], json.dumps(d["cam"]), d["viewport"], d["build"], d["title"]))
w("")
w("=== COUNTS (base frame) ===")
w(json.dumps(base["counts"], ensure_ascii=False))
w("bodyClass=%s" % base["bodyClass"])
w("")
w("=== QA (РІСЃС‚СЂРѕРµРЅРЅС‹Р№ С‡РµРєРµСЂ, РєР°РґСЂ f100000) ===")
try:
    qa = json.loads(base["qaReport"])
    for r in qa["results"]:
        w(("OK   " if r["ok"] else "FAIL ") + r["name"] + " :: " + r["detail"])
    w("РРўРћР“ ok=%s" % qa["ok"])
except Exception as e:
    w("qa parse error: %s" % e)
w("")

# ---------- РєР°СЂС‚С‹ ----------
def ships(d):
    m = {}
    for s in d["ships"]:
        key = s["sid"] or ("nosid:" + (s["title"] or "")[:40])
        m[key] = s
    return m

S = {n: ships(frames[n]["data"]) for n in order}

# ---------- 1. СЃРєРѕСЂРѕСЃС‚СЊ ----------
def speed_table(na, nb, dt, title):
    A, B = S[na], S[nb]
    rows = []
    for sid in A:
        if sid not in B: continue
        a, b = A[sid], B[sid]
        if a["x"] is None or b["x"] is None: continue
        dpx = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
        v = dpx * KM_PER_PX / dt
        rows.append(dict(sid=sid, layer=a["layer"], title=a["title"], dpx=dpx, v=v, c=v / C,
                         px45=dpx * 45.0 / dt, angA=a["ang"], angB=b["ang"],
                         x0=a["x"], y0=a["y"], x1=b["x"], y1=b["y"],
                         dOwn=a.get("dOwn"), dLine=a.get("dLine"), moving=a.get("moving")))
    rows.sort(key=lambda r: -r["v"])
    w("=== РЎРљРћР РћРЎРўР¬ %s (О”t=%d РёРіСЂРѕРІС‹С… СЃ) ===" % (title, dt))
    w("%-22s %-6s %8s %12s %8s %9s %7s %s" % ("sid", "СЃР»РѕР№", "dpx", "РєРј/СЃ", "c", "px/45c", "РЅР° Р»РёРЅРёРё", "title"))
    for r in rows:
        w("%-22s %-6s %8.2f %12.0f %8.4f %9.3f %7s %s" % (
            r["sid"], r["layer"], r["dpx"], r["v"], r["c"], r["px45"],
            ("%.1f" % r["dOwn"]) if r["dOwn"] is not None else "-", (r["title"] or "")[:46]))
    over45 = [r for r in rows if r["px45"] > 1.0]
    overC = [r for r in rows if r["c"] > 0.95]
    w("N=%d | >1px/45c: %d | >0.95c: %d | max %.0f РєРј/СЃ (%.3f c, %.2f px/45c)" % (
        len(rows), len(over45), len(overC), rows[0]["v"], rows[0]["c"], rows[0]["px45"]))
    w("")
    return rows

rows600 = speed_table("z0", "z600", 600, "100000в†’100600")
rows60 = speed_table("z0", "z60", 60, "100000в†’100060")

# ---------- 2. СЃРµСЂРёСЏ 5 С€Р°РіРѕРІ РїРѕ 60 СЃ: СЃРєР°С‡РєРё ----------
series = ["z0", "z60", "z120", "z180", "z240", "z300"]
w("=== РЎРљРђР§РљР: СЃРµСЂРёСЏ 6 РєР°РґСЂРѕРІ СЃ С€Р°РіРѕРј 60 РёРіСЂРѕРІС‹С… СЃ ===")
w("%-22s %-6s %s" % ("sid", "СЃР»РѕР№", "С€Р°РіРё(px) 0-1..4-5 | РјРµРґРёР°РЅР° | max/РјРµРґРёР°РЅР°"))
jump_rows = []
for sid in S[series[0]]:
    a0 = S[series[0]].get(sid)
    if not a0 or a0["x"] is None: continue
    steps = []
    ok = True
    for i in range(len(series) - 1):
        a, b = S[series[i]].get(sid), S[series[i + 1]].get(sid)
        if not a or not b or a["x"] is None or b["x"] is None: ok = False; break
        steps.append(math.hypot(b["x"] - a["x"], b["y"] - a["y"]))
    if not ok or len(steps) < 5: continue
    med = statistics.median(steps)
    mx = max(steps)
    ratio = mx / med if med > 0 else float("inf")
    jump_rows.append(dict(sid=sid, layer=a0["layer"], title=a0["title"], steps=steps, med=med, mx=mx, ratio=ratio))
jump_rows.sort(key=lambda r: -r["mx"])
for r in jump_rows:
    flag = "  <-- РЎРљРђР§РћРљ" if r["ratio"] > 3 and r["mx"] > 5 else ""
    w("%-22s %-6s %s | %6.1f | %5.1f%s" % (r["sid"], r["layer"],
      " ".join("%6.1f" % s for s in r["steps"]), r["med"], r["ratio"], flag))
w("")

# ---------- 3. СЂР°СЃСЃС‚РѕСЏРЅРёРµ РґРѕ СЃРІРѕРµР№ Р»РёРЅРёРё ----------
w("=== Р РђРЎРЎРўРћРЇРќРР• Р”Рћ РЎР’РћР•Р™ РўР РђРЎРЎР« (РєР°РґСЂ f100000, scene px) ===")
w("%-22s %-6s %8s %8s %8s %6s %s" % ("sid", "СЃР»РѕР№", "dOwn", "dLine", "dLinePath", "moving", "title"))
line_rows = []
for sid, s in S["z0"].items():
    if s["x"] is None: continue
    line_rows.append(s)
line_rows.sort(key=lambda s: -(s.get("dOwn") or s.get("dLine") or -1))
for s in line_rows:
    w("%-22s %-6s %8s %8s %8s %6s %s" % (
        s["sid"], s["layer"],
        ("%.2f" % s["dOwn"]) if s.get("dOwn") is not None else "-",
        ("%.2f" % s["dLine"]) if s.get("dLine") is not None else "-",
        s.get("dLinePath"), s.get("moving") or "-", (s["title"] or "")[:44]))
w("")

# ---------- 4. РєСѓСЂСЃ ----------
w("=== РљРЈР РЎ: СѓРіРѕР» РјР°СЂРєРµСЂР° vs РІРµРєС‚РѕСЂ РґРІРёР¶РµРЅРёСЏ (О”t=60 СЃ, С‚РѕР»СЊРєРѕ СЃРјРµС‰РµРЅРёРµ > 2 px) ===")
w("%-22s %-6s %8s %8s %8s %s" % ("sid", "СЃР»РѕР№", "ang", "course", "delta", "title"))
head_rows = []
A, B = S["z0"], S["z60"]
for sid in A:
    if sid not in B: continue
    a, b = A[sid], B[sid]
    if a["x"] is None or b["x"] is None or a["ang"] is None: continue
    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
    dpx = math.hypot(dx, dy)
    if dpx < 2: continue
    course = math.atan2(dy, dx) * 180 / math.pi + 90
    delta = (a["ang"] - course + 540) % 360 - 180
    head_rows.append(dict(sid=sid, layer=a["layer"], title=a["title"], ang=a["ang"], course=course, delta=delta, dpx=dpx))
head_rows.sort(key=lambda r: -abs(r["delta"]))
for r in head_rows:
    w("%-22s %-6s %8.1f %8.1f %8.1f %s%s" % (r["sid"], r["layer"], r["ang"], r["course"], r["delta"],
      (r["title"] or "")[:44], "  <-- >20В°" if abs(r["delta"]) > 20 else ""))
w("")

# ---------- 5. NaN ----------
w("=== NaN/Infinity ===")
bad = [s for s in base["ships"] if s.get("nan") or s["x"] is None or s["y"] is None]
w("Р±РѕСЂС‚Р° СЃ NaN/Infinity/РїСѓСЃС‚РѕР№ РїРѕР·РёС†РёРµР№: %d" % len(bad))
for s in bad:
    w("  %s | %s | x=%s y=%s" % (s["sid"], s["title"][:40], s["x"], s["y"]))
w("")

# ---------- 6. РїР»Р°РЅРµС‚С‹ ----------
w("=== РџР›РђРќР•РўР«: DOM vs WorldCoords (f100000, screen px) ===")
w("%-9s %8s %8s %8s %8s %8s" % ("id", "dom_cx", "dom_cy", "pred_x", "pred_y", "delta"))
maxdp = 0
for p in base["planets"]:
    if p["pred"]:
        d = math.hypot(p["r"]["cx"] - p["pred"]["x"], p["r"]["cy"] - p["pred"]["y"])
        maxdp = max(maxdp, d)
        w("%-9s %8.1f %8.1f %8.2f %8.2f %8.3f" % (p["id"], p["r"]["cx"], p["r"]["cy"], p["pred"]["x"], p["pred"]["y"], d))
    else:
        w("%-9s %8.1f %8.1f      РЅРµС‚ WorldCoords (РЅРµС‚ orbital elements)" % (p["id"], p["r"]["cx"], p["r"]["cy"]))
w("РјР°РєСЃ СЂР°СЃС…РѕР¶РґРµРЅРёРµ: %.3f px" % maxdp)
w("")

# ---------- 7. РЅР°РєР»РѕРЅ ----------
for tname, bname in [("zt45a", "z0"), ("zt85a", "z0")]:
    if tname not in frames: continue
    d = frames[tname]["data"]
    w("=== РќРђРљР›РћРќ %s: cam=%s applied=%s ===" % (tname, json.dumps(d["cam"]), json.dumps(frames[tname].get("tiltApplied"))))
    onscreen = [p for p in d["planets"] if p["inView"]]
    w("РїР»Р°РЅРµС‚С‹ РІ РєР°РґСЂРµ: %d/%d %s" % (len(onscreen), len(d["planets"]), [p["id"] for p in d["planets"] if not p["inView"]]))
    mship = [s for s in d["ships"] if s["r"]["cx"] > -20 and s["r"]["cy"] > -20 and s["r"]["cx"] < d["viewport"][0] + 20 and s["r"]["cy"] < d["viewport"][1] + 20]
    w("Р±РѕСЂС‚Р° РІ РєР°РґСЂРµ: %d/%d" % (len(mship), len(d["ships"])))
    w("Р»СѓРЅС‹ РІ РєР°РґСЂРµ: %d/%d" % (len([m for m in d["moons"] if m["inView"]]), len(d["moons"])))
    w("РїРѕСЂС‚Р°Р» РІ РєР°РґСЂРµ: %s" % (d["portal"]["inView"] if d["portal"] else "РЅРµС‚"))
    # С„РёР·РёРєР° РЅРµ РёР·РјРµРЅРёР»Р°СЃСЊ: СЃСЂР°РІРЅРёРј scene-РєРѕРѕСЂРґРёРЅР°С‚С‹ РїСЂРё С‚РѕРј Р¶Рµ freeze
    if bname in frames:
        A, B = S[bname], tname
        Bs = ships(d)
        deltas = []
        for sid in A:
            if sid in Bs and A[sid]["x"] is not None and Bs[sid]["x"] is not None:
                deltas.append(math.hypot(A[sid]["x"] - Bs[sid]["x"], A[sid]["y"] - Bs[sid]["y"]))
        if deltas:
            w("СЂР°СЃС…РѕР¶РґРµРЅРёРµ scene-РєРѕРѕСЂРґРёРЅР°С‚ Р±РѕСЂС‚РѕРІ vs РїР»РѕСЃРєРёР№ РєР°РґСЂ: РјР°РєСЃ %.3f px, СЃСЂРµРґРЅ %.4f px (N=%d)" % (max(deltas), sum(deltas) / len(deltas), len(deltas)))
    w("")

# РЅР°РєР»РѕРЅ: СЃРєРѕСЂРѕСЃС‚СЊ РЅР° РґРІСѓС… РєР°РґСЂР°С…
if "zt45a" in frames and "zt45b" in frames:
    A2 = ships(frames["zt45a"]["data"]); B2 = ships(frames["zt45b"]["data"])
    rows = []
    for sid in A2:
        if sid not in B2: continue
        a, b = A2[sid], B2[sid]
        if a["x"] is None or b["x"] is None: continue
        dpx = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
        rows.append((dpx * KM_PER_PX / 600, sid, dpx))
    rows.sort(reverse=True)
    w("=== РќРђРљР›РћРќ 45В°/20В°: СЃРєРѕСЂРѕСЃС‚СЊ 100000в†’100600 ===")
    for v, sid, dpx in rows[:10]:
        w("  %-22s %8.1f px  %10.0f РєРј/СЃ  %.3f c" % (sid, dpx, v, v / C))
    w("N=%d, max %.3f c" % (len(rows), rows[0][0] / C if rows else 0))
    w("")

open(os.path.join(R, "_analysis2.txt"), "w", encoding="utf-8").write("\n".join(out))
print("ok", len(out))

