"""Процедурные текстуры планет — без скачивания картинок.

Каждый мир описывается параметрами: база, полосы, пятна, кратеры, полярные шапки.
Выход: images/tex-proc/<мир>.webp 1024×512 (равнопромежуточная развёртка).

    python tools/make_planet_textures.py            # все миры
    python tools/make_planet_textures.py earth mars # выборочно
"""
import math
import os
import sys
import time

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "deploy-host", "site", "images", "tex-proc")
W, H = 1024, 512

# мир: (база RGB, второй цвет, полосы, пятна, кратеры, шапки, контраст)
WORLDS = {
    "mercury": ((150, 146, 140), (110, 106, 100), 0.0, 0.6, 1.0, 0.0, 0.5),
    "venus":   ((226, 196, 140), (198, 164, 104), 0.5, 0.4, 0.0, 0.0, 0.4),
    "earth":   ((54, 100, 170), (72, 118, 62), 0.0, 0.7, 0.0, 0.9, 0.7),
    "moon":    ((168, 168, 164), (128, 128, 126), 0.0, 0.4, 1.0, 0.0, 0.45),
    "mars":    ((186, 108, 62), (146, 82, 48), 0.2, 0.5, 0.6, 0.5, 0.5),
    "phobos":  ((122, 116, 110), (88, 84, 78), 0.0, 0.6, 1.0, 0.0, 0.45),
    "deimos":  ((136, 128, 120), (100, 94, 88), 0.0, 0.5, 0.9, 0.0, 0.4),
    "ceres":   ((132, 128, 122), (100, 96, 92), 0.0, 0.5, 0.9, 0.0, 0.4),
    "jupiter": ((216, 196, 160), (168, 132, 96), 1.0, 0.5, 0.0, 0.0, 0.6),
    "io":      ((226, 208, 120), (200, 150, 60), 0.2, 0.8, 0.0, 0.0, 0.6),
    "europa":  ((222, 220, 210), (180, 170, 150), 0.3, 0.4, 0.1, 0.4, 0.4),
    "ganymede":((160, 150, 138), (118, 110, 100), 0.2, 0.6, 0.4, 0.2, 0.5),
    "callisto":((128, 118, 108), (92, 84, 78), 0.0, 0.5, 1.0, 0.0, 0.45),
    "saturn":  ((224, 204, 164), (188, 162, 116), 1.0, 0.4, 0.0, 0.0, 0.5),
    "titan":   ((206, 164, 96), (170, 130, 70), 0.6, 0.5, 0.0, 0.0, 0.5),
    "enceladus":((236, 238, 244), (200, 206, 214), 0.2, 0.3, 0.2, 0.6, 0.3),
    "uranus":  ((168, 216, 220), (140, 190, 198), 0.4, 0.2, 0.0, 0.2, 0.35),
    "titania": ((176, 172, 166), (132, 128, 124), 0.1, 0.5, 0.5, 0.1, 0.45),
    "neptune": ((90, 130, 200), (60, 96, 160), 0.5, 0.3, 0.0, 0.0, 0.4),
    "triton":  ((196, 200, 206), (150, 156, 164), 0.3, 0.4, 0.3, 0.3, 0.4),
    "kepler1": ((96, 150, 130), (70, 118, 100), 0.3, 0.6, 0.2, 0.2, 0.5),
    # луны без фото: процедурные
    "mimas":    ((196, 196, 196), (150, 150, 152), 0.0, 0.4, 1.0, 0.0, 0.45),
    "tethys":   ((226, 228, 230), (186, 188, 192), 0.0, 0.3, 0.9, 0.0, 0.35),
    "dione":    ((212, 212, 210), (168, 168, 168), 0.2, 0.4, 0.7, 0.0, 0.4),
    "rhea":     ((214, 214, 212), (170, 170, 170), 0.0, 0.4, 0.8, 0.0, 0.4),
    "iapetus":  ((150, 132, 112), (86, 78, 70), 0.0, 0.6, 0.6, 0.0, 0.6),
    "miranda":  ((182, 182, 182), (132, 132, 136), 0.1, 0.5, 0.5, 0.0, 0.45),
    "ariel":    ((206, 206, 208), (164, 164, 168), 0.1, 0.4, 0.5, 0.0, 0.4),
    "umbriel":  ((124, 122, 122), (88, 86, 88), 0.0, 0.4, 0.7, 0.0, 0.4),
    "oberon":   ((146, 138, 134), (104, 98, 96), 0.0, 0.5, 0.7, 0.0, 0.45),
    "proteus":  ((118, 116, 114), (84, 82, 82), 0.0, 0.6, 0.9, 0.0, 0.45),
    "nereid":   ((150, 148, 146), (110, 108, 108), 0.0, 0.5, 0.6, 0.0, 0.4),
    "charon":   ((156, 146, 142), (110, 100, 98), 0.1, 0.5, 0.6, 0.1, 0.45),
}


MARIA = {
    "moon": 0.75, "mars": 0.35, "mercury": 0.15, "callisto": 0.2,
    "ganymede": 0.3, "titania": 0.2, "oberon": 0.15, "charon": 0.25,
}


