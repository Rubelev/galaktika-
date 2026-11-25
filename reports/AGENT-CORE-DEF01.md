# AGENT-CORE — DEF-261116-01: `showShipCard is not defined`

**Дата:** 2026-11-16, 09:00–09:15 MSK
**Симптом:** живой клиент, `Uncaught ReferenceError: showShipCard is not defined`, url `/`, аудит 46/47.
**Режим:** правка в репозитории, **деплоя не было**. Прод не тронут.

---

## 1. Причина (точная)

`solar.js` — обычный (не модульный) скрипт, но `function showShipCard` была объявлена **внутри `updateFleetDots()`**, а не на верхнем уровне:

| Что | Где (до фикса) |
|---|---|
| `function updateFleetDots() {` | `solar.js:8572` |
| `return;` — ранний выход, дальше мёртвый код | `solar.js:8576` |
| `showShipCard(...)` в обработчике двойного клика | `solar.js:4903` |
| `function showShipCard(f) { … }` — **внутри** `updateFleetDots`, после `return` | `solar.js:8646-8674` |
| одноимённый IIFE-обработчик одиночного клика — тоже после `return` | `solar.js:8623-8644` |

Следствия:
1. Функция имеет **функциональную область видимости** `updateFleetDots`, а не глобальную. В `window` её нет: в браузере `typeof window.showShipCard === 'undefined'`, `typeof showShipCard === 'undefined'` (при этом `window.SHIPS === 'object'` — сам `solar.js` загружен и выполняется, дело не в 404/кэше).
2. Обработчик двойного клика (`solar.js:4886-4911`) зарегистрирован на верхнем уровне и при вызове ищет `showShipCard` в своей цепочке областей видимости → **ReferenceError**.
3. Блок `8623-8644` (регистрация одиночного клика) никогда не выполняется — `window.__fleetClickBound` остаётся `undefined` (проверено в браузере). Одиночный клик при этом работает через отдельный файл **`ship-card.js`** (свой обработчик, свой `#ship-card`), поэтому баг незаметен, пока пользователь не сделает двойной клик/быстрый повтор.

Причина появления: когда старые маркеры флотов отключили (`return;` в начале `updateFleetDots`), блок карточки и обработчик остались в теле функции ниже `return` — код стал недостижим, а объявление функции — локальным.

**Воспроизведено в браузере (CDP, до фикса):** `typeof window.showShipCard = undefined`; двойной клик по `.ship-marker` с `_fleet` → `ReferenceError: showShipCard is not defined`, карточка не открывается.

---

## 2. Что сделано (логика не менялась)

`solar.js` (`src/galaktika.Web/wwwroot/js/solar.js` и зеркало `deploy-host/site/js/solar.js`, SHA256/MD5 идентичны):

- `function showShipCard(f)` **перенесена на верхний уровень** — перед `function updateFleetDots()` (`:8578-8606`), тело 1:1, без изменений;
- сразу после объявления: `window.showShipCard = showShipCard;` (`:8609`) — явная глобальная ссылка, независимая от порядка;
- вызовы переведены на `window.showShipCard(...)`: `:4904` (двойной клик) и `:8681` (мёртвый ныне блок одиночного клика, оставлен как есть);
- мёртвый код после `return;` в `updateFleetDots` **не удалял** (не менять логику); он безвреден, одиночный клик обслуживает `ship-card.js`.

Кэш-баст (иначе клиенты после деплоя получат старый `solar.js`):
- `deploy-host/site/index.html:228` и `app-lite/www/index.html:228`: `solar.js?v=1274` → **v=1275**;
- `src/galaktika.Web/Components/App.razor:122`: `v=3541` → **v=3542**.

---

## 3. Проверка

### 3.1. Синтаксис
- `node --check solar.js` — **exit 0**;
- `node --check` по всем `wwwroot/js/*.js` — **100/100 файлов** без ошибок (как гейт деплоя);
- после правки: md5 `solar.js` = `C2FEBDA264C204CE8F2C223603242870` (wwwroot = site).

### 3.2. Браузер (CDP, headless Chrome 157, локальная статик-копия `deploy-host/site`)

Стенд: `python -m http.server` + Chrome `--headless=new --remote-debugging-port`, свежий профиль.
Тест: `node tools/ship_card_click_test.js 9334 http://127.0.0.1:<порт>/?shot=1` — **exit 0**.

| Проверка | До фикса | После фикса |
|---|---|---|
| `typeof window.showShipCard` | `undefined` | **`function`** |
| `typeof showShipCard` (глобально) | `undefined` | **`function`** |
| Двойной клик по `.ship-marker._fleet` (ветка `solar.js:4904`) | `ReferenceError`, карточки нет | **карточка есть** (`#ship-card`, z-index 100006), ошибок **0** |
| Одиночный клик по `.ship-marker--fleet` (`ship-card.js`) | карточка есть, ошибка в консоли от второго обработчика | карточка есть (z-index 100007), ошибок **0** |
| Двойной клик по маркеру без `_fleet` | — | ошибок **0** |
| Исключений в консоли за прогон | 1 (ReferenceError) | **0** |

Скриншоты не снимал: проверка функциональная (карточка в DOM + отсутствие исключений), правило 22 относится к визуальным задачам.

### 3.3. Что НЕ проверено
- **Прод**: деплоя не было; аудит 46/47 и `client-errors.json` перепроверить можно только после выкладки и нового клика живого клиента.
- Браузерный тест шёл на **статик-копии** без `api.php`: маркеры флота синтетические (создаются в DOM с `_fleet`), а не из живого флота. Логика обработчика от источника маркеров не зависит.
- Флот с реальными `ship-card.js` + `solar.js` на живом сервере — после деплоя.

---

## 4. Файлы

| Файл | Изменение |
|---|---|
| `src/galaktika.Web/wwwroot/js/solar.js` | перенос `showShipCard` на верхний уровень, `window.showShipCard`, вызовы через `window` |
| `deploy-host/site/js/solar.js` | зеркало (md5 совпадает) |
| `deploy-host/site/index.html`, `app-lite/www/index.html` | `solar.js?v=1275` |
| `src/galaktika.Web/Components/App.razor` | `solar.js?v=3542` |
| `tools/ship_card_click_test.js` | новый CDP-тест (регрессия DEF-261116-01) |
| `reports/AGENT-CORE-DEF01.md` | этот отчёт |

Прод не менялся: на сервере по-прежнему `solar.js` с md5 `D8F5568F…` (тот же, что был локально до правки) и `index.html` с `v=1274`.
