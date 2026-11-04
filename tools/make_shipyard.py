"""Текстура и схема верфи: бетонная площадка, рельсы, разметка + чертёж в двух видах.

    python tools/make_shipyard.py
Выход:
    images/shipyard/yard-texture.webp   — текстура площадки (1024×1024)
    images/shipyard/yard-scheme.png     — схема постройки (1600×1000)
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "deploy-host", "site", "images", "shipyard")
REPORT = os.path.join(ROOT, "reports")

W = H = 1024
CONCRETE = (154, 158, 162)
CONCRETE2 = (138, 142, 146)
JOINT = (110, 114, 118)
YELLOW = (216, 164, 28)
WHITE = (232, 236, 240)
RED = (170, 58, 44)
STEEL = (140, 148, 156)
DARK = (58, 64, 70)


def font(size, bold=True):
    try:
        return ImageFont.truetype(r"C:\Windows\Fonts\segoeui%s.ttf" % ("b" if bold else ""), size)
    except Exception:
        return ImageFont.load_default()


def texture():
    """Площадка: плиты 8×8, стыки, следы техники, разметка доков и рельсы крана."""
    rnd = random.Random(7)
    img = Image.new("RGB", (W, H), CONCRETE)
    dr = ImageDraw.Draw(img)

    # плиты
    tiles = 8
    step = W // tiles
    for x in range(tiles):
        for y in range(tiles):
            shade = rnd.randint(-8, 8)
            col = tuple(max(0, min(255, c + shade)) for c in (CONCRETE if (x + y) % 2 else CONCRETE2))
            dr.rectangle([x * step, y * step, (x + 1) * step, (y + 1) * step], fill=col)
    for i in range(tiles + 1):
        dr.line([(i * step, 0), (i * step, H)], fill=JOINT, width=4)
        dr.line([(0, i * step), (W, i * step)], fill=JOINT, width=4)

    # мелкая крошка и трещины
    for _ in range(2400):
        x, y = rnd.randint(0, W - 1), rnd.randint(0, H - 1)
        r = rnd.randint(1, 4)
        a = rnd.randint(30, 70)
        dr.ellipse([x, y, x + r, y + r], fill=(110, 114, 118))
    for _ in range(26):
        x, y = rnd.randint(0, W), rnd.randint(0, H)
        pts = [(x, y)]
        for _ in range(rnd.randint(3, 6)):
            x += rnd.randint(-40, 40)
            y += rnd.randint(-40, 40)
            pts.append((x, y))
        dr.line(pts, fill=(96, 100, 104), width=2)

    # рельсы крана — две пары по краям
    for rx in (90, W - 130):
        dr.rectangle([rx, 0, rx + 34, H], fill=(96, 100, 106))
        dr.rectangle([rx + 6, 0, rx + 10, H], fill=STEEL)
        dr.rectangle([rx + 24, 0, rx + 28, H], fill=STEEL)
        for y in range(0, H, 48):
            dr.rectangle([rx - 4, y, rx + 38, y + 6], fill=DARK)

    # разметка доков: пять секций с номерами
    for i in range(5):
        top = 120 + i * 160
        dr.rectangle([180, top, W - 200, top + 130], outline=YELLOW, width=6)
        # штриховка «опасная зона» по краю
        for x in range(180, W - 200, 26):
            dr.line([(x, top + 130), (x + 14, top + 148)], fill=YELLOW, width=5)
        dr.text((210, top + 18), "ДОК %d" % (i + 1), font=font(44), fill=YELLOW)
        dr.text((W - 340, top + 26), "%d × %d м" % (120, 60), font=font(26, False), fill=WHITE)

    # направляющая полоса в центр
    dr.rectangle([W // 2 - 14, 60, W // 2 + 14, H - 60], fill=(120, 124, 128))
    for y in range(80, H - 80, 90):
        dr.rectangle([W // 2 - 9, y, W // 2 + 9, y + 46], fill=WHITE)

    # предупреждающие надписи
    dr.text((200, 40), "ВЕРФЬ · СЕКТОР А", font=font(34), fill=WHITE)
    dr.text((W - 330, H - 70), "ОСТОРОЖНО · КРАН", font=font(26), fill=RED)

    return img


def scheme():
    """Чертёж: вид сверху и вид сбоку, размеры, легенда, примечания."""
    Wc, Hc = 1600, 1000
    img = Image.new("RGB", (Wc, Hc), (243, 246, 250))
    dr = ImageDraw.Draw(img)
    ink = (32, 38, 46)
    thin = (120, 130, 140)
    accent = (32, 96, 160)

    # рамка чертежа
    dr.rectangle([24, 24, Wc - 24, Hc - 24], outline=ink, width=3)
    dr.text((48, 44), "ВЕРФЬ «ГАЛАКТИКА» · СХЕМА ПОСТРОЙКИ", font=font(34), fill=ink)
    dr.text((48, 88), "вид сверху (1:400) и разрез (1:400) · сталь, бетон, рельсовый кран", font=font(20, False), fill=thin)

    # ---- вид сверху ----
    ox, oy = 90, 160
    yard_w, yard_h = 900, 520
    dr.rectangle([ox, oy, ox + yard_w, oy + yard_h], outline=ink, width=3)
    # плиты
    for i in range(1, 6):
        dr.line([(ox + i * yard_w / 6, oy), (ox + i * yard_w / 6, oy + yard_h)], fill=thin, width=1)
    for j in range(1, 4):
        dr.line([(ox, oy + j * yard_h / 4), (ox + yard_w, oy + j * yard_h / 4)], fill=thin, width=1)

    # рельсы крана
    dr.line([(ox + 60, oy), (ox + 60, oy + yard_h)], fill=accent, width=6)
    dr.line([(ox + yard_w - 60, oy), (ox + yard_w - 60, oy + yard_h)], fill=accent, width=6)
    # мост крана
    dr.rectangle([ox + 60, oy + yard_h / 2 - 12, ox + yard_w - 60, oy + yard_h / 2 + 12], outline=accent, width=4)
    dr.rectangle([ox + yard_w / 2 - 30, oy + yard_h / 2 - 26, ox + yard_w / 2 + 30, oy + yard_h / 2 + 26],
                 outline=ink, width=3)

    # доки: 5 секций
    for i in range(5):
        x0 = ox + 120 + i * 150
        dr.rectangle([x0, oy + 40, x0 + 120, oy + 190], outline=ink, width=2)
        dr.text((x0 + 8, oy + 46), "ДОК %d" % (i + 1), font=font(18), fill=ink)
        dr.text((x0 + 8, oy + 70), "120×60 м", font=font(14, False), fill=thin)
        # корабль-силуэт
        dr.polygon([(x0 + 20, oy + 120), (x0 + 100, oy + 120), (x0 + 88, oy + 106), (x0 + 32, oy + 106)],
                   outline=accent, width=2)
        # роботы-сварщики
        for k in range(3):
            dr.ellipse([x0 + 16 + k * 32, oy + 160, x0 + 28 + k * 32, oy + 172], outline=thin, width=2)

    # склады и цеха
    dr.rectangle([ox + 20, oy + 240, ox + 380, oy + 340], outline=ink, width=2)
    dr.text((ox + 34, oy + 252), "ЦЕХ КОРПУСОВ · 40×20 м", font=font(16), fill=ink)
    dr.rectangle([ox + 420, oy + 240, ox + 700, oy + 340], outline=ink, width=2)
    dr.text((ox + 434, oy + 252), "СКЛАД СТАЛИ · 30×20 м", font=font(16), fill=ink)
    dr.rectangle([ox + 740, oy + 240, ox + yard_w - 30, oy + 340], outline=ink, width=2)
    dr.text((ox + 754, oy + 252), "ЭНЕРГОБЛОК · 15×20 м", font=font(16), fill=ink)
    dr.rectangle([ox + 20, oy + 380, ox + 700, oy + 470], outline=thin, width=2)
    dr.text((ox + 34, oy + 392), "ПЛОЩАДКА ХРАНЕНИЯ · 6 000 м²", font=font(16, False), fill=thin)

    # размеры
    dr.line([(ox, oy + yard_h + 26), (ox + yard_w, oy + yard_h + 26)], fill=ink, width=2)
    dr.line([(ox, oy + yard_h + 18), (ox, oy + yard_h + 34)], fill=ink, width=2)
    dr.line([(ox + yard_w, oy + yard_h + 18), (ox + yard_w, oy + yard_h + 34)], fill=ink, width=2)
    dr.text((ox + yard_w / 2 - 60, oy + yard_h + 32), "600 м", font=font(20), fill=ink)
    dr.line([(ox - 26, oy), (ox - 26, oy + yard_h)], fill=ink, width=2)
    dr.text((ox - 74, oy + yard_h / 2), "340 м", font=font(20), fill=ink)

    # ---- разрез ----
    sx, sy = 1080, 160
    dr.text((sx, sy - 34), "РАЗРЕЗ ПО ДОКАМ", font=font(22), fill=ink)
    ground = sy + 380
    dr.line([(sx, ground), (sx + 460, ground)], fill=ink, width=3)
    # бетонная плита
    dr.rectangle([sx, ground, sx + 460, ground + 26], fill=(214, 218, 222), outline=ink)
    # кран
    dr.line([(sx + 40, ground), (sx + 40, sy + 40)], fill=accent, width=8)
    dr.line([(sx + 420, ground), (sx + 420, sy + 40)], fill=accent, width=8)
    dr.rectangle([sx + 40, sy + 30, sx + 420, sy + 52], outline=accent, width=5)
    dr.line([(sx + 230, sy + 52), (sx + 230, sy + 120)], fill=ink, width=2)
    dr.rectangle([sx + 216, sy + 120, sx + 244, sy + 140], outline=ink, width=2)
    # доки с кораблями
    for i in range(3):
        bx = sx + 80 + i * 130
        dr.rectangle([bx, ground - 90, bx + 100, ground], outline=ink, width=2)
        dr.polygon([(bx + 14, ground - 60), (bx + 86, ground - 60), (bx + 74, ground - 76), (bx + 26, ground - 76)],
                   outline=accent, width=2)
        dr.text((bx + 6, ground + 4), "120 м", font=font(13, False), fill=thin)
    # высоты
    dr.line([(sx + 450, ground), (sx + 450, sy + 30)], fill=ink, width=2)
    dr.text((sx + 456, sy + 120), "85 м", font=font(18), fill=ink)
    dr.text((sx, ground + 40), "плита 1,2 м · рельс 60 м · пролёт крана 180 м", font=font(15, False), fill=thin)

    # ---- легенда ----
    lx, ly = 1080, 640
    dr.text((lx, ly), "ЛЕГЕНДА", font=font(20), fill=ink)
    items = [(accent, "рельсовый путь крана"), (ink, "несущие конструкции"),
             (YELLOW, "разметка доков"), ((214, 218, 222), "бетонная плита")]
    for i, (col, label) in enumerate(items):
        dr.rectangle([lx, ly + 34 + i * 30, lx + 26, ly + 52 + i * 30], fill=col, outline=ink)
        dr.text((lx + 36, ly + 32 + i * 30), label, font=font(16, False), fill=ink)

    # ---- штамп ----
    dr.rectangle([48, Hc - 150, 640, Hc - 48], outline=ink, width=2)
    dr.text((62, Hc - 138), "ПРОЕКТ: верфь с 5 доками и кран-балкой", font=font(18), fill=ink)
    dr.text((62, Hc - 110), "Масштаб 1:400 · лист 1 из 1 · «Галактика» 2226", font=font(15, False), fill=thin)
    dr.text((62, Hc - 84), "Материалы: сталь 1 160 т, бетон 12 000 м³, стекло 400 м²", font=font(15, False), fill=thin)

    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(REPORT, exist_ok=True)
    tex = texture()
    tex_path = os.path.join(OUT, "yard-texture.webp")
    tex.save(tex_path, "WEBP", quality=86, method=6)
    print("текстура:", tex_path, round(os.path.getsize(tex_path) / 1024), "КБ")

    sch = scheme()
    sch_path = os.path.join(OUT, "yard-scheme.png")
    sch.save(sch_path, optimize=True)
    sch.save(os.path.join(REPORT, "shipyard-scheme.png"), optimize=True)
    print("схема:", sch_path, round(os.path.getsize(sch_path) / 1024), "КБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
