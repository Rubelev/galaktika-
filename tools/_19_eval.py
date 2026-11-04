# -*- coding: utf-8 -*-
import json, os, statistics
from PIL import Image, ImageChops

R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
d = json.load(open(os.path.join(R, "_19.json"), encoding="utf-8"))
titles = {}
try:
    titles = json.load(open(os.path.join(R, "_19_titles.json"), encoding="utf-8"))
except Exception:
    pass

def analyze(p):
    im = Image.open(p).convert("RGB")
    w, h = im.size
    px = im.load()
    # небо: полоса выше горизонта
    sky = [px[x, y] for y in range(120, 180, 3) for x in range(80, 380, 5)]
    sr = sum(c[0] for c in sky) / len(sky); sg = sum(c[1] for c in sky) / len(sky); sb = sum(c[2] for c in sky) / len(sky)
    def skyish(c, tol=25):
        return abs(c[0] - sr) < tol and abs(c[1] - sg) < tol and abs(c[2] - sb) < tol
    # горизонт по колонкам
    horizons = []
    for x in range(0, w, 10):
        for y in range(60, h - 1, 2):
            c = px[x, y]
            if not skyish(c, 35):
                horizons.append(y); break
        else:
            horizons.append(h)
    horizon = int(statistics.median(horizons)) if horizons else h
    # поверхность ниже горизонта
    surf = 0; holes = 0; dark = 0
    for y in range(horizon + 2, h, 2):
        for x in range(0, w, 2):
            c = px[x, y]
            surf += 1
            if skyish(c, 25): holes += 1
            if c[0] < 15 and c[1] < 15 and c[2] < 18: dark += 1
    return { "horizon": horizon, "horizon_ratio": round(horizon / h, 3),
             "surface_px": surf, "holes_pct": round(100 * holes / max(1, surf), 2),
             "dark_pct": round(100 * dark / max(1, surf), 2), "sky": [round(sr), round(sg), round(sb)] }

rows = []
for rec in d:
    a = os.path.join(R, rec["a"]); b = os.path.join(R, rec["b"])
    st = analyze(a)
    flick = None
    if os.path.exists(b):
        ia = Image.open(a).convert("RGB"); ib = Image.open(b).convert("RGB")
        diff = ImageChops.difference(ia, ib); p1 = diff.load(); w, h = diff.size
        n = 0; tot = 0
        for y in range(0, h, 4):
            for x in range(0, w, 4):
                tot += 1
                if max(p1[x, y]) > 25: n += 1
        flick = round(100 * n / max(1, tot), 2)
    rows.append(dict(id=rec["id"], name=rec["name"], cls=rec["cls"], parent=rec["parent"], pv=rec["state"]["pv"], canv=rec["state"]["canv"],
                     **st, flicker=flick, a=rec["a"]))
    json.dump(rows, open(os.path.join(R, "_19_eval.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

rows_sorted = sorted(rows, key=lambda r: r["holes_pct"], reverse=True)
out = []
out.append("| Тело | Класс | Дырки, % | Разрывы | Небо | Мерцание, % | Постройки | Вердикт |")
out.append("|---|---|---|---|---|---|---|---|")
for r in rows_sorted:
    holes = r["holes_pct"]
    verdict = "ок" if holes <= 2 else "дефект"
    out.append("| %s | %s | %.2f | %s | %s | %s | %s | %s |" % (
        r["id"], r["cls"], holes,
        "звёзд нет" if r["dark_pct"] < 1 else "тёмных %.1f%%" % r["dark_pct"],
        "ок" if r["horizon_ratio"] < 0.75 else "мало неба (%.0f%%)" % (100 * r["horizon_ratio"]),
        ("%.2f" % r["flicker"]) if r["flicker"] is not None else "—",
        "нижние %.0f%%" % (100 * (1 - r["horizon_ratio"])),
        verdict))
open(os.path.join(R, "_19_table.md"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
print()
print("тел:", len(rows), "с дырками >2%:", sum(1 for r in rows if r["holes_pct"] > 2))
print("худшие:", [(r["id"], r["holes_pct"]) for r in rows_sorted[:6]])
