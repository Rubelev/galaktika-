# AGENT-CORE — DEF-261118-01: фильтр ботов в client-errors

**Дата:** 2026-11-18, 09:00–09:15 MSK
**Симптом:** аудит падал из-за записи в `client-errors`: `Uncaught TypeError: Cannot read properties of undefined (reading '0')`, UA = Nexus 5X + Googlebot/Lighthouse (не живой игрок).
**Режим:** правка в репозитории, **деплоя не было**.

---

## 1. Что сделано

Правка только в `js/errlog.js`; прочая логика (баннер, проверка модулей, лимит 5 отправок) не менялась.

**Фильтр — в самом начале `report()`** (до счётчика и до `fetch`), строки `errlog.js:8-26`:

```js
var BOT_RE = /bot|crawler|spider|HeadlessChrome|Lighthouse|PageSpeed|Googlebot|bingbot|YandexBot|AhrefsBot|SemrushBot|python-requests|curl\/|wget/i;

function isBot() {
    try { if (BOT_RE.test(navigator.userAgent || '')) return true; } catch (e) { }
    try {
        var q = String(location.search || '').toLowerCase();
        if (q.indexOf('lighthouse') >= 0 || q.indexOf('pagespeed') >= 0) return true;
    } catch (e) { }
    return false;
}

function report(msg, src, line, stack) {
    if (isBot()) return;        // бот/аудит: ошибку не отправляем и не считаем
    if (sent >= 5) return;      // не заваливаем сервер
    ...
```

- UA-фильтр: `bot|crawler|spider|HeadlessChrome|Lighthouse|PageSpeed|Googlebot|bingbot|YandexBot|AhrefsBot|SemrushBot|python-requests|curl/|wget` (регистронезависимо) — ровно список из задачи.
- URL-фильтр: `location.search` содержит `lighthouse` или `pagespeed` → не отправляем.
- Обе проверки обёрнуты в `try/catch`: если `navigator`/`location` недоступны, отправка работает как раньше.
- Отсечённые ошибки не увеличивают счётчик `sent` (не съедают лимит 5 для реальных ошибок).

**Кэш-баст** (иначе клиенты получат старый `errlog.js`):
- `deploy-host/site/index.html:167` и `app-lite/www/index.html:167`: `errlog.js?v=4` → **v=5**;
- `src/galaktika.Web/Components/App.razor:61`: `v=4` → **v=5**.

---

## 2. Проверка

### 2.1. Синтаксис
- `node --check errlog.js` — **exit 0**.
- Копии совпадают: md5 `83BD47E45AF84016386EB360E007EA77` — `src/galaktika.Web/wwwroot/js/errlog.js` = `deploy-host/site/js/errlog.js` (деплой берёт js из `wwwroot`, см. `deploy.ps1:100-111`).

### 2.2. Браузер (CDP, headless Chrome 157, локальная копия `deploy-host/site`)

Стенд: `python -m http.server` + Chrome `--headless=new --remote-debugging-port=9336`, свежий профиль.
Тест: `node tools/errlog_bot_filter_test.js 9336 http://127.0.0.1:55438/` — **exit 0**.

Методика: на каждый случай подменяем UA (`Network.setUserAgentOverride`), открываем страницу, шлём `window` `error` с уникальной меткой и считаем `POST /api/clientlog`, в теле которого есть метка.

| Случай | Ожидание | Отправок | Результат |
|---|---|---|---|
| UA Googlebot (Nexus 5X Build/MMB29P) | 0 | **0** | OK |
| UA Chrome-Lighthouse | 0 | **0** | OK |
| UA HeadlessChrome | 0 | **0** | OK |
| UA curl/8.4.0 | 0 | **0** | OK |
| обычный UA + `?lighthouse=1` | 0 | **0** | OK |
| обычный UA + `?pagespeed=1` | 0 | **0** | OK |
| **обычный UA (контроль)** | 1 | **1** | OK |

Контрольный случай подтверждает, что канал не сломан: ушло тело
`{"msg":"DEF02-…","src":"def02.js","line":42,"stack":"Error: DEF02-…` — т.е. фильтр режет только ботов/аудит, а реальные ошибки по-прежнему логируются. `typeof window.__booted === 'boolean'` во всех случаях — `errlog.js` загружался и исполнялся.

Итого: **7/7 случаев, 0 провалов**.

### 2.3. Чего не проверял
- **Прод**: деплоя не было; новые ботовые записи в `client-errors.json` прекратятся только после выкладки, аудит 47/47 — тоже.
- `app-lite/www/js/errlog.js` — старая копия (4175 Б, md5 `4A2B9F78…`, без фильтра). В деплое не участвует (`tar` собирается из `deploy-host/site`, js копируются из `wwwroot`), поэтому не трогал; если app-lite где-то запускается как самостоятельный сайт — там фильтра не будет.
- Реальные мобильные устройства/WebView — не проверял; логика чистого JS.

---

## 3. Файлы

| Файл | Изменение |
|---|---|
| `src/galaktika.Web/wwwroot/js/errlog.js` | фильтр `isBot()` в начале `report()` (`:8-26`) |
| `deploy-host/site/js/errlog.js` | зеркало (md5 совпадает) |
| `deploy-host/site/index.html`, `app-lite/www/index.html` | `errlog.js?v=5` |
| `src/galaktika.Web/Components/App.razor` | `errlog.js?v=5` |
| `tools/errlog_bot_filter_test.js` | новый CDP-тест (7 случаев) |
| `reports/AGENT-CORE-DEF02.md` | этот отчёт |

Прод не тронут: там `errlog.js` без фильтра и `v=4`.
