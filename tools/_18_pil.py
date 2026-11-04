# -*- coding: utf-8 -*-
import json, os
from PIL import Image
R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
BG = (7, 11, 18)
for name in ["_18_probe.png", "3d18-0-0.png", "3d18-45-20.png", "3d18-85-0.png"]:
    p = os.path.join(R, name)
    if not os.path.exists(p):
        print(name, "нет файла"); continue
    im = Image.open(p).convert("RGB")
    w, h = im.size
    # ищем Солнце: самый яркий компактный кластер в центре
    px = im.load()
    best = None
    for y in range(h // 3, 2 * h // 3, 2):
        for x in range(w // 3, 2 * w // 3, 2):
            r, g, b = px[x, y]
            if r > 240 and g > 160 and b < 120:
                best = (x, y) if best is None else best
    if not best:
        print(name, "Солнце не найдено"); continue
    cx, cy = best
    # прямоугольник свечения: идём от центра до фона
    def edge(dx, dy):
        x, y = cx, cy
        while 0 <= x < w and 0 <= y < h:
            c = px[int(x), int(y)]
            if abs(c[0] - BG[0]) < 8 and abs(c[1] - BG[1]) < 8 and abs(c[2] - BG[2]) < 10:
                break
            x += dx; y += dy
        return (x, y)
    right = edge(1, 0); left = edge(-1, 0); up = edge(0, -1); down = edge(0, 1)
    bw = right[0] - left[0]; bh = down[1] - up[1]
    def bright(c): return 0.299*c[0] + 0.587*c[1] + 0.114*c[2]
    half = min(bw, bh) / 2
    corners = []
    for sx, sy in ((-0.75, -0.75), (0.75, -0.75), (-0.75, 0.75), (0.75, 0.75)):
        x = int(cx + sx * half); y = int(cy + sy * half)
        if 0 <= x < w and 0 <= y < h:
            corners.append(round(bright(px[x, y]), 1))
    print("%-16s size=%dx%d glow=%dx%d center=(%d,%d) corners=%s center_bright=%.1f" % (name, w, h, bw, bh, cx, cy, corners, bright(px[cx, cy])))
