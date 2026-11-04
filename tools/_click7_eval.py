# -*- coding: utf-8 -*-
import json, os

R = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\reports"
rows = json.load(open(os.path.join(R, "_click7.json"), encoding="utf-8"))
out = []
def w(s=""):
    out.append(str(s))

def changed(a, b, key):
    return json.dumps(a.get(key), ensure_ascii=False) != json.dumps(b.get(key), ensure_ascii=False)

def verdict(r):
    g = r["group"]
    before, after = r["before"], r["after"]
    geom = r["geom"] or {}
    if geom.get("offscreen"):
        return "вне кадра"
    if geom.get("invisible"):
        return "невидим"
    cam_changed = changed(before, after, "cam")
    ovl_new = after["overlays"] and after["overlays"] != before["overlays"]
    if g == "planet":
        if after["globe"] != "none" or "globe-modal" in (after["overlays"] or "") or cam_changed:
            return "успех"
        return "нет эффекта"
    if g == "moon":
        if ovl_new or after["globe"] != "none":
            return "успех"
        return "нет эффекта"
    if g == "portal":
        return "успех" if "systems-modal" in (after["overlays"] or "") else "нет эффекта"
    if g == "asteroid":
        return "успех" if after["toast"] else "нет эффекта"
    if g == "ship":
        if any(k in (after["overlays"] or "") for k in ("fleet-card", "ship-flight")):
            return "успех"
        return ("камера без карточки" if cam_changed else "нет эффекта")
    if g == "panel":
        return "успех" if cam_changed else "нет эффекта"
    if g == "check":
        return "успех" if (changed(before, after, "checks") or changed(before, after, "body")) else "нет эффекта"
    if g == "menu":
        if ovl_new or "resources-panel" in (after.get("body") or ""):
            return "успех"
        return "нет эффекта"
    if g == "empty":
        return "успех" if not (changed(before, after, "overlays") or changed(before, after, "cam") or changed(before, after, "body") or changed(before, after, "checks") or after["toast"]) else "ложный эффект"
    return "?"

ok = 0
w("| № | Цель | Центр (x,y) | elementFromPoint | Ожидаемое | Факт | Итог |")
w("|---|---|---|---|---|---|---|")
for i, r in enumerate(rows, 1):
    v = verdict(r)
    if v == "успех":
        ok += 1
    geom = r["geom"] or {}
    top = (geom.get("stack") or ["—"])[0]
    b, a = r["before"], r["after"]
    fact = []
    if a["globe"] != "none":
        fact.append("globe=" + a["globe"])
    if a["overlays"] and a["overlays"] != b["overlays"]:
        fact.append("оверлей " + a["overlays"])
    if changed(b, a, "cam"):
        fact.append("scale %s→%s rotX %s→%s rotZ %s→%s" % (b["cam"]["scale"], a["cam"]["scale"], b["cam"]["rotX"], a["cam"]["rotX"], b["cam"]["rotZ"], a["cam"]["rotZ"]))
    if changed(b, a, "checks"):
        fact.append("checked: %s → %s" % (b["checks"], a["checks"]))
    if changed(b, a, "body"):
        fact.append("body: %s → %s" % (b["body"], a["body"]))
    if a["toast"]:
        fact.append("toast: " + a["toast"])
    if not fact:
        fact.append("без изменений")
    w("| %d | %s | %s | `%s` | %s | %s | %s |" % (
        i, r["name"], ("%d, %d" % (geom["x"], geom["y"])) if geom.get("x") is not None else "—",
        top, {"planet": "глобус/наезд", "moon": "карточка/вид", "portal": "окно систем", "asteroid": "сообщение",
              "ship": "карточка борта", "panel": "изменение камеры", "check": "смена состояния",
              "menu": "окно/панель", "empty": "ничего не открывать"}.get(r["group"], "?"),
        "; ".join(fact)[:150], v))
w("")
w("ИТОГО успех: %d из %d" % (ok, len(rows)))
print("\n".join(out))
open(os.path.join(R, "_click7_table.md"), "w", encoding="utf-8").write("\n".join(out))
