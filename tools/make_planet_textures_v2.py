"""Текстуры основных планет и лун: с реальными деталями рельефа.

Не «шум ради шума», а узнаваемые объекты:
  * Марс — тёмные базальты (Сиритис), долина Маринер, Олимп, полярные шапки
  * Луна — моря, материки, лучевые кратеры (Тихо), Южный полюс — Эйткен
  * Меркурий — кратеры, бассейн Калорис, уступы
  * Венера — жёлто-оранжевая облачность, Y-образный рисунок
  * Европа — ледяные линии, хаос-террейн
  * Ио — серно-жёлтая поверхность, тёмные вулканы, светлые выбросы
  * Титан — оранжевая дымка, тёмные дюны, метановые озёра
  * Энцелад — яркий лёд, «тигровые полосы» у южного полюса
  * Ганимед, Каллисто — тёмные/светлые области, кратеры
  * Тритон — «дынный» рельеф, розовая южная шапка
  * Юпитер, Сатурн, Уран, Нептун — полосы, вихри, Большое красное пятно

    python tools/make_planet_textures_v2.py           # все
    python tools/make_planet_textures_v2.py mars moon
"""
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "deploy-host", "site", "images", "tex")
W, H = 1024, 512


def rng(name):
    return np.random.default_rng(abs(hash(name)) % 1_000_000)


# ---------- утилиты ----------
def value_noise(r, h, w, scale, octaves=4, persistence=0.5):
    """Периодический по долготе фрактальный шум."""
    total = np.zeros((h, w))
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        gh = max(2, int(h / (scale / (2 ** o))))
        gw = max(2, int(w / (scale / (2 ** o))))
        g = r.random((gh, gw))
        g = np.vstack([g, g[:1]])          # замыкание по широте
        g = np.hstack([g, g[:, :1]])       # замыкание по долготе
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
        total += ((top * (1 - fy) + bot * fy)) * amp
        norm += amp
        amp *= persistence
    return total / norm


def craters(r, h, w, count, rmin, rmax, strength=0.5):
    """Полярные шапки и кратеры: возвращает карту высот —1..1."""
    field = np.zeros((h, w))
    for _ in range(count):
        cx = r.random() * w
        cy = r.random() * h
        rad = rmin + r.random() * (rmax - rmin)
        ys = np.arange(h)[:, None]
        xs = np.arange(w)[None, :]
        dx = np.abs(xs - cx)
        dx = np.minimum(dx, w - dx)          # замыкание по долготе
        dy = ys - cy
        d = np.sqrt(dx * dx + dy * dy) / rad
        # валик и чаша
        ring = np.exp(-((d - 1.0) / 0.22) ** 2)
        bowl = np.clip(1 - d * d, 0, 1) * np.where(d < 1, -1, 0)
        field += (ring * 0.7 + bowl) * strength
    return field


def ball_light(rgb, strength=0.55):
    """Лёгкое затемнение к полюсам, как будто шар освещён ровно."""
    h, w, _ = rgb.shape
    lat = np.linspace(-1, 1, h)[:, None]
    shade = 1 - strength * (np.abs(lat) ** 2.4)
    return rgb * shade[:, :, None]


def save(name, rgb):
    os.makedirs(OUT, exist_ok=True)
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")
    path = os.path.join(OUT, name + ".webp")
    img.save(path, "WEBP", quality=86, method=6)
    return path, os.path.getsize(path)


