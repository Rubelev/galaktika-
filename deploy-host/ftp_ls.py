import ftplib
import sys

host, user, password = sys.argv[1], sys.argv[2], sys.argv[3]
path = sys.argv[4] if len(sys.argv) > 4 else "/"

ftp = ftplib.FTP()
ftp.connect(host, 21, timeout=30)
ftp.login(user, password)
ftp.set_pasv(True)
print("connected:", ftp.getwelcome())
print("pwd:", ftp.pwd())
if path:
    ftp.cwd(path)
    print("cwd:", ftp.pwd())
for name, facts in ftp.mlsd():
    kind = facts.get("type", "?")
    size = facts.get("size", "")
    print("%-6s %10s  %s" % (kind, size, name))
ftp.quit()
