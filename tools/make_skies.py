"""Небо для каждой планеты и луны: панорама 360×180.

Считает по физике атмосферы:
  * толщина и цвет зависят от давления и состава;
  * Солнце маленькое на дальних мирах (угловой размер = 0,53° / расстояние в а.е.);
  * звёзды видны только там, где нет плотной атмосферы;
  * у лун в небе висит хозяин-гигант с правильным угловым размером.

Выход: images/skies/<мир>.webp (1024×512), вес 8–25 КБ.
    python tools/make_skies.py                # все миры
    python tools/make_skies.py earth mars     # выборочно
"""
import math
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "deploy-host", "site", "images", "skies")
W, H = 1024, 512

# мир: (зенит, горизонт, дымка, звёзды, размер Солнца в градусах, хозяин в небе, его размер в градусах)
SKIES = {
    "mercury": ((6, 8, 14), (26, 24, 26), (40, 36, 34), True, 0.68, None, 0),
    "venus":   ((214, 186, 120), (240, 214, 150), (250, 228, 170), False, 0.36, None, 0),
    "earth":   ((54, 108, 190), (150, 196, 236), (196, 220, 244), False, 0.53, None, 0),
    "moon":    ((4, 5, 9), (12, 12, 16), (24, 22, 22), True, 0.53, "earth", 2.4),
    "mars":    ((86, 62, 52), (206, 156, 116), (232, 186, 146), False, 0.35, None, 0),
    "phobos":  ((4, 4, 8), (10, 10, 14), (18, 16, 16), True, 0.30, "mars", 42.0),
    "deimos":  ((4, 4, 8), (10, 10, 14), (18, 16, 16), True, 0.30, "mars", 16.0),
    "ceres":   ((4, 4, 8), (9, 9, 13), (16, 15, 15), True, 0.28, None, 0),
    "jupiter": ((150, 176, 208), (214, 222, 230), (232, 236, 240), False, 0.20, None, 0),
    "io":      ((18, 14, 8), (48, 34, 16), (70, 48, 20), False, 0.19, "jupiter", 19.0),
    "europa":  ((6, 10, 16), (16, 24, 32), (26, 34, 42), True, 0.19, "jupiter", 12.0),
    "ganymede": ((6, 8, 14), (14, 18, 24), (24, 26, 30), True, 0.19, "jupiter", 9.0),
    "callisto": ((5, 6, 10), (12, 14, 18), (20, 20, 22), True, 0.19, "jupiter", 6.0),
    "saturn":  ((186, 190, 176), (226, 224, 196), (238, 234, 208), False, 0.15, None, 0),
    "titan":   ((150, 108, 52), (198, 152, 78), (214, 172, 96), False, 0.15, "saturn", 11.0),
    "enceladus": ((5, 8, 12), (12, 18, 22), (20, 26, 30), True, 0.15, "saturn", 12.0),
    "uranus":  ((130, 186, 200), (186, 220, 226), (206, 232, 234), False, 0.11, None, 0),
    "titania": ((4, 5, 9), (10, 11, 16), (16, 16, 20), True, 0.11, "uranus", 5.0),
    "neptune": ((40, 78, 158), (96, 140, 208), (130, 172, 220), False, 0.09, None, 0),
    "triton":  ((5, 6, 12), (12, 14, 20), (18, 18, 22), True, 0.09, "neptune", 14.0),
    "kepler1": ((58, 96, 92), (140, 176, 164), (176, 200, 188), False, 0.5, None, 0),
    "mimas":   ((4, 4, 8), (9, 9, 13), (16, 15, 15), True, 0.15, "saturn", 19.0),
    "tethys":  ((4, 4, 8), (9, 9, 13), (16, 15, 15), True, 0.15, "saturn", 14.0),
    "dione":   ((4, 4, 8), (9, 9, 13), (16, 15, 15), True, 0.15, "saturn", 9.0),
    "rhea":    ((4, 4, 8), (9, 9, 13), (16, 15, 15), True, 0.15, "saturn", 7.0),
    "iapetus": ((4, 4, 8), (9, 9, 13), (16, 15, 15), True, 0.15, "saturn", 5.0),
    "miranda": ((4, 5, 9), (10, 11, 16), (16, 16, 20), True, 0.11, "uranus", 8.0),
    "ariel":   ((4, 5, 9), (10, 11, 16), (16, 16, 20), True, 0.11, "uranus", 6.0),
    "umbriel": ((4, 5, 9), (10, 11, 16), (16, 16, 20), True, 0.11, "uranus", 4.5),
    "oberon":  ((4, 5, 9), (10, 11, 16), (16, 16, 20), True, 0.11, "uranus", 4.0),
    "proteus": ((5, 6, 12), (12, 14, 20), (18, 18, 22), True, 0.09, "neptune", 8.0),
    "nereid":  ((5, 6, 12), (12, 14, 20), (18, 18, 22), True, 0.09, "neptune", 3.0),
    "charon":  ((4, 4, 8), (10, 10, 14), (16, 16, 18), True, 0.25, "pluto", 24.0),
    "pluto":   ((6, 6, 10), (14, 13, 15), (22, 20, 20), True, 0.25, None, 0),
}