# ---------- планеты ----------
def mars(r):
    base = value_noise(r, H, W, 90, 5)
    fine = value_noise(r, H, W, 14, 4)
    rgb = np.zeros((H, W, 3), dtype=float)
    ochre = np.array([196, 116, 72])
    dark = np.array([120, 74, 54])
    bright = np.array([222, 166, 118])
    t = np.clip(base * 1.5 - 0.25, 0, 1)[:, :, None]
    rgb[:] = dark + (ochre - dark) * t
    rgb = rgb * (1 - fine[:, :, None] * 0.16) + bright * fine[:, :, None] * 0.16

    # Сиритис Майор — тёмное пятно в северном полушарии
    ys, xs = np.mgrid[0:H, 0:W]
    syrt = np.exp(-(((xs - W * 0.42) / (W * 0.10)) ** 2 + ((ys - H * 0.40) / (H * 0.14)) ** 2))
    rgb *= (1 - syrt[:, :, None] * 0.45)

    # долина Маринер: длинная трещина вдоль экватора
    rift = np.exp(-((ys - H * 0.55 - np.sin(xs / 90.0) * 8) / 5.0) ** 2)
    rift *= (xs > W * 0.25) & (xs < W * 0.80)
    rgb *= (1 - rift[:, :, None] * 0.55)
    rgb += (rift[:, :, None] * np.array([60, 40, 34]))

    # Олимп — светлое кольцо
    ol = np.sqrt(((xs - W * 0.18) / (W * 0.05)) ** 2 + ((ys - H * 0.34) / (H * 0.09)) ** 2)
    rgb += (np.clip(1 - ol, 0, 1) ** 2)[:, :, None] * np.array([46, 28, 16])

    # полярные шапки
    cap = np.clip((np.abs(ys - H / 2) / (H / 2) - 0.86) / 0.14, 0, 1)
    cap = cap[:, :, None] * np.array([236, 238, 240])
    rgb = rgb * (1 - cap / 255 * 0.9) + cap * 0.9
    return ball_light(rgb, 0.25)


def moon(r):
    base = value_noise(r, H, W, 70, 5)
    maria = value_noise(r, H, W, 40, 3)
    rgb = np.zeros((H, W, 3), dtype=float)
    high = np.array([196, 194, 190])
    low = np.array([104, 104, 108])
    t = np.clip(base * 1.3 - 0.15, 0, 1)[:, :, None]
    rgb[:] = low + (high - low) * t
    # моря: тёмные базальты
    sea = np.clip((maria - 0.52) * 6, 0, 1)[:, :, None]
    rgb = rgb * (1 - sea * 0.62) + np.array([74, 76, 82]) * sea * 0.62
    # кратеры и лучевые выбросы
    field = craters(r, H, W, 900, 2, 26, 0.5)
    rgb = rgb * (1 + field[:, :, None] * 0.16)
    rays = craters(r, H, W, 40, 2, 6, 1.0)
    rgb += np.clip(rays, 0, 1)[:, :, None] * np.array([40, 40, 42])
    return ball_light(rgb, 0.12)


