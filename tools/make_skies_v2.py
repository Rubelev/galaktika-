"""Небо планет и лун: день и ночь, по данным миссий и моделям атмосфер.

Основа — не «красиво», а что реально видно:
  * Марс, день: охристо-персиковое небо, у Солнца — голубоватое свечение
    (пыль рассеивает короткие волны вперёд). Закат — голубой ореол.
  * Марс, ночь: почти чёрное небо, звёзды, Фобос и Деймос, слабое свечение пыли.
  * Луна: небо чёрное и днём (нет атмосферы), Солнце — резкий диск,
    Земля в небе видна днём как голубой серп.
  * Венера: непрозрачная жёлтая облачность, Солнца не видно, света мало.
  * Титан: оранжевая дымка, Солнце — тусклый диск сквозь смог, Сатурн в небе.
  * Ио: серно-жёлтая дымка от вулканов, Юпитер диском 19°.
  * Европа: чёрное небо, Юпитер 12°, полярные сияния от Юпитера.
  * Энцелад: чёрное небо, Сатурн с кольцами дугой, гейзеры на горизонте.

    python tools/make_skies_v2.py            # всё
    python tools/make_skies_v2.py mars-day   # выборочно
"""
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "deploy-host", "site", "images", "skies")
W, H = 1024, 512


def rng(seed):
    return np.random.default_rng(abs(hash(seed)) % 1_000_000)