def noise2d(w, h, scale, rng, wrap_x=True):
    """Гладкий шум; по горизонтали замкнут (чтобы на сфере не было шва)."""
    gw, gh = max(2, w // scale), max(2, h // scale)
    grid = rng.random((gh + 1, gw))
    if wrap_x:
        grid = np.concatenate([grid, grid[:, :1]], axis=1)   # замыкаем по долготе
    ys = np.linspace(0, gh, h, endpoint=False)
    xs = np.linspace(0, gw, w, endpoint=False)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    g00 = grid[y0][:, x0]
    g10 = grid[y0][:, np.minimum(x0 + 1, gw)]
    g01 = grid[np.minimum(y0 + 1, gh)][:, x0]
    g11 = grid[np.minimum(y0 + 1, gh)][:, np.minimum(x0 + 1, gw)]
    top = g00 * (1 - fx) + g10 * fx
    bot = g01 * (1 - fx) + g11 * fx
    return top * (1 - fy) + bot * fy


def make(name, seed=None):
    base, second, bands, blot, craters, caps, contrast = WORLDS[name]
    rng = np.random.default_rng(seed if seed is not None else abs(hash(name)) % 100000)
    ys, xs = np.mgrid[0:H, 0:W]
    lat = (ys / H) * 2 - 1
    lon = xs / W

    # многослойный шум (все слои замкнуты по долготе)
    field = (noise2d(W, H, 96, rng) * 0.45 + noise2d(W, H, 32, rng) * 0.33
             + noise2d(W, H, 12, rng) * 0.16 + noise2d(W, H, 5, rng) * 0.06)

    if bands > 0.01:
        band = np.sin((lat * math.pi * (5 + bands * 5)) + field * 3.0)
        field = field * (1 - bands * 0.6) + (band * 0.5 + 0.5) * bands * 0.9

    if blot > 0.01:
        spots = noise2d(W, H, 180, rng) ** 1.6
        field = field * (1 - blot * 0.4) + spots * blot * 0.9

    field = np.clip((field - 0.5) * (1 + contrast * 2) + 0.5, 0, 1)

    a = np.array(base, dtype=float)
    b = np.array(second, dtype=float)
    rgb = a[None, None, :] * (1 - field[:, :, None]) + b[None, None, :] * field[:, :, None]

    # тёмные «моря» — крупные пятна (Луна, Марс)
    maria = MARIA.get(name, 0.0)
    if maria > 0.01:
        sea = np.zeros((H, W))
        for _ in range(7):
            mx, my = int(rng.integers(0, W)), int(rng.integers(60, H - 60))
            mr = int(rng.integers(70, 190))
            stretch = 0.55 + rng.random() * 0.5
            yy, xx = np.mgrid[0:H, 0:W]
            dx = (xx - mx) / (mr * stretch)
            dx = np.minimum(np.abs(dx), np.abs(dx - W / (mr * stretch)))
            dy = (yy - my) / mr
            dist = np.sqrt(dx * dx + dy * dy)
            sea = np.maximum(sea, np.clip(1.3 - dist, 0, 1) ** 0.8)
        sea = sea * maria
        dark = np.array([48, 48, 52], dtype=float)
        rgb = rgb * (1 - sea[:, :, None]) + dark[None, None, :] * sea[:, :, None]

    # рельеф: кратеры строим как поле высот, потом один раз затеняем
    if craters > 0.01:
        hfield = np.zeros((H, W))
        rims = np.zeros((H, W))
        n = int(1400 * craters)
        for _ in range(n):
            cx, cy = int(rng.integers(0, W)), int(rng.integers(0, H))
            if rng.random() < 0.93:
                r = int(rng.integers(2, 9))
            else:
                r = int(rng.integers(12, 40))
            for shift in (-W, 0, W):          # рисуем с переносом через край — без шва
                x0, x1 = cx + shift - r, cx + shift + r
                y0, y1 = max(0, cy - r), min(H, cy + r)
                if x1 <= 0 or x0 >= W:
                    continue
                tx0, tx1 = max(0, x0), min(W, x1)
                yy, xx = np.mgrid[y0:y1, tx0:tx1]
                d = np.sqrt((yy - cy) ** 2 + (xx - (cx + shift)) ** 2) / r
                bowl = np.clip(1 - d * d, 0, 1) * -0.55
                rim = np.exp(-((d - 1.0) ** 2) / 0.02) * 0.30
                sub_h = hfield[y0:y1, tx0:tx1]
                hfield[y0:y1, tx0:tx1] = np.minimum(sub_h, bowl)
                rims[y0:y1, tx0:tx1] = np.maximum(rims[y0:y1, tx0:tx1], rim)
        relief = hfield + rims
        # мелкая сыпь
        relief += (noise2d(W, H, 3, rng) - 0.5) * 0.18
        # альбедо: склоны светлее, дно темнее
        albedo = 1.0 + relief * 0.55 * craters
        rgb = rgb * albedo[:, :, None]

    if caps > 0.01:
        cap = np.clip((np.abs(lat) - 0.72) / 0.28, 0, 1) ** 1.6 * caps
        white = np.array([236, 240, 246], dtype=float)
        rgb = rgb * (1 - cap[:, :, None]) + white[None, None, :] * cap[:, :, None]

    grain = (rng.random((H, W)) - 0.5) * 7
    rgb = np.clip(rgb + grain[:, :, None], 0, 255).astype(np.uint8)
    return Image.fromarray(rgb, "RGB")


def main(argv):
    wanted = argv[1:] or list(WORLDS)
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    total = 0
    for name in wanted:
        if name not in WORLDS:
            print("нет мира:", name)
            continue
        img = make(name)
        path = os.path.join(OUT, name + ".webp")
        img.save(path, "WEBP", quality=82, method=6)
        total += os.path.getsize(path)
        print("  %-10s %5.1f КБ" % (name, os.path.getsize(path) / 1024))
    print("готово: %d текстур за %.2f с, %.2f МБ" % (len(wanted), time.time() - t0, total / 1024 / 1024))
    print("папка:", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
