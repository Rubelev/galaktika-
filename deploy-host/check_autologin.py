import http.client, ssl
ctx = ssl.create_default_context()
def get(path):
    c = http.client.HTTPSConnection("warbattleuniverse.com", timeout=30, context=ctx)
    c.request("GET", path, headers={"User-Agent":"probe"})
    r = c.getresponse(); d = r.read().decode("utf-8","replace"); c.close()
    return r.status, d
s, html = get("/")
print("index:", s, "| v630:", "solar.js?v=630" in html)
s, js = get("/js/solar.js?v=630")
print("solar.js:", s, len(js), "символов")
print("  автовход по ?login= удалён:", "autoLoginEmail" not in js)
print("  обработка параметра осталась (сброс):", "urlParams.get('login')" in js)
print("  упоминаний 'login' в автовходе:", js.count("autoLoginEmail"))