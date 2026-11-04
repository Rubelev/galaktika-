import ftplib
import socket
import ssl
import sys

USER = "u3699164"
PWD = "xZbjCI5SdM7049mO"
HOSTS = [
    "server249.hosting.reg.ru",
    "31.31.196.115",
    "ftp.warbattleuniverse.store",
    "warbattleuniverse.store",
]


def try_plain(host):
    try:
        ftp = ftplib.FTP()
        ftp.connect(host, 21, timeout=20)
        ftp.login(USER, PWD)
        names = ftp.nlst()[:10]
        ftp.quit()
        return "OK plain, файлов: %d, первые: %s" % (len(names), names)
    except Exception as e:
        return "plain: %s: %s" % (type(e).__name__, str(e)[:80])


def try_tls(host):
    try:
        ctx = ssl._create_unverified_context()
        ftp = ftplib.FTP_TLS(context=ctx)
        ftp.connect(host, 21, timeout=20)
        ftp.auth()
        ftp.login(USER, PWD)
        ftp.prot_p()
        names = ftp.nlst()[:10]
        ftp.quit()
        return "OK tls, файлов: %d, первые: %s" % (len(names), names)
    except Exception as e:
        return "tls: %s: %s" % (type(e).__name__, str(e)[:80])


for h in HOSTS:
    try:
        ip = socket.gethostbyname(h)
    except Exception as e:
        print(h, "-> DNS:", e)
        continue
    print("==", h, "(", ip, ")")
    print("   ", try_plain(h))
    print("   ", try_tls(h))
