import json
for p in [r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\src\data\data\users.json",
          r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\app-lite\data\users.json",
          r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\clean-users.json"]:
    raw = open(p, "rb").read()
    if raw.startswith(b"\xef\xbb\xbf"): raw = raw[3:]
    u = json.loads(raw.decode("utf-8"))[0]
    print(p.split("\\")[-2:], u["Hash"][:16], "...")