import re, json, os
ROOT = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika"
p = os.path.join(ROOT, "reports", "_a1.html")
h = open(p, encoding="utf-8", errors="replace").read()
out = []
out.append(f"len={len(h)}")
for k in ["window.Motion","Motion","WorldCoords","__poseCache","SceneBridge","ship-marker","trade-path","fleet-traffic","planet","data-planet-id","app-build","blazor","_framework"]:
    out.append(f"{k}: count={h.count(k)} first={h.find(k)}")
i = h.find("ship-marker")
out.append("=== around ship-marker (%d) ===" % i)
out.append(repr(h[max(0,i-800):i+1200]))
out.append("=== head 3000 ===")
out.append(h[:3000])
open(os.path.join(ROOT,"reports","_a_inspect.txt"),"w",encoding="utf-8").write("\n".join(out))
print("ok")
