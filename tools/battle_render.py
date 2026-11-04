"""Отрисовка боевого теста: 150 кораблей Земля -> Сатурн, шаг 1 минута.
Читает battle_sim.json, рисует кадры и собирает GIF.
Запуск: python galaktika/tools/battle_render.py
"""
import io
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS = os.path.join(ROOT, "reports")
SRC = os.path.join(REPORTS, "battle_sim.json")

W, H = 720, 460
BG = (6, 10, 20)
GRID = (24, 34, 52)
TXT = (210, 226, 245)
DIM = (120, 140, 165)

CLASS_COLOR = {
    "fighter": (255, 209, 102),
    "light": (143, 214, 255),
    "hauler": (143, 227, 168),
}

PLANET_COLOR = {
    "mercury": (170, 160, 150), "venus": (230, 200, 140), "earth": (90, 150, 220),
    "mars": (200, 110, 80), "jupiter": (210, 180, 140), "saturn": (220, 200, 150),
    "uranus": (150, 210, 220), "neptune": (110, 140, 230), "pluto": (170, 170, 180),
}
PLANET_R = {
    "mercury": 3, "venus": 4, "earth": 5, "mars": 4, "jupiter": 9,
    "saturn": 8, "uranus": 6, "neptune": 6, "pluto": 3,
}


def load():
    with io.open(SRC, encoding="utf-8") as f:
        return json.load(f)


def font(size):
    for name in ("segoeui.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()


def bounds(data):
    xs, ys = [], []
    for id, p in data["planets"].items():
        xs.append(p["x"]); ys.append(p["y"])
    for fr in data["frames"]:
        for s in fr["ships"]:
            xs.append(s["x"]); ys.append(s["y"])
    return min(xs), max(xs), min(ys), max(ys)


def make_frame(data, idx, box):
    x0, x1, y0, y1 = box
    pad = 40
    sx = (W - 2 * pad) / max(1.0, (x1 - x0))
    sy = (H - 2 * pad) / max(1.0, (y1 - y0))
    s = min(sx, sy)
    ox = (W - (x1 - x0) * s) / 2 - x0 * s
    oy = (H - (y1 - y0) * s) / 2 - y0 * s

    def P(p):
        return (p["x"] * s + ox, p["y"] * s + oy)

    fr = data["frames"][idx]
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    f_small = font(11)
    f_mid = font(13)
    f_big = font(16)

    # сетка-ориентир
    for gx in range(0, W, 60):
        d.line([(gx, 0), (gx, H)], fill=GRID)
    for gy in range(0, H, 60):
        d.line([(0, gy), (W, gy)], fill=GRID)

    # Солнце
    sx0, sy0 = P({"x": 0, "y": 0})
    d.ellipse([sx0 - 10, sy0 - 10, sx0 + 10, sy0 + 10], fill=(255, 170, 40))
    d.text((sx0 + 14, sy0 - 6), "Солнце", font=f_small, fill=DIM)

    # планеты
    for pid in data["planetsOrder"]:
        p = data["planets"].get(pid)
        if not p:
            continue
        cx, cy = P(p)
        r = PLANET_R.get(pid, 4)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PLANET_COLOR.get(pid, (180, 180, 180)))
        d.text((cx + r + 3, cy - 6), pid, font=f_small, fill=DIM)

    # кольца Сатурна
    sat = data["planets"].get("saturn")
    if sat:
        cx, cy = P(sat)
        for rr in (22, 30, 38):
            d.ellipse([cx - rr, cy - rr * 0.45, cx + rr, cy + rr * 0.45], outline=(90, 80, 60))

    # пираты
    for p in fr["pirates"]:
        if not p["alive"]:
            continue
        px, py = P(p)
        d.polygon([(px, py - 4), (px + 4, py + 3), (px - 4, py + 3)], fill=(255, 90, 90))

    # флот
    import math as _m
    sat_pos = data["planets"].get("saturn")
    live = [sh for sh in fr["ships"] if sh.get("alive", True)]
    for si, sh in enumerate(live):
        if not fr["arrived"]:
            # в полёте все 150 идут одной линией — разводим на пару пикселей,
            # иначе флот читается как одна точка
            sh = {"x": sh["x"] + ((si * 37) % 11 - 5) * 2.6,
                  "y": sh["y"] + ((si * 53) % 11 - 5) * 2.6,
                  "cls": sh.get("cls", "light")}
        if fr["arrived"] and sat_pos:
            a = (si / max(1, len(fr["ships"]))) * _m.pi * 2
            rr = 24 + (si % 5) * 4
            sh = {"x": sat_pos["x"] + _m.cos(a) * rr, "y": sat_pos["y"] + _m.sin(a) * rr, "cls": sh.get("cls", "light")}
        px, py = P(sh)
        col = CLASS_COLOR.get(sh["cls"], (200, 200, 200))
        if fr["arrived"]:
            d.ellipse([px - 1.6, py - 1.6, px + 1.6, py + 1.6], fill=col)
        else:
            d.ellipse([px - 1.2, py - 1.2, px + 1.2, py + 1.2], fill=col)

    # линии огня: залпы флота по пиратам
    if fr.get("fire") and fr.get("combat"):
        sat2 = data["planets"].get("saturn")
        if sat2:
            sx2, sy2 = P(sat2)
            for i, tgt in enumerate(fr["fire"]):
                tx, ty = P(tgt)
                d.line([(sx2, sy2), (tx, ty)], fill=(255, 120, 90), width=1)
                d.ellipse([tx - 6, ty - 6, tx + 6, ty + 6], outline=(255, 200, 120))

    # HUD
    d.rectangle([0, 0, W, 34], fill=(10, 16, 28))
    d.text((10, 8), f"МИНУТА {fr['minute']:02d} / 60", font=f_big, fill=TXT)
    st = fr["stats"]
    d.text((170, 10), f"фаза: {st['phase']}", font=f_mid, fill=(255, 209, 102) if fr["arrived"] else DIM)
    bc = st.get("byClass", {})
    d.text((300, 10), f"флот: {st['fleet']} (и{bc.get('fighter',0)}/л{bc.get('light',0)}/г{bc.get('hauler',0)})",
           font=f_mid, fill=(143, 227, 168))
    d.text((470, 10), f"пиратов: {st['pirates']}", font=f_mid, fill=(255, 120, 120))
    d.text((590, 10), f"уничтожено: {st['killed']}", font=f_mid, fill=TXT)
    if st.get('fleetLost'):
        d.text((700, 10), f"-{st['fleetLost']}", font=f_mid, fill=(255, 150, 150))

    d.text((10, H - 22), "150 кораблей · Земля → Сатурн · ускорение времени ×5 (час реального ≈ 5 ч игры)",
           font=f_small, fill=DIM)
    return img


def main():
    data = load()
    box = bounds(data)
    frames = [make_frame(data, i, box) for i in range(len(data["frames"]))]
    gif_path = os.path.join(REPORTS, "battle-150-ships.gif")
    frames[0].save(gif_path, save_all=True, append_images=frames[1:], duration=320, loop=0)
    for i in (0, 20, 40, 50, 60):
        if i < len(frames):
            frames[i].save(os.path.join(REPORTS, f"battle-minute-{i:02d}.png"))
    print("GIF:", gif_path, "| кадров:", len(frames))


if __name__ == "__main__":
    main()
