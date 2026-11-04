"""Изометрический рендер вокселей на Python — проверка, годится ли для наших кубических картинок.

Без three.js, без браузера: numpy + Pillow, алгоритм художника (дальние блоки рисуются первыми).
"""
import math
import time

import numpy as np
from PIL import Image, ImageDraw


def render(blocks, size=(900, 640), tile=6.0, bg=(8, 14, 20)):
    """blocks: список (x, y, z, (r, g, b)) — рисует изометрию и возвращает PIL.Image."""
    im = Image.new("RGB", size, bg)
    dr = ImageDraw.Draw(im)
    cx, cy = size[0] / 2, size[1] * 0.62

    # сортировка: сначала дальние (x+y+z меньше — дальше), потом ближние
    blocks = sorted(blocks, key=lambda b: (b[0] + b[1] + b[2]))

    w = tile
    h = tile * 0.5
    for x, y, z, c in blocks:
        px = cx + (x - z) * w
        py = cy + (x + z) * h - y * tile
        top = [(px, py - tile * 0.55), (px + w, py), (px, py + tile * 0.55), (px - w, py)]
        left = [(px - w, py), (px, py + h), (px, py + h + tile), (px - w, py + tile)]
        right = [(px + w, py), (px, py + h), (px, py + h + tile), (px + w, py + tile)]
        r, g, b = c
        dr.polygon(left, fill=(int(r * 0.62), int(g * 0.62), int(b * 0.62)))
        dr.polygon(right, fill=(int(r * 0.80), int(g * 0.80), int(b * 0.80)))
        dr.polygon(top, fill=(min(255, int(r * 1.12)), min(255, int(g * 1.12)), min(255, int(b * 1.12))))
    return im


def planet_blocks(size=150, radius=34, hills=1.0, colors=((79, 122, 58), (91, 138, 66), (185, 168, 120))):
    """Повторяет buildTerrain из planetview.js — считает и возвращает блоки планеты."""
    out = []
    start = -size // 2
    for x in range(start, start + size):
        for z in range(start, start + size):
            d = math.hypot(x, z)
            if d > size * 0.62:
                continue
            n = (math.sin(x * 0.12) * math.cos(z * 0.11) * 2.2
                 + math.sin(x * 0.31 + 1.7) * math.cos(z * 0.27 + 0.6) * 1.1
                 + math.sin((x + z) * 0.07) * 1.6)
            h = round(n * hills + max(0, (radius - d) * 0.02))
            c = colors[1] if h > 4 else (colors[0] if h >= 1 else colors[2])
            out.append((x, h, z, c))
    return out


if __name__ == "__main__":
    t0 = time.time()
    blocks = planet_blocks()
    t1 = time.time()
    img = render(blocks, size=(760, 520), tile=2.2)
    t2 = time.time()
    img.save("python-voxel-planet.png")
    print(f"блоков: {len(blocks)}")
    print(f"генерация: {t1 - t0:.2f} с · рендер: {t2 - t1:.2f} с · всего: {t2 - t0:.2f} с")
