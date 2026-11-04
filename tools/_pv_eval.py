# -*- coding: utf-8 -*-
import json, os

R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
A = json.load(open(os.path.join(R, "_pv_all.json"), encoding="utf-8"))
M = {r["id"]: r for r in json.load(open(os.path.join(R, "_pv_matrix.json"), encoding="utf-8"))}
C = json.load(open(os.path.join(R, "_pv_cycle.json"), encoding="utf-8"))
RET = {r["id"]: r for r in json.load(open(os.path.join(R, "_pv_return.json"), encoding="utf-8"))}
MO = {r["name"]: r for r in json.load(open(os.path.join(R, "_pv_moons.json"), encoding="utf-8"))}
RU = {"mercury": "Меркурий", "venus": "Венера", "earth": "Земля", "mars": "Марс", "jupiter": "Юпитер",
      "saturn": "Сатурн", "uranus": "Уран", "neptune": "Нептун", "pluto": "Плутон"}
CYC = {c["id"]: c for c in C["cycle"]}

out = []
def w(s=""):
    out.append(str(s))

w("планет: %d (%s)" % (len(A["list"]["planets"]), ", ".join(p["id"] for p in A["list"]["planets"])))
w("лун: %d (%s)" % (len(A["list"]["moons"]), ", ".join(m["name"] for m in A["list"]["moons"])))
w("")
w("| Тело | id | ?pv=<id> | двойной клик → спуск | меню/карточка | Время, с | Ошибки | Вердикт |")
w("|---|---|---|---|---|---|---|---|")
for r in A["pv"]:
    body = RU.get(r["id"], r["name"]) if r["kind"] == "планета" else r["name"]
    pvok = "✓ поверхность" if (r["state"]["pv"] and r["state"]["blocksVis"]) else "✗"
    m = M.get(r["id"], {})
    desc = "✓ новая вкладка ?pv=%s" % r["id"] if m.get("newTab") else ("глобус: %s" % m.get("globeOpened", "?"))
    menu = "— (карточки нет; глобус = карточка)"
    errs = "нет"
    if r["state"]["errBanner"]:
        errs = "баннер x%d" % r["state"]["errBanner"]
    verdict = "работает" if (r["state"]["pv"] and r["state"]["blocksVis"] and m.get("newTab")) else "проверить"
    w("| %s | %s | %s | %s | %s | %s | %s | %s |" % (body, r["id"], pvok, desc, menu, r["surfaceSec"], errs, verdict))
w("")
w("=== ПОЛНЫЙ ЦИКЛ (выборка) ===")
w("| Тело | Вход | Поверхность | Возврат «↑ К глобусу» | Повторный спуск | tilt/zoom/canvas |")
w("|---|---|---|---|---|---|")
for c in C["cycle"]:
    body = RU.get(c["id"], c["name"])
    cyc = c["cycles"]
    ret = "выход на карту, PV-слой остался видим (blocksVis=true), глобус не открыт" if cyc else "—"
    rep = "недоступен (глобус не открыт)" if cyc else "—"
    vs = [v for v in C["variants"] if v["id"] == c["id"]]
    vtxt = "tilt %s / zoom %s / canvas %s" % (
        "✓" if any(x["variant"] == "tilt" and x["pv"] for x in vs) else "✗",
        "✓" if any(x["variant"] == "zoom" and x["pv"] for x in vs) else "✗",
        "✓" if any(x["variant"] == "canvas" and x["pv"] for x in vs) else "✗")
    w("| %s | ✓ ?pv=%s (%s с) | ✓ | %s | %s | %s |" % (body, c["id"], c["surfaceSec"], ret, rep, vtxt))
w("")
w("=== ВАРИАНТЫ (24) ===")
for v in C["variants"]:
    w("%-10s %-7s surface=%s pv=%s blocks=%s solar=%s canv=%d" % (v["name"], v["variant"], v["surfaceSec"], v["pv"], v["blocks"], v["solar"], v["canv"]))
w("")
w("=== ВОЗВРАТ И ПОВТОРНЫЙ СПУСК (2 тела) ===")
for k, r in RET.items():
    w("%s: вход %.1f с; после «К глобусу» (1 с): %s; (5 с): %s; повторный спуск: %s, новая вкладка %s, поверхность в ней: %s" % (
        k, r["entrySec"], json.dumps(r["afterToGlobe_1s"]), json.dumps(r["afterToGlobe_5s"]),
        r["descent"], r["newTab"], (r["surfaceInNewTab"] or {}).get("pv")))
w("")
w("=== ДВОЙНОЙ КЛИК ПО ЛУНАМ ===")
for k, r in MO.items():
    w("%s: после двойного клика %s" % (k, json.dumps(r.get("afterDbl"))))

open(os.path.join(R, "_pv_table.md"), "w", encoding="utf-8").write("\n".join(out))
print("\n".join(out))
