import ftplib, socket, ssl
tests = [("u3699164","xZbjCI5SdM7049mO"), ("u3699164","Nnt49!!n")]
for u,p in tests:
    try:
        f = ftplib.FTP(); f.connect("31.31.196.115", 21, timeout=20); f.login(u,p)
        print("OK", u, "->", f.pwd(), f.nlst()[:5]); f.quit()
    except Exception as e:
        print("FAIL", u, type(e).__name__, str(e)[:70])
# что на 22 порту
try:
    s = socket.create_connection(("31.31.196.115", 22), timeout=10)
    print("SSH banner:", s.recv(120).decode("utf-8","replace").strip())
    s.close()
except Exception as e:
    print("SSH:", e)