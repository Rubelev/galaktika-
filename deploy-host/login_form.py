import re, ssl, urllib.request
CTX = ssl._create_unverified_context()
html = urllib.request.urlopen("https://server249.hosting.reg.ru:1500/ispmgr", timeout=30, context=CTX).read().decode("utf-8","replace")
for m in re.finditer(r"<form[^>]*>", html): print("FORM:", m.group(0)[:200])
for m in re.finditer(r"<input[^>]*>", html): print("INPUT:", m.group(0)[:160])
for m in re.finditer(r"<script[^>]*src=\"([^\"]+)\"", html): print("SCRIPT:", m.group(1))