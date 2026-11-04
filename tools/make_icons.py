"""Иконки построек из воксельных моделей — быстро, без браузера.

Читает models.json (общий источник с игрой) и рисует изометрию с прозрачным фоном.
Запуск:
    python tools/make_icons.py            # все модели, 128 и 256 px
    python tools/make_icons.py bolshoi    # только выбранные
"""
import json
import math
import os
import sys
import time

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "models.json")
OUT = os.path.join(ROOT, "deploy-host", "site", "images", "icons")
REVIEW = os.path.join(ROOT, "reports", "icons-sheet.png")

# тени граней: сверху светлее, слева темнее
TOP = 1.16
RIGHT = 0.82
LEFT = 0.58


def shade(color, k):
    r = min(255, int((color >> 16 & 255) * k))
    g = min(255, int((color >> 8 & 255) * k))
    b = min(255, int((color & 255) * k))
    return (r, g, b)


def render_model(model, size=128, margin=0.08):
    """Рисует модель изометрией с прозрачным фоном и точной подгонкой по габаритам."""
    flat = model["blocks"]
    palette = model["palette"]
    xs = flat[0::4]
    ys = flat[1::4]
    zs = flat[2::4]
    n = len(xs)

    # первый проход: габариты проекции в единичном масштабе (tile = 1)
    minx = miny = 1e9
    maxx = maxy = -1e9
    for i in range(n):
        px = (xs[i] - zs[i])
        py = (xs[i] + zs[i]) * 0.5 - ys[i]
        for dx, dy in ((-1, 0), (1, 0), (0, -0.55), (0, 0.55), (0, 1.55)):
            vx, vy = px + dx, py + dy
            minx, maxx = min(minx, vx), max(maxx, vx)
            miny, maxy = min(miny, vy), max(maxy, vy)

    bw = max(0.001, maxx - minx)
    bh = max(0.001, maxy - miny)
    tile = size * (1 - 2 * margin) / max(bw, bh)

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    # центрируем по габаритам
    offx = (size - bw * tile) / 2 - minx * tile
    offy = (size - bh * tile) / 2 - miny * tile

    order = sorted(range(n), key=lambda i: (xs[i] + ys[i] + zs[i]))
    w = tile
    h = tile * 0.5
    for i in order:
        x, y, z = xs[i], ys[i], zs[i]
        color = palette[flat[i * 4 + 3]]
        px = (x - z) * w + offx
        py = ((x + z) * 0.5 - y) * tile + offy
        top = [(px, py - tile * 0.55), (px + w, py), (px, py + tile * 0.55), (px - w, py)]
        left = [(px - w, py), (px, py + h), (px, py + h + tile), (px - w, py + tile)]
        right = [(px + w, py), (px, py + h), (px, py + h + tile), (px + w, py + tile)]
        dr.polygon(left, fill=shade(color, LEFT))
        dr.polygon(right, fill=shade(color, RIGHT))
        dr.polygon(top, fill=shade(color, TOP))
    return img


def main(argv):
    if not os.path.exists(MODELS):
        print("нет models.json — запусти: node tools/extract_models.js")
        return 1
    data = json.load(open(MODELS, encoding="utf-8"))
    models = data["models"]
    wanted = argv[1:] or list(models)
    os.makedirs(OUT, exist_ok=True)

    t0 = time.time()
    made = []
    for key in wanted:
        if key not in models:
            print("нет модели:", key)
            continue
        model = models[key]
        name = model["kind"] + ("" if model["variant"] == 1 else "_v%d" % model["variant"])
        for size in (128, 256):
            img = render_model(model, size=size)
            path = os.path.join(OUT, "%s_%d.png" % (name, size))
            img.save(path)
        made.append((name, model))
    dt = time.time() - t0
    print("иконок: %d моделей × 2 размера = %d файлов за %.2f с"
          % (len(made), len(made) * 2, dt))

    # контактный лист для проверки глазами
    if made:
        cols = 6
        cell = 150
        rows = math.ceil(len(made) / cols)
        sheet = Image.new("RGB", (cols * cell, rows * (cell + 18)), (12, 18, 24))
        dr = ImageDraw.Draw(sheet)
        for i, (name, model) in enumerate(made):
            icon = render_model(model, size=cell - 10)
            cx = (i % cols) * cell + 5
            cy = (i // cols) * (cell + 18) + 2
            sheet.paste(icon, (cx, cy), icon)
            dr.text((cx + 2, cy + cell - 12), name, fill=(160, 190, 215))
        os.makedirs(os.path.dirname(REVIEW), exist_ok=True)
        sheet.save(REVIEW)
        print("контактный лист:", REVIEW)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
