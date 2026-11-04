import io, os
src = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\src\data\data\users.json"
dst = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\users-nobom.json"
raw = open(src, "rb").read()
if raw.startswith(b"\xef\xbb\xbf"): raw = raw[3:]
open(dst, "wb").write(raw)
print("ok", len(raw), "bytes")