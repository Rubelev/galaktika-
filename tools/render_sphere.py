"""Показывает, как планета выглядит на глобусе: равнопромежуточная текстура → шар.

    python tools/render_sphere.py moon            # один кадр
    python tools/render_sphere.py moon --gif      # вращение (гифка)

Свет — по Ламберту от источника слева-сверху, атмосферного свечения нет (глобус в игре
рисуется CSS-градиентом, здесь — честная сфера).
"""
import argparse
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, "deploy-host", "site", "images", "tex")
PROC = os.path.join(ROOT, "deploy-host", "site", "images", "tex-proc")
OUT = os.path.join(ROOT, "reports")


def sphere(texture, size=520, lon0=0.0, lat0=0.0, light=(-0.55, 0.45, 0.70)):
    """Ортографическая проекция сферы с текстурой (в текстуре 0 — левый край)."""
    tex = np.asarray(texture.convert("RGB"), dtype=np.float32) / 255.0
    th, tw, _ = tex.shape

    y, x = np.mgrid[0:size, 0:size]
    px = (x + 0.5) / size * 2 - 1
    py = 1 - (y + 0.5) / size * 2
    r2 = px * px + py * py
    mask = r2 <= 1.0
    nz = np.sqrt(np.clip(1 - r2, 0, 1))

    # нормаль → широта/долгота
    lat = np.arcsin(np.clip(py, -1, 1)) + lat0
    lon = np.arctan2(px, nz) + lon0

    u = ((lon / (2 * math.pi)) % 1.0 * tw).astype(int) % tw
    v = ((0.5 - lat / math.pi) * th).astype(int)
    v = np.clip(v, 0, th - 1)

    rgb = tex[v, u]

    # освещение
    lx, ly, lz = light
    ln = math.sqrt(lx * lx + ly * ly + lz * lz)
    lx, ly, lz = lx / ln, ly / ln, lz / ln
    lam = np.clip(px * lx + py * ly + nz * lz, 0, 1)
    shade = 0.10 + 0.90 * lam
    rgb = rgb * shade[:, :, None]

    # лёгкий ободок сферы
    rim = np.clip((1 - nz) * 1.6, 0, 1) ** 2 * 0.18
    rgb = np.clip(rgb + rim[:, :, None], 0, 1)

    out = np.zeros((size, size, 4), dtype=np.uint8)
    out[:, :, :3] = (rgb * 255).astype(np.uint8)
    out[:, :, 3] = (mask * 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def load(world, source="proc"):
    base = PROC if source == "proc" else TEX
    path = os.path.join(base, world + ".webp")
    if not os.path.exists(path):
        raise SystemExit("нет текстуры: " + path)
    return Image.open(path)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("world")
    ap.add_argument("--gif", action="store_true")
    ap.add_argument("--size", type=int, default=520)
    ap.add_argument("--frames", type=int, default=24)
    args = ap.parse_args(argv[1:])

    os.makedirs(OUT, exist_ok=True)
    proc = load(args.world, "proc")
    photo = load(args.world, "photo") if os.path.exists(os.path.join(TEX, args.world + ".webp")) else None

    # сравнение: фото и процедурная
    if photo:
        sheet = Image.new("RGB", (args.size * 2 + 30, args.size + 34), (8, 12, 18))
        sheet.paste(sphere(photo, args.size).convert("RGB"), (0, 0), sphere(photo, args.size))
        sheet.paste(sphere(proc, args.size).convert("RGB"), (args.size + 30, 0), sphere(proc, args.size))
        sheet.save(os.path.join(OUT, "moon-compare.png"))
        print("сравнение:", os.path.join(OUT, "moon-compare.png"))

    single = sphere(proc, args.size)
    single.save(os.path.join(OUT, "moon-proc.png"))
    print("кадр:", os.path.join(OUT, "moon-proc.png"))

    if args.gif:
        frames = []
        for i in range(args.frames):
            ang = i / args.frames * 2 * math.pi
            im = sphere(proc, 420, lon0=ang).convert("RGB")
            bg = Image.new("RGB", (420, 420), (5, 8, 12))
            bg.paste(im, (0, 0), sphere(proc, 420, lon0=ang))
            frames.append(bg)
        out = os.path.join(OUT, "moon-rotate.gif")
        frames[0].save(out, save_all=True, append_images=frames[1:], duration=90, loop=0, optimize=True)
        print("вращение:", out, round(os.path.getsize(out) / 1024), "КБ")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
