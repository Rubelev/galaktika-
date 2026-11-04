import os, tarfile
src = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\site"
dst = r"D:\Users\a.bulatov\Documents\deepseek-harness\default-workspace\galaktika\deploy-host\galaktika-site.tar.gz"
skip_dirs = {"data"}
with tarfile.open(dst, "w:gz") as tar:
    for root, dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        if rel.split(os.sep)[0] in skip_dirs:
            dirs[:] = []
            continue
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.relpath(full, src).replace("\\", "/")
            tar.add(full, arcname=arc)
print("готово:", dst, round(os.path.getsize(dst)/1024/1024, 1), "МБ")