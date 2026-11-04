import http.client, ssl
ctx = ssl.create_default_context()
def get(path):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=30, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); data = r.read().decode("utf-8","replace"); c.close()
    return r.status, data
s, html = get("/")
print("index:", s, "| v629:", "solar.js?v=629" in html)
s, js = get("/js/solar.js?v=629")
print("solar.js:", s, len(js), "символов")
print("  панель ускорения только админу:", "currentUser.role === 'admin' ? 'flex' : 'none'" in js)
print("  ?debug ускоряет только админа:", "(DEV_MODE && currentUser && currentUser.role === 'admin') ? 'day' : 'real'" in js)
print("  безусловное включение панели:", "timeControl.style.display = 'flex';" in js)