# цвет хозяина в небе
HOST_COLOR = {
    "earth": (86, 140, 200), "mars": (196, 108, 74), "jupiter": (214, 186, 140),
    "saturn": (226, 208, 168), "uranus": (168, 216, 220), "neptune": (90, 130, 200),
    "pluto": (176, 156, 138)
}


def rng_for(name):
    return np.random.default_rng(abs(hash(name)) % 100000)


def make(name):
    zenith, horizon, haze, stars, sun_deg, host, host_deg = SKIES[name]
    rng = rng_for(name)
    ys = np.arange(H)[:, None]
    xs = np.arange(W)[None, :]

    # вертикальный градиент: зенит → горизонт
    alt = 1 - ys / (H - 1)                 # 1 вверху, 0 внизу
    t = np.clip(alt, 0, 1)[:, :] ** 1.5
    rgb = np.zeros((H, W, 3), dtype=float)
    for c in range(3):
        rgb[:, :, c] = horizon[c] + (zenith[c] - horizon[c]) * t

    # дымка у горизонта
    haze_w = np.clip(1 - alt * 2.6, 0, 1) ** 1.4
    for c in range(3):
        rgb[:, :, c] = rgb[:, :, c] * (1 - haze_w * 0.55) + haze[c] * haze_w * 0.55

    # звёзды (только без атмосферы)
    if stars:
        n = 1200
        sx = rng.integers(0, W, n)
        sy = rng.integers(0, H, n)
        br = rng.random(n) ** 2 * 0.9 + 0.1
        for i in range(n):
            y0 = sy[i]
            if y0 > H * 0.86:
                continue
            rgb[y0, sx[i]] += br[i] * 200
            if br[i] > 0.8 and y0 + 1 < H:
                rgb[y0 + 1, sx[i]] += br[i] * 60

    # Солнце: угловой размер в градусах → радиус в пикселях (по ширине 360°)
    sun_r = max(1, int(sun_deg / 360 * W / 2))
    sun_x = int(W * 0.72)
    sun_y = int(H * 0.30)
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt((xx - sun_x) ** 2 + (yy - sun_y) ** 2)
    disc = (d <= sun_r).astype(float)
    glow = np.exp(-(d / (sun_r * 6 + 8)) ** 2) * 0.85
    rgb += disc[:, :, None] * np.array([255, 250, 236])
    rgb += glow[:, :, None] * np.array([255, 240, 200]) * (0.35 if not stars else 0.12)

    # хозяин в небе у лун
    if host and host_deg > 0:
        hr = max(2, int(host_deg / 360 * W / 2))
        hx = int(W * 0.30)
        hy = int(H * 0.22)
        d2 = np.sqrt((xx - hx) ** 2 + (yy - hy) ** 2)
        hc = np.array(HOST_COLOR.get(host, (200, 200, 200)), dtype=float)
        body = np.clip((hr - d2) / max(1, hr * 0.25), 0, 1)
        # полосы у газовых гигантов
        if host in ("jupiter", "saturn"):
            bands = (np.sin((yy - hy) * 0.6) * 0.5 + 0.5) * 0.18
            hc = hc * (1 - bands[:, :, None]) + np.array([255, 245, 225]) * bands[:, :, None]
        hc = np.clip(hc * 1.25, 0, 255)
        rgb = rgb * (1 - body[:, :, None]) + hc * body[:, :, None]
        halo = np.exp(-((d2 - hr) / (hr * 0.5 + 3)) ** 2) * 0.18
        rgb += halo[:, :, None] * hc
        # тонкая тень с одной стороны
        shade = np.clip((d2 - hr * 0.2) / max(1, hr), 0, 1) * 0.25
        rgb *= (1 - shade[:, :, None])

    # облака: мягкие полосы у миров с плотной атмосферой
    if name in ("earth", "venus", "jupiter", "saturn", "titan", "neptune"):
        cl = np.zeros((H, W))
        for sc, wt in ((70, 0.55), (28, 0.3), (11, 0.15)):
            gw, gh = max(2, W // sc), max(2, H // sc)
            g = rng.random((gh + 1, gw + 1))
            ys2 = np.linspace(0, gh, H, endpoint=False)
            xs2 = np.linspace(0, gw, W, endpoint=False)
            y0 = np.floor(ys2).astype(int); x0 = np.floor(xs2).astype(int)
            fy = (ys2 - y0)[:, None]; fx = (xs2 - x0)[None, :]
            fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
            a = g[y0][:, x0]; b2 = g[y0][:, np.minimum(x0 + 1, gw)]
            c2 = g[np.minimum(y0 + 1, gh)][:, x0]; d2 = g[np.minimum(y0 + 1, gh)][:, np.minimum(x0 + 1, gw)]
            top = a * (1 - fx) + b2 * fx
            bot = c2 * (1 - fx) + d2 * fx
            cl += (top * (1 - fy) + bot * fy) * wt
        cl = np.clip((cl - 0.52) * 3.2, 0, 1) * (0.75 if name == "earth" else 0.45)
        cl *= np.clip(1 - alt * 1.25, 0, 1)           # облака ближе к горизонту
        cloud_c = np.array([250, 250, 255]) if name == "earth" else np.array([255, 238, 200])
        rgb = rgb * (1 - cl[:, :, None]) + cloud_c * cl[:, :, None]

    # спутники Марса в его небе
    if name == "mars":
        for (mx, my, mr, br) in ((int(W * 0.18), int(H * 0.34), 3, 0.75), (int(W * 0.30), int(H * 0.18), 2, 0.45)):
            dd = np.sqrt((xx - mx) ** 2 + (yy - my) ** 2)
            disc2 = np.clip((mr - dd) / 1.2, 0, 1) * br
            rgb = rgb * (1 - disc2[:, :, None]) + np.array([220, 210, 200]) * disc2[:, :, None]

    # лёгкая зернистость, чтобы не было бандинга
    rgb += (rng.random((H, W, 1)) - 0.5) * 3
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def main(argv):
    wanted = argv[1:] or list(SKIES)
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    total = 0
    for name in wanted:
        if name not in SKIES:
            print("нет мира:", name)
            continue
        img = make(name)
        path = os.path.join(OUT, name + ".webp")
        img.save(path, "WEBP", quality=85, method=6)
        total += os.path.getsize(path)
        print("  %-10s %5.1f КБ" % (name, os.path.getsize(path) / 1024))
    print("готово: %d небес за %.2f с, %.2f МБ" % (len(wanted), time.time() - t0, total / 1024 / 1024))
    print("папка:", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
