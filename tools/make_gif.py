"""Сборка GIF из кадров — быстро и без браузера.

Примеры:
    python tools/make_gif.py reports/site-frames/earth slides/build-earth.gif --ms 600 --title "Стройка на Земле"
    python tools/make_gif.py frames/ --caps caps.txt out.gif
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REG = r"C:\Windows\Fonts\segoeui.ttf"


def font(size, bold=True):
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)
    except Exception:
        return ImageFont.load_default()


def fit(im, w, h):
    """Вписывает кадр в размер с обрезкой по центру (как object-fit: cover)."""
    iw, ih = im.size
    r = w / h
    if iw / ih > r:
        nw = int(ih * r)
        im = im.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    else:
        nh = int(iw / r)
        im = im.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
    return im.resize((w, h), Image.LANCZOS)


def build(frames, out, ms=700, width=1000, height=620, bar=52, caps=None, title="", brand="Галактика"):
    if not frames:
        raise SystemExit("нет кадров")
    images = []
    for i, path in enumerate(frames):
        im = Image.open(path).convert("RGB")
        canvas = Image.new("RGB", (width, height + bar), (8, 14, 20))
        canvas.paste(fit(im, width, height), (0, 0))
        dr = ImageDraw.Draw(canvas)
        cap = (caps[i] if caps and i < len(caps) else "")
        if not cap and title:
            cap = "%s · кадр %d/%d" % (title, i + 1, len(frames))
        if cap:
            dr.text((22, height + 11), cap, font=font(19), fill=(226, 234, 241))
        dr.text((width - 120, height + 14), brand, font=font(12, False), fill=(110, 150, 190))
        images.append(canvas)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    images[0].save(out, save_all=True, append_images=images[1:], duration=ms, loop=0, optimize=True)
    return out, len(images), os.path.getsize(out)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("frames", help="папка с PNG или список файлов")
    ap.add_argument("out", help="выходной .gif")
    ap.add_argument("--ms", type=int, default=700, help="задержка кадра, мс")
    ap.add_argument("--width", type=int, default=1000)
    ap.add_argument("--height", type=int, default=620)
    ap.add_argument("--title", default="")
    ap.add_argument("--caps", default="", help="файл с подписями, по строке на кадр")
    args = ap.parse_args(argv[1:])

    src = args.frames
    if os.path.isdir(src):
        frames = sorted(os.path.join(src, f) for f in os.listdir(src) if f.lower().endswith(".png"))
    else:
        frames = [f for f in src.split(",") if f.strip()]
    caps = []
    if args.caps and os.path.exists(args.caps):
        caps = [ln.strip() for ln in open(args.caps, encoding="utf-8") if ln.strip()]

    out, n, size = build(frames, args.out, ms=args.ms, width=args.width, height=args.height,
                         caps=caps, title=args.title)
    print("%s: %d кадров, %.1f КБ" % (out, n, size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
