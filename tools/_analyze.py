import json, math, os, sys, glob

ROOT = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika"
R = os.path.join(ROOT, "reports")
KM_PER_PX = 149600000.0 / 185.0
C = 299792.458


def load(name):
    p = os.path.join(R, "_snap_%s.json" % name)
    return json.load(open(p, encoding="utf-8"))


def idx_ships(snap):
    return {s["sid"] or ("?" + s["title"] + str(i)): s for i, s in enumerate(snap["data"]["ships"])}


out = []
def w(s=""):
    out.append(str(s))


base = load("base")
d0 = base["data"]
w("=== BASE snapshot ===")
w("title=%s build=%s now=%s" % (d0["title"], d0["build"], d0["now"]))
w("cam=%s" % json.dumps(d0["cam"]))
w("counts=%s" % json.dumps(d0["counts"], ensure_ascii=False))
w("viewport=%s" % d0["viewport"])
w("bodyClass=%s" % d0["bodyClass"])
w("sceneStyle=%s" % d0["sceneStyle"])
w("")
w("=== QA REPORT (встроенный чекер) ===")
try:
    qa = json.loads(d0["qaReport"])
    for r in qa["results"]:
        w(("OK   " if r["ok"] else "FAIL ") + r["name"] + "  :: " + r["detail"])
    w("ok=%s" % qa["ok"])
except Exception as e:
    w("qa parse error %s" % e)
w("")

w("=== SHIPS (base) ===")
w("%-24s %-9s %5s %8s %8s %7s %8s %7s %s" % ("sid", "layer", "role", "x", "y", "ang", "dLine", "opac", "title"))
for s in d0["ships"]:
    w("%-24s %-9s %5s %8s %8s %7s %8s %7s %s" % (
        s["sid"], s["layer"], s["role"], s["x"], s["y"], s["ang"],
        ("%.1f" % s["dLine"]) if s.get("dLine") is not None else "-",
        s["opacity"], (s["title"] or "")[:50]))
w("")

w("=== PLANETS (base): DOM vs WorldCoords ===")
w("%-9s %8s %8s %10s %10s %8s" % ("id", "dom_cx", "dom_cy", "pred_x", "pred_y", "delta"))
for p in d0["planets"]:
    pr = p["screenPred"]
    if pr:
        dx = p["r"]["cx"] - pr["x"]; dy = p["r"]["cy"] - pr["y"]
        w("%-9s %8.1f %8.1f %10.2f %10.2f %8.2f" % (p["id"], p["r"]["cx"], p["r"]["cy"], pr["x"], pr["y"], math.hypot(dx, dy)))
    else:
        w("%-9s %8.1f %8.1f  no-wc" % (p["id"], p["r"]["cx"], p["r"]["cy"]))
w("")

w("=== PATHS (base) ===")
for k, v in d0["paths"].items():
    w("%s: %d" % (k, len(v)))
    for p in v:
        w("   i=%d len=%.1f pts=%d display=%s vis=%s op=%s cls=%s d=%s" % (
            p["i"], p["len"], len(p["pts"]), p["display"], p["visibility"], p["opacity"], p.get("cls"), (p["d"] or "")[:60]))
w("")

# ---- speed between base and other snapshots ----
def compare(na, nb, dt):
    A = load(na); B = load(nb)
    ia = idx_ships(A); ib = idx_ships(B)
    rows = []
    common = [k for k in ia if k in ib]
    for k in common:
        a = ia[k]; b = ib[k]
        if a["x"] is None or b["x"] is None:
            continue
        dpx = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
        km = dpx * KM_PER_PX
        v = km / dt
        rows.append(dict(sid=k, layer=a["layer"], title=a["title"], dpx=dpx, v=v, c=v / C,
                         px45=dpx * 45.0 / dt, dline=a.get("dLine")))
    rows.sort(key=lambda r: -r["v"])
    return rows, A, B

for (na, nb, dt, label) in [("base", "f600", 600, "Δt=600"), ("base", "f60", 60, "Δt=60")]:
    rows, A, B = compare(na, nb, dt)
    w("=== SPEED %s (%s -> %s) ===" % (label, na, nb))
    w("%-22s %9s %14s %10s %10s %s" % ("sid", "dpx", "km/s", "c", "px/45s", "title"))
    for r in rows:
        w("%-22s %9.2f %14.0f %10.4f %10.2f %s" % (r["sid"], r["dpx"], r["v"], r["c"], r["px45"], r["title"][:44]))
    over = [r for r in rows if r["px45"] > 1.0]
    overC = [r for r in rows if r["c"] > 0.95]
    w("N=%d  >1px/45s: %d   >0.95c: %d   max_v=%.0f km/s (%.3f c)" % (
        len(rows), len(over), len(overC), rows[0]["v"] if rows else 0, rows[0]["c"] if rows else 0))
    w("")

open(os.path.join(R, "_analysis1.txt"), "w", encoding="utf-8").write("\n".join(out))
print("written", len(out), "lines")