def mercury(r):
    base = value_noise(r, H, W, 80, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    g1 = np.array([128, 124, 120])
    g2 = np.array([168, 164, 158])
    rgb[:] = g1 + (g2 - g1) * np.clip(base * 1.4 - 0.2, 0, 1)[:, :, None]
    field = craters(r, H, W, 1400, 2, 30, 0.6)
    rgb = rgb * (1 + field[:, :, None] * 0.2)
    ys, xs = np.mgrid[0:H, 0:W]
    caloris = np.sqrt(((xs - W * 0.35) / (W * 0.12)) ** 2 + ((ys - H * 0.42) / (H * 0.20)) ** 2)
    rgb -= (np.clip(1 - caloris, 0, 1) ** 2)[:, :, None] * 26
    return ball_light(rgb, 0.18)


def venus(r):
    ys_, xs_ = np.mgrid[0:H, 0:W]
    flow = value_noise(r, H, W, 160, 6)
    swirl = Ypattern(r)
    rgb = np.zeros((H, W, 3), dtype=float)
    c1 = np.array([214, 184, 120])
    c2 = np.array([244, 228, 176])
    t = np.clip(flow * 1.6 - 0.3, 0, 1)[:, :, None]
    rgb[:] = c1 + (c2 - c1) * t
    rgb = rgb * (1 - swirl[:, :, None] * 0.18) + np.array([250, 240, 200]) * swirl[:, :, None] * 0.18
    streak = np.sin(xs_ / 22.0 + value_noise(r, H, W, 40, 3) * 9) * 0.5 + 0.5
    rgb = rgb * (1 - streak[:, :, None] * 0.08) + np.array([238, 214, 162]) * streak[:, :, None] * 0.08
    return ball_light(rgb, 0.10)


def Ypattern(r):
    """Y-образный рисунок облаков Венеры, вытянутый вдоль экватора."""
    ys, xs = np.mgrid[0:H, 0:W]
    angle = (xs / W) * 2 * math.pi
    y = (ys - H / 2) / (H / 2)
    arms = np.cos(3 * angle + y * 2.2) * 0.5 + 0.5
    band = np.exp(-(y / 0.55) ** 2)
    return np.clip(arms * band, 0, 1)


CONTINENTS = [
    # Африка
    [(-17,15),(10,15),(32,30),(43,12),(51,12),(40,-5),(38,-20),(25,-34),(18,-34),(12,-18),(9,0),(-8,5)],
    # Евразия
    [(-10,36),(0,44),(3,52),(10,58),(30,70),(60,72),(100,76),(140,72),(160,70),(180,66),
     (180,60),(160,58),(140,50),(122,40),(120,32),(110,20),(100,10),(95,5),(80,8),(70,22),
     (60,25),(48,30),(36,36),(28,40),(20,42),(10,44)],
    # Северная Америка
    [(-168,65),(-140,70),(-120,72),(-95,75),(-75,72),(-60,60),(-55,48),(-70,42),(-80,26),
     (-97,26),(-105,20),(-115,30),(-125,40),(-130,55),(-150,60)],
    # Южная Америка
    [(-80,10),(-60,12),(-50,0),(-35,-6),(-38,-20),(-48,-25),(-58,-40),(-70,-52),(-75,-40),(-70,-20),(-80,-5)],
    # Австралия
    [(113,-22),(129,-12),(142,-11),(150,-22),(153,-28),(147,-38),(135,-35),(124,-33)],
    # Гренландия
    [(-45,60),(-20,70),(-25,82),(-55,82),(-60,70)],
]


def land_mask():
    """Маска суши: контуры континентов в равнопромежуточной проекции."""
    from PIL import ImageDraw
    img = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(img)

    def to_xy(lon, lat):
        return ((lon + 180) / 360 * W, (90 - lat) / 180 * H)

    for poly in CONTINENTS:
        dr.polygon([to_xy(lon, lat) for lon, lat in poly], fill=255)
    # Антарктида — сплошная полоса
    dr.rectangle([0, H * 0.90, W, H], fill=255)
    return np.array(img, dtype=float) / 255.0


def earth(r):
    mask = land_mask()
    base = value_noise(r, H, W, 70, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    ocean = np.array([24, 64, 122])
    deep = np.array([12, 38, 86])
    depth = value_noise(r, H, W, 50, 4)
    rgb[:] = deep + (ocean - deep) * np.clip(depth * 1.4 - 0.2, 0, 1)[:, :, None]

    lat = np.abs(np.linspace(-1, 1, H))[:, None, None]
    green = np.array([58, 104, 56])
    taiga = np.array([44, 84, 60])
    desert = np.array([186, 158, 104])
    tundra = np.array([140, 140, 128])
    land_col = green * (1 - lat * 1.2) + desert * np.clip(lat * 1.4 - 0.1, 0, 1)
    land_col = land_col * (1 - np.clip((lat - 0.55) * 2.2, 0, 1)) + tundra * np.clip((lat - 0.55) * 2.2, 0, 1)
    land_col = land_col * (1 - np.clip((lat - 0.72) * 3, 0, 1)) + np.array([236, 240, 244]) * np.clip((lat - 0.72) * 3, 0, 1)
    land_col = land_col * (1 + (base[:, :, None] - 0.5) * 0.3)
    m = mask[:, :, None]
    rgb = rgb * (1 - m) + land_col * m

    # лёд у полюсов
    ice = np.clip((np.abs(np.linspace(-1, 1, H)) - 0.80) / 0.18, 0, 1)[:, None, None] ** 1.4
    rgb = rgb * (1 - ice) + np.array([242, 246, 250]) * ice

    # облака: циклоны и полосы
    cl = np.clip((value_noise(r, H, W, 45, 5) - 0.48) * 3.4, 0, 1) * 0.85
    swirl = value_noise(r, H, W, 18, 4)
    cl *= 0.7 + 0.3 * (swirl > 0.5)
    rgb = rgb * (1 - cl[:, :, None] * 0.8) + np.array([250, 250, 252]) * cl[:, :, None] * 0.8
    return ball_light(rgb, 0.20)


def ys_(h):
    return np.arange(h)[:, None]


def europa(r):
    ice = value_noise(r, H, W, 70, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    c1 = np.array([214, 208, 196])
    c2 = np.array([238, 236, 230])
    rgb[:] = c1 + (c2 - c1) * np.clip(ice * 1.3 - 0.1, 0, 1)[:, :, None]
    # линии разломов: длинные дуги через всю поверхность
    ys, xs = np.mgrid[0:H, 0:W]
    lines = np.zeros((H, W))
    for k in range(28):
        y0 = r.random() * H
        amp = 8 + r.random() * 30
        freq = 0.004 + r.random() * 0.01
        phase = r.random() * 6.28
        curve = y0 + np.sin(xs * freq + phase) * amp
        width = 1.2 + r.random() * 1.6
        lines += np.exp(-((ys - curve) / width) ** 2) * (0.5 + r.random() * 0.5)
    rgb = rgb * (1 - np.clip(lines, 0, 1)[:, :, None] * 0.55) + \
          np.array([150, 108, 84]) * np.clip(lines, 0, 1)[:, :, None] * 0.55
    # хаос-террейн
    chaos = np.clip((value_noise(r, H, W, 26, 4) - 0.62) * 6, 0, 1)
    rgb += chaos[:, :, None] * np.array([26, 20, 14])
    return ball_light(rgb, 0.12)


def io(r):
    base = value_noise(r, H, W, 60, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    c1 = np.array([214, 196, 108])
    c2 = np.array([240, 232, 196])
    rgb[:] = c1 + (c2 - c1) * np.clip(base * 1.4 - 0.2, 0, 1)[:, :, None]
    ys, xs = np.mgrid[0:H, 0:W]
    # вулканы: тёмные точки с светлым ореолом
    for _ in range(40):
        cx, cy = r.random() * W, r.random() * H
        rad = 4 + r.random() * 14
        d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / rad
        rgb -= (np.clip(1 - d, 0, 1) ** 3)[:, :, None] * np.array([120, 100, 60])
        halo = np.exp(-((d - 1.1) / 0.25) ** 2)
        rgb += halo[:, :, None] * np.array([40, 34, 20])
    # серные потоки
    flow = np.clip((value_noise(r, H, W, 30, 4) - 0.55) * 5, 0, 1)
    rgb = rgb * (1 - flow[:, :, None] * 0.3) + np.array([176, 128, 56]) * flow[:, :, None] * 0.3
    return ball_light(rgb, 0.14)


def titan(r):
    haze = value_noise(r, H, W, 120, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    c1 = np.array([186, 132, 62])
    c2 = np.array([222, 176, 104])
    rgb[:] = c1 + (c2 - c1) * np.clip(haze * 1.5 - 0.25, 0, 1)[:, :, None]
    # тёмные дюны у экватора
    ys, xs = np.mgrid[0:H, 0:W]
    dune = np.exp(-((ys - H * 0.52) / (H * 0.10)) ** 2) * (value_noise(r, H, W, 18, 4) > 0.55)
    rgb *= (1 - dune[:, :, None] * 0.35)
    # метановые озёра у полюса
    lake = (value_noise(r, H, W, 22, 4) > 0.68) & (np.abs(ys - H * 0.12) < H * 0.10)
    rgb = rgb * (1 - lake[:, :, None] * 0.55) + np.array([28, 34, 44]) * lake[:, :, None] * 0.55
    return ball_light(rgb, 0.16)


def enceladus(r):
    ice = value_noise(r, H, W, 80, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    rgb[:] = np.array([228, 232, 238]) + (np.clip(ice * 1.2 - 0.1, 0, 1)[:, :, None] * 22)
    ys, xs = np.mgrid[0:H, 0:W]
    # тигровые полосы у южного полюса
    for k in range(4):
        y0 = H * (0.80 + 0.025 * k)
        curve = y0 + np.sin(xs / 70.0 + k * 1.7) * 3.5
        seg = ((xs > W * (0.30 + 0.06 * k)) & (xs < W * (0.62 + 0.05 * k))).astype(float)
        stripe = np.exp(-((ys - curve) / 2.4) ** 2) * seg
        rgb = rgb * (1 - stripe[:, :, None] * 0.5) + np.array([126, 154, 180]) * stripe[:, :, None] * 0.5
    field = craters(r, H, W, 260, 3, 18, 0.35)
    rgb = rgb * (1 + field[:, :, None] * 0.10)
    return ball_light(rgb, 0.20)


def ganymede(r):
    base = value_noise(r, H, W, 70, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    dark = np.array([104, 96, 88])
    light = np.array([176, 170, 162])
    rgb[:] = dark + (light - dark) * np.clip(base * 1.4 - 0.2, 0, 1)[:, :, None]
    ys, xs = np.mgrid[0:H, 0:W]
    # борозды
    groove = np.sin((xs / 7.0) + value_noise(r, H, W, 40, 3) * 12) * 0.5 + 0.5
    rgb *= (1 + (groove[:, :, None] - 0.5) * 0.12)
    field = craters(r, H, W, 700, 2, 16, 0.4)
    rgb = rgb * (1 + field[:, :, None] * 0.14)
    # полярный иней
    cap = np.clip((np.abs(ys - H / 2) / (H / 2) - 0.82) / 0.18, 0, 1)[:, :, None]
    rgb = rgb * (1 - cap * 0.55) + np.array([226, 228, 230]) * cap * 0.55
    return ball_light(rgb, 0.14)


def callisto(r):
    base = value_noise(r, H, W, 90, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    rgb[:] = np.array([74, 68, 62]) + (np.clip(base * 1.5 - 0.2, 0, 1)[:, :, None] * 40)
    field = craters(r, H, W, 1800, 2, 22, 0.65)
    rgb = rgb * (1 + field[:, :, None] * 0.22)
    # Валгалла: концентрические кольца
    ys, xs = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xs - W * 0.6) / (W * 0.3)) ** 2 + ((ys - H * 0.45) / (H * 0.35)) ** 2)
    ring = np.sin(d * 26) * np.exp(-d * 1.2) * 0.5 + 0.5
    rgb += (ring * np.exp(-d * 2))[:, :, None] * np.array([52, 46, 40])
    return ball_light(rgb, 0.12)


def triton(r):
    base = value_noise(r, H, W, 60, 5)
    rgb = np.zeros((H, W, 3), dtype=float)
    rgb[:] = np.array([196, 186, 178]) + (np.clip(base * 1.3 - 0.15, 0, 1)[:, :, None] * 30)
    ys, xs = np.mgrid[0:H, 0:W]
    cantaloupe = np.sin(xs / 12.0 + base * 8) * np.sin(ys / 12.0 + base * 8)
    rgb *= (1 + (cantaloupe[:, :, None] * 0.10))
    cap = np.clip((ys / H - 0.74) / 0.26, 0, 1)[:, :, None]
    rgb = rgb * (1 - cap * 0.5) + np.array([222, 170, 168]) * cap * 0.5
    return ball_light(rgb, 0.16)


def gas_giant(r, palette, bands=14, spot=None, storm=0.0):
    """Полосы газового гиганта: цвет по широте + вихри."""
    ys, xs = np.mgrid[0:H, 0:W]
    lat = (ys - H / 2) / (H / 2)
    wobble = value_noise(r, H, W, 60, 4) * 0.10 - 0.05
    band_v = np.sin((lat + wobble) * math.pi * bands) * 0.5 + 0.5
    rgb = np.zeros((H, W, 3), dtype=float)
    cols = [np.array(c, dtype=float) for c in palette]
    # плавные переходы между полосами (без «штрих-кода»)
    pos = band_v * (len(cols) - 1)
    i0 = np.clip(np.floor(pos).astype(int), 0, len(cols) - 1)
    i1 = np.clip(i0 + 1, 0, len(cols) - 1)
    frac = (pos - i0)[:, :, None]
    rgb = np.zeros((H, W, 3), dtype=float)
    for i in range(len(cols)):
        m0 = (i0 == i)
        if not m0.any():
            continue
        c1 = np.array(cols[i], dtype=float)[None, :]
        c2 = np.array(cols, dtype=float)[i1[m0]]          # цвета соседней полосы
        f = frac[m0]
        rgb[m0] = c1 * (1 - f) + c2 * f
    # мягкое размытие по широте, чтобы полосы не были «пилой»
    for _ in range(2):
        rgb[1:-1] = (rgb[:-2] + rgb[1:-1] * 2 + rgb[2:]) / 4
    rgb *= (1 + (value_noise(r, H, W, 22, 4)[:, :, None] - 0.5) * 0.07)
    if spot:
        cx, cy, sx, sy, col = spot
        d = np.sqrt(((xs - cx) / sx) ** 2 + ((ys - cy) / sy) ** 2)
        m = np.clip(1 - d, 0, 1)[:, :, None]
        rgb = rgb * (1 - m) + np.array(col, dtype=float) * m
    if storm > 0:
        swirl = value_noise(r, H, W, 12, 4)
        rgb += (swirl[:, :, None] - 0.5) * storm
    return ball_light(rgb, 0.30)


BODIES = {
    "mars": mars,
    "moon": moon,
    "mercury": mercury,
    "venus": venus,
    "earth": earth,
    "europa": europa,
    "io": io,
    "titan": titan,
    "enceladus": enceladus,
    "ganymede": ganymede,
    "callisto": callisto,
    "triton": triton,
    "jupiter": lambda r: gas_giant(r, [(176, 142, 112), (206, 178, 148), (150, 118, 96), (222, 202, 176)],
                                    bands=9, spot=(W * 0.62, H * 0.62, W * 0.09, H * 0.055, (196, 108, 84)), storm=14),
    "saturn": lambda r: gas_giant(r, [(206, 186, 142), (226, 208, 166), (192, 172, 130)],
                                  bands=11, storm=8),
    "uranus": lambda r: gas_giant(r, [(158, 214, 214), (176, 224, 222), (146, 200, 204)], bands=7, storm=4),
    "neptune": lambda r: gas_giant(r, [(52, 92, 176), (72, 116, 196), (40, 74, 150)],
                                   bands=8, spot=(W * 0.4, H * 0.6, W * 0.07, H * 0.045, (26, 44, 96)), storm=8),
}


def main(argv):
    names = argv[1:] or list(BODIES)
    total = 0
    for name in names:
        if name not in BODIES:
            print("нет такого мира:", name)
            continue
        rgb = BODIES[name](rng(name))
        path, size = save(name, rgb)
        total += size
        print("  %-10s %6.1f КБ" % (name, size / 1024))
    print("готово: %d текстур, %.1f МБ" % (len(names), total / 1024 / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
