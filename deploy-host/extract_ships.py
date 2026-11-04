import json, re
src = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\src\galaktika.Web\wwwroot\js\solar.js"
text = open(src, encoding="utf-8").read()
start = text.index("const SHIPS = {")
end = text.index("};", start)
block = text[start:end]
ships = {}
for m in re.finditer(r"(\w+):\s*\{([^{}]*?price:\s*(\d+)[^{}]*?)parts:\s*\{([^}]*)\}", block):
    sid, _, price, parts = m.group(1), m.group(2), int(m.group(3)), m.group(4)
    parsed = {}
    for pm in re.finditer(r"(\w+):\s*(\d+)", parts):
        parsed[pm.group(1)] = int(pm.group(2))
    ships[sid] = {"price": price, "parts": parsed}
print(json.dumps(ships, ensure_ascii=False, indent=1))