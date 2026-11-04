# -*- coding: utf-8 -*-
import json, os, math
from PIL import Image

R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
d = json.load(open(os.path.join(R, "_3d.json"), encoding="utf-8"))
BG = (7, 11, 18)

def px_at(im, x, y):
    w, h = im.size
    x = max(0, min(w - 1, int(x))); y = max(0, min(h - 1, int(y)))
    return im.getpixel((x, y))

def bright(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

def region_bbox(im, cx, cy, half):
    w, h = im.size
    x0, x1 = max(0, int(cx - half)), min(w, int(cx + half))
    y0, y1 = max(0, int(cy - half)), min(h, int(cy + half))
    pts = []
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            c = im.getpixel((x, y))
            if abs(c[0] - BG[0]) > 18 or abs(c[1] - BG[1]) > 18 or abs(c[2] - BG[2]) > 22:
                pts.append((x, y))
    if not pts:
        return None
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys), len(pts))

rows = []
out = []
def w(s=""):
    out.append(str(s))

for rec in d:
    v = rec["view"]; data = rec["data"]
    png = os.path.join(R, rec["png"])
    im = Image.open(png).convert("RGB")
    # 1) орбиты
    devs = [p["devOrbit"] for p in data["planets"] if p.get("devOrbit") is not None]
    devS = [p["devScreen"] for p in data["planets"] if p.get("devScreen") is not None]
    maxOrbit = max(devs) if devs else None
    maxScreen = max(devS) if devS else None
    # 2) перекрытия / кто сверху
    overlaps = data["overlaps"]
    covered = [pid for pid, top in data["tops"].items() if pid != "sun" and top != pid]
    sunTop = data["tops"].get("sun")
    # 3) луны
    moons = data["moons"]
    moonMax = max((m["dist"] for m in moons), default=0)
    moonFar = [m for m in moons if m["dist"] > 60]
    # 4) корабли
    ships = data["ships"]
    # 5) масштаб планет: доля планеты от радиуса орбиты на экране
    ratios = []
    for p in data["planets"]:
        if p.get("orbitR") and data["cam"].get("scale"):
            rPx = (p["r"]["w"] / 2) / (p["orbitR"] * data["cam"]["scale"])
            ratios.append((p["id"], round(rPx, 3), p["r"]["w"]))
    maxRatio = max((x[1] for x in ratios), default=0)
    # 6) Солнце: угловые пиксели рамки
    sun = data.get("sun")
    sunCorner = None
    if sun and sun["w"] > 2:
        cxc, cyc = sun["cx"], sun["cy"]
        half = min(sun["w"], sun["h"]) / 2
        cs = []
        for dx, dy in ((-0.75, -0.75), (0.75, -0.75), (-0.75, 0.75), (0.75, 0.75)):
            c = px_at(im, cxc + dx * half, cyc + dy * half)
            cs.append(round(bright(c), 1))
        center = px_at(im, cxc, cyc)
        sunCorner = {"corners": cs, "center": round(bright(center), 1)}
    # 7) Сатурн: bbox вокруг (кольца)
    sat = next((p for p in data["planets"] if p["id"] == "saturn"), None)
    satBox = None
    if sat:
        b = region_bbox(im, sat["r"]["cx"], sat["r"]["cy"], max(60, sat["r"]["w"] * 2.2))
        if b:
            satBox = {"w": b[2] - b[0], "h": b[3] - b[1], "aspect": round((b[2] - b[0]) / max(1, (b[3] - b[1])), 2), "n": b[4]}
    # 8) планеты не исчезли: центр не фон
    vanished = [p["id"] for p in data["planets"] if bright(px_at(im, p["r"]["cx"], p["r"]["cy"])) < 16]
    rows.append(dict(group=v["group"], tilt=v["tilt"], spin=v["spin"], zoom=v["zoom"], png=rec["png"],
                     maxOrbit=maxOrbit, maxScreen=maxScreen, overlaps=len(overlaps), covered=covered, sunTop=sunTop,
                     moonMax=moonMax, moonFar=len(moonFar), shipsOff=ships["offscreen"], shipsVis=ships["visible"],
                     maxRatio=maxRatio, sunCorner=sunCorner, satBox=satBox, vanished=vanished))
    os.makedirs(os.path.join(R, "_3d_eval"), exist_ok=True)
    json.dump(rows, open(os.path.join(R, "_3d_eval.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

out.append("| Ракурс (tilt/spin/zoom) | Орбиты ≤6px | Перекрытия | Кольца (aspect) | Луны | Корабли | Солнце | Подписи | Артефакты | Вердикт |")
out.append("|---|---|---|---|---|---|---|---|---|---|")
for r in rows:
    orb = "%.3f" % r["maxOrbit"] if r["maxOrbit"] is not None else "—"
    ov = "%d (%d закрыто)" % (r["overlaps"], len(r["covered"]))
    ring = "%.2f" % r["satBox"]["aspect"] if r["satBox"] else "—"
    moons = "макс %.0f px, далеко %d" % (r["moonMax"], r["moonFar"])
    ships = "вне кадра %d из %d" % (r["shipsOff"], r["shipsVis"])
    sun = ("углы %s / центр %s" % (r["sunCorner"]["corners"], r["sunCorner"]["center"])) if r["sunCorner"] else "—"
    labels = "—"
    art = "планет нет в кадре: %d" % len(r["vanished"]) if r["vanished"] else "—"
    bad = []
    if r["maxOrbit"] is not None and r["maxOrbit"] > 6: bad.append("орбиты")
    if r["covered"]: bad.append("перекрытие")
    if r["moonFar"]: bad.append("луны")
    if r["shipsOff"]: bad.append("корабли")
    verdict = "ок" if not bad else "дефект: " + ", ".join(bad)
    out.append("| %d/%d/%s | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
        r["tilt"], r["spin"], r["zoom"], orb, ov, ring, moons, ships, sun, labels, art, verdict))
out.append("")
out.append(json.dumps({"maxOrbit": max((r["maxOrbit"] or 0) for r in rows), "maxScreen": max((r["maxScreen"] or 0) for r in rows),
                       "views": len(rows)}, ensure_ascii=False))
open(os.path.join(R, "_3d_table.md"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
