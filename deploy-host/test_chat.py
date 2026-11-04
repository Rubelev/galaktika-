import json, ssl, time, urllib.error, urllib.request
ctx = ssl.create_default_context()
base = "https://warbattleuniverse.com"
def call(path, payload=None, token=None):
    h = {"User-Agent":"probe","Content-Type":"application/json"}
    if token: h["X-Auth-Token"] = token
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base+path, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

s, d = call("/api/chat/list")
print("пустой чат:", s, len(d.get("messages", [])))

s, d = call("/api/auth/register", {"email":"chat1@test.ru","password":"test123456","lastName":"","gameName":"Говорун","faction":"earth"})
if s != 200: s, d = call("/api/auth/login", {"email":"chat1@test.ru","password":"test123456"})
tok = d["token"]
s, d = call("/api/chat/send", {"text":"Привет из 2226"}, tok)
print("отправка:", s, d.get("message", {}).get("name"), "|", d.get("message", {}).get("text"))
s, d = call("/api/chat/send", {"text":"Второе подряд"}, tok)
print("антифлуд (сразу второе):", s, d.get("error"))
time.sleep(3.2)
s, d = call("/api/chat/send", {"text":"После паузы"}, tok)
print("после паузы:", s, bool(d.get("message")))
s, d = call("/api/chat/list")
print("в чате сообщений:", len(d.get("messages", [])), "| последнее:", d["messages"][-1]["text"])
s, d = call("/api/chat/send", {"text":"x" * 400}, tok)
print("длинное сообщение:", s, d.get("error"))
s, d = call("/api/chat/send", {"text":"без токена"})
print("без токена:", s, d.get("error"))