def lerp3(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def value_noise(r, h, w, scale, octaves=4, persistence=0.5):
    """Периодический по долготе фрактальный шум."""
    total = np.zeros((h, w))
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        gh = max(2, int(h / (scale / (2 ** o))))
        gw = max(2, int(w / (scale / (2 ** o))))
        g = r.random((gh, gw))
        g = np.vstack([g, g[:1]])
        g = np.hstack([g, g[:, :1]])
        ys = np.linspace(0, gh, h, endpoint=False)
        xs = np.linspace(0, gw, w, endpoint=False)
        y0 = np.floor(ys).astype(int)
        x0 = np.floor(xs).astype(int)
        fy = (ys - y0)[:, None]
        fx = (xs - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        a = g[y0][:, x0]
        b = g[y0][:, x0 + 1]
        c = g[y0 + 1][:, x0]
        d = g[y0 + 1][:, x0 + 1]
        top = a * (1 - fx) + b * fx
        bot = c * (1 - fx) + d * fx
        total += (top * (1 - fy) + bot * fy) * amp
        norm += amp
        amp *= persistence
    return total / norm


def base_gradient(zenith, horizon, expo=1.5):
    alt = 1 - np.arange(H)[:, None] / (H - 1)
    t = np.clip(alt, 0, 1) ** expo
    rgb = np.zeros((H, W, 3), dtype=float)
    for c in range(3):
        rgb[:, :, c] = horizon[c] + (zenith[c] - horizon[c]) * t
    return rgb


def add_stars(rgb, r, count=1400, milky=False):
    n = count
    sx = r.integers(0, W, n)
    sy = r.integers(0, H, n)
    br = r.random(n) ** 2.4 * 0.95 + 0.12
    for i in range(n):
        y = sy[i]
        if y > H * 0.9:
            continue
        rgb[y, sx[i]] += br[i] * 210
    if milky:
        # Млечный Путь: широкая полоса из слабых точек
        band = r.normal(H * 0.42, H * 0.09, 4000)
        xs = r.integers(0, W, 4000)
        for x, y in zip(xs, band):
            yi = int(max(0, min(H - 1, y)))
            rgb[yi, x] += 26 + r.random() * 22
    return rgb


def add_disc(rgb, cx, cy, radius, color, soft=1.4, glow=0.0):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    body = np.clip((radius - d) / soft, 0, 1)
    col = np.array(color, dtype=float)
    rgb[:] = rgb * (1 - body[:, :, None]) + col * body[:, :, None]
    if glow > 0:
        g = np.exp(-(d / (radius * 2.6 + 10)) ** 2) * glow
        rgb += g[:, :, None] * col
    return body


def add_clouds(rgb, r, strength=0.45, tint=(250, 250, 255), horizon_bias=1.25):
    cl = np.zeros((H, W))
    for sc, wt in ((60, 0.55), (26, 0.3), (10, 0.15)):
        gw, gh = max(2, W // sc), max(2, H // sc)
        g = r.random((gh + 1, gw + 1))
        ys = np.linspace(0, gh, H, endpoint=False)
        xs = np.linspace(0, gw, W, endpoint=False)
        y0 = np.floor(ys).astype(int)
        x0 = np.floor(xs).astype(int)
        fy = (ys - y0)[:, None]
        fx = (xs - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        a = g[y0][:, x0]
        b = g[y0][:, np.minimum(x0 + 1, gw)]
        c = g[np.minimum(y0 + 1, gh)][:, x0]
        d = g[np.minimum(y0 + 1, gh)][:, np.minimum(x0 + 1, gw)]
        top = a * (1 - fx) + b * fx
        bot = c * (1 - fx) + d * fx
        cl += (top * (1 - fy) + bot * fy) * wt
    cl = np.clip((cl - 0.5) * 3.0, 0, 1) * strength
    alt = 1 - np.arange(H)[:, None] / (H - 1)
    cl *= np.clip(1.6 - alt * horizon_bias, 0, 1)
    arr = np.array(tint, dtype=float)
    rgb[:] = rgb * (1 - cl[:, :, None]) + arr * cl[:, :, None]
    return rgb


def add_rings_arc(rgb, cx, cy, inner, outer, tilt=0.18, brightness=0.55):
    """Кольца Сатурна в небе — наклонная дуга из полос."""
    yy, xx = np.mgrid[0:H, 0:W]
    dx = xx - cx
    dy = (yy - cy) / max(0.05, tilt)
    dist = np.sqrt(dx * dx + dy * dy)
    ring = ((dist > inner) & (dist < outer)).astype(float)
    # деление Кассини
    gap = 1 - np.exp(-((dist - (inner + (outer - inner) * 0.62)) / 3.0) ** 2)
    band = 0.55 + 0.45 * np.sin(dist * 0.35)
    ring = ring * band * gap * brightness
    rgb += ring[:, :, None] * np.array([232, 220, 196])
    return rgb


def body(name, r):
    """Возвращает RGB-массив неба по имени мира и режиму день/ночь."""
    night = name.endswith("-night")
    key = name.replace("-night", "").replace("-day", "")

    if key == "mars":
        if night:
            rgb = base_gradient((6, 7, 12), (22, 16, 16), 1.6)
            rgb = add_stars(rgb, r, 1500)
            add_disc(rgb, int(W * 0.30), int(H * 0.28), 5, (198, 168, 140), 1.4)   # Фобос
            add_disc(rgb, int(W * 0.52), int(H * 0.20), 2, (176, 156, 140), 1.0)   # Деймос
            return rgb
        # день: пыльная атмосфера, охристо-персиковое небо
        rgb = base_gradient((150, 112, 82), (208, 162, 116), 1.25)
        add_disc(rgb, int(W * 0.72), int(H * 0.30), 2, (255, 250, 236), 1.0)
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.sqrt((xx - W * 0.72) ** 2 + (yy - H * 0.30) ** 2)
        blue = np.exp(-(d / 55) ** 2) * 0.75          # голубой ореол у Солнца
        rgb += blue[:, :, None] * np.array([104, 138, 196])
        rgb = add_clouds(rgb, r, 0.12, (232, 200, 164), 0.8)     # лёгкая пыль
        # пыльные вихри: несколько спиральных завихрений
        yy2, xx2 = np.mgrid[0:H, 0:W]
        for _ in range(7):
            cx = r.random() * W
            cy = H * (0.45 + r.random() * 0.45)
            hgt = 30 + r.random() * 70
            wide = 6 + r.random() * 10
            spir = np.zeros((H, W))
            for k in range(3):
                phase = k * 2.1
                xs3 = cx + np.sin((yy2 - cy) / hgt * 6 + phase) * wide
                spir += np.exp(-((xx2 - xs3) / 2.2) ** 2) * np.exp(-((yy2 - cy) / hgt) ** 2)
            rgb += (spir * 0.10)[:, :, None] * np.array([236, 206, 170])
        return rgb

    if key == "moon":
        rgb = base_gradient((3, 4, 8), (10, 10, 14), 1.4)
        rgb = add_stars(rgb, r, 1600, milky=True)
        if not night:
            add_disc(rgb, int(W * 0.72), int(H * 0.26), 4, (255, 252, 240), 1.0, glow=0.35)
            add_disc(rgb, int(W * 0.28), int(H * 0.22), 7, (86, 140, 200), 1.2)   # Земля
        else:
            add_disc(rgb, int(W * 0.28), int(H * 0.22), 7, (46, 74, 110), 1.2)   # пепельный свет
        return rgb

    if key == "venus":
        if night:
            rgb = base_gradient((58, 44, 26), (82, 62, 38), 1.3)
        else:
            rgb = base_gradient((206, 182, 124), (236, 218, 168), 1.05)
            rgb = add_clouds(rgb, r, 0.18, (246, 234, 196), 0.7)
        # Солнца не видно — только общее свечение
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.sqrt((xx - W * 0.7) ** 2 + (yy - H * 0.3) ** 2)
        rgb += (np.exp(-(d / 200) ** 2) * (0.05 if night else 0.16))[:, :, None] * np.array([255, 240, 200])
        return rgb

    if key == "mercury":
        rgb = base_gradient((3, 4, 7), (9, 9, 13), 1.5)
        rgb = add_stars(rgb, r, 1700, milky=True)
        if not night:
            add_disc(rgb, int(W * 0.68), int(H * 0.28), 3, (255, 253, 246), 0.8, glow=0.8)
        return rgb

    if key == "titan":
        if night:
            rgb = base_gradient((16, 10, 6), (34, 22, 12), 1.4)
            add_disc(rgb, int(W * 0.26), int(H * 0.24), 12, (188, 168, 132), 1.6)
            return rgb
        rgb = base_gradient((186, 128, 62), (222, 174, 106), 1.2)
        rgb = add_clouds(rgb, r, 0.28, (236, 196, 132), 0.9)
        add_disc(rgb, int(W * 0.70), int(H * 0.28), 2, (255, 226, 170), 1.0, glow=0.18)
        add_disc(rgb, int(W * 0.26), int(H * 0.24), 12, (206, 186, 148), 1.8)   # Сатурн
        return rgb

    if key == "io":
        rgb = base_gradient((54, 44, 22), (112, 92, 44), 1.3)
        rgb = add_clouds(rgb, r, 0.3, (198, 170, 96), 0.9)
        add_disc(rgb, int(W * 0.30), int(H * 0.22), 26, (216, 186, 136), 2.0)   # Юпитер 19°
        add_disc(rgb, int(W * 0.74), int(H * 0.30), 2, (255, 240, 200), 1.0)
        # серные шлейфы на горизонте
        yy, xx = np.mgrid[0:H, 0:W]
        plume = np.exp(-((yy - H * 0.93) / 18.0) ** 2) * 0.35
        rgb += plume[:, :, None] * np.array([210, 180, 90])
        return rgb

    if key == "europa":
        rgb = base_gradient((4, 6, 12), (12, 16, 24), 1.5)
        rgb = add_stars(rgb, r, 1500)
        add_disc(rgb, int(W * 0.30), int(H * 0.22), 18, (206, 186, 150), 1.8)  # Юпитер 12°
        # полярное сияние от Юпитера — слабые дуги
        yy, xx = np.mgrid[0:H, 0:W]
        aur = np.zeros((H, W))
        for k in range(2):
            yc = H * (0.36 + 0.12 * k)
            aur += np.exp(-((yy - yc) / 26.0) ** 2) * (0.055 - 0.015 * k)
        aur *= 0.6 + 0.4 * np.sin(xx / 140.0) ** 2
        rgb += aur[:, :, None] * np.array([70, 170, 130])
        return rgb

    if key == "ganymede":
        rgb = base_gradient((4, 5, 10), (10, 12, 18), 1.5)
        rgb = add_stars(rgb, r, 1400)
        add_disc(rgb, int(W * 0.30), int(H * 0.22), 13, (200, 182, 150), 1.8)
        return rgb

    if key == "callisto":
        rgb = base_gradient((3, 4, 8), (9, 10, 14), 1.5)
        rgb = add_stars(rgb, r, 1300)
        add_disc(rgb, int(W * 0.30), int(H * 0.22), 8, (186, 170, 146), 1.6)
        return rgb

    if key == "enceladus":
        rgb = base_gradient((3, 4, 9), (10, 12, 18), 1.5)
        rgb = add_stars(rgb, r, 1500)
        rgb = add_rings_arc(rgb, W * 0.30, H * 0.24, 24, 88, tilt=0.26, brightness=0.75)
        add_disc(rgb, int(W * 0.30), int(H * 0.24), 22, (226, 214, 178), 1.8)  # Сатурн
        # гейзеры: белые столбы у горизонта
        yy, xx = np.mgrid[0:H, 0:W]
        for gx in (140, 320, 780):
            widen = 8 + (H * 0.92 - yy) * 0.10
            plume = np.exp(-((xx - gx) / np.maximum(6, widen)) ** 2) *                     np.exp(-((yy - H * 0.86) / 55.0) ** 2) * 0.55
            rgb += plume[:, :, None] * np.array([238, 243, 248])
        return rgb

    if key == "triton":
        rgb = base_gradient((4, 5, 12), (12, 14, 22), 1.5)
        rgb = add_stars(rgb, r, 1300)
        add_disc(rgb, int(W * 0.30), int(H * 0.23), 20, (120, 160, 214), 1.8)   # Нептун 14°
        return rgb

    if key == "phobos":
        rgb = base_gradient((6, 6, 9), (24, 16, 14), 1.4)
        add_disc(rgb, int(W * 0.34), int(H * 0.30), 62, (198, 116, 82), 2.0)    # Марс 42°
        yy, xx = np.mgrid[0:H, 0:W]
        mr = np.sqrt((xx - W * 0.34) ** 2 + (yy - H * 0.30) ** 2)
        inside = (mr < 60).astype(float)
        blot = value_noise(r, H, W, 40, 4)
        blot = np.clip((blot - 0.5) * 2.2, 0, 1) * inside * 0.18
        rgb *= (1 - blot[:, :, None])
        cap = np.exp(-((yy - (H * 0.30 - 52)) / 8.0) ** 2) * inside
        rgb = rgb * (1 - cap[:, :, None] * 0.5) + np.array([240, 240, 236]) * cap[:, :, None] * 0.5
        add_disc(rgb, int(W * 0.76), int(H * 0.26), 2, (255, 244, 226), 1.0)
        return rgb

    if key == "earth":
        if night:
            rgb = base_gradient((6, 10, 22), (16, 22, 36), 1.4)
            rgb = add_stars(rgb, r, 700)
            return rgb
        rgb = base_gradient((54, 108, 190), (156, 198, 236), 1.35)
        rgb = add_clouds(rgb, r, 0.42, (250, 250, 255), 1.1)
        add_disc(rgb, int(W * 0.72), int(H * 0.28), 5, (255, 252, 238), 1.0, glow=0.25)
        return rgb

    # запасной вариант — нейтральные сумерки
    rgb = base_gradient((10, 12, 20), (30, 34, 44), 1.5)
    return add_stars(rgb, r, 900)


def main(argv):
    names = argv[1:] or [
        "mars-day", "mars-night", "moon-day", "moon-night",
        "venus-day", "venus-night", "mercury-day", "mercury-night",
        "titan-day", "titan-night", "io-day", "europa-day",
        "ganymede-day", "callisto-day", "enceladus-day", "triton-day",
        "phobos-day", "earth-day", "earth-night",
    ]
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name in names:
        r = rng(name)
        rgb = body(name, r)
        rgb += (r.random((H, W, 1)) - 0.5) * 2.5      # против бандинга
        img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")
        path = os.path.join(OUT, name + ".webp")
        img.save(path, "WEBP", quality=84, method=6)
        total += os.path.getsize(path)
        print("  %-16s %5.1f КБ" % (name, os.path.getsize(path) / 1024))
    print("всего: %d файлов, %.2f МБ" % (len(names), total / 1024 / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
