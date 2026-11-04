import ftplib
variants = [
    "xZbjCI5SdM7049mO",
    "xZbjCI5SdM7049m0",
    "xZbjCI5SdM7049m\u041e",   # кириллическая О
    "xZbjCI5Sd\u041c7049mO",   # кириллическая М
]
for pwd in variants:
    try:
        f = ftplib.FTP(); f.connect("31.31.196.115", 21, timeout=20); f.login("u3699164", pwd)
        print("OK ->", repr(pwd), "| pwd:", f.pwd(), "|", f.nlst()[:6])
        f.quit(); break
    except Exception as e:
        print("fail", repr(pwd), type(e).__name__, str(e)[:50])