import ssl, urllib.request
ctx = ssl.create_default_context()
base = "https://warbattleuniverse.com"
def get(p):
    with urllib.request.urlopen(urllib.request.Request(base+p, headers={"User-Agent":"probe"}), timeout=30, context=ctx) as r:
        return r.status, r.read()
s, html = get("/")
t = html.decode("utf-8", "replace")
print("index:", s, len(html), "| legend скрыт:", 'id="legend-overlay" class="legend-overlay" style="display:none;"' in t)
print("           solar v626:", "solar.js?v=626" in t)
s, js = get("/js/solar.js?v=626")
j = js.decode("utf-8", "replace")
print("solar.js:", s, len(js), "| авто-запуск убран:", "Вступление больше не запускается" in j)
print("           остались вызовы startLegend в login/register:", j.count("startLegend()"))