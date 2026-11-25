# AGENT-CORE — DEF-261122-01: `starCtx.createRadialGradient is not a function`

**Дата:** 2026-11-22, 09:00–09:20 MSK
**Симптом:** живой клиент Chrome/Windows, 3 одинаковых ошибки 21.11 20:05: `Uncaught TypeError: starCtx.createRadialGradient is not a function`.
**Режим:** правка в репозитории, **деплоя не было**.

---

## 1. Причина

Из `client-errors.json` (прод) видно точное место:

```
msg:   Uncaught TypeError: starCtx.createRadialGradient is not a function
src:   https://warbattleuniverse.com/js/solar.js?v=1276
line:  4527
stack: at solar.js:4527:53 → Array.forEach → drawStars (4527:13)
       at HTMLDocument.<anonymous> (solar.js:8916:18)
ua:    Chrome/145.0.0.0, Windows — не бот
ts:    1795280732 / 1795280734 / 1795280736 (три вызова drawStars)
```

- `starCtx` создаётся в `solar.js:4521`: `starCanvas ? starCanvas.getContext('2d') : null` — для `#starfield-canvas`.
- Градиент вызывался в `drawStars()` на `solar.js:4527` (туманности): `starCtx.createRadialGradient(...)`.
- Проверка `if (!starCtx) return;` **была**, поэтому `starCtx` — не `null`, а **объект без метода `createRadialGradient`**: `getContext('2d')` вернул не настоящий 2D-контекст (подмена на уровне страницы/расширения-«защитника canvas» или иной объект вместо CanvasRenderingContext2D). Для такого объекта старое `!starCtx` бесполезно — падение на первом же вызове метода.
- `drawStars` вызывается несколько раз (DOMContentLoaded + повторные вызовы у `solar.js:8916`), поэтому в лог попало 3 одинаковых записи.

Вывод: нужен не только `null`-guard, но и проверка **API контекста** перед использованием.

---

## 2. Что сделано (визуал не менялся)

`solar.js` (`src/galaktika.Web/wwwroot/js/solar.js` + зеркало `deploy-host/site/js/solar.js`, md5 совпадает):

1. **На этапе создания контекста** (`:4520-4526`): берём результат `getContext('2d')` и оставляем его, только если у него есть `fill` и (`arc` или `fillRect`). Иначе `starCtx = null`.
   ```js
   const starCtxRaw = (starCanvas && typeof starCanvas.getContext === 'function') ? starCanvas.getContext('2d') : null;
   const starCtx = (starCtxRaw && typeof starCtxRaw.fill === 'function' &&
       (typeof starCtxRaw.arc === 'function' || typeof starCtxRaw.fillRect === 'function')) ? starCtxRaw : null;
   ```
2. **В `drawStars()`** (`:4530-4564`):
   - `if (!starCtx) return;` — нет 2D-контекста → тихо выходим, интерфейс не ломаем;
   - `const canGrad = typeof starCtx.createRadialGradient === 'function';`
   - туманности: с градиентом — **как раньше** (цвета/стопы 1:1); без него — плоская заливка тем же цветом;
   - звёзды: `arc` + `fill`, а если контекст умеет только прямоугольники — `fillRect(s.x, s.y, s.r*2, s.r*2)`;
   - каждый элемент в `try/catch`: один сбойный вызов не роняет весь кадр;
   - `clearRect`/`beginPath`/`globalAlpha` вызываются только если они есть.
3. **Кэш-баст:** `solar.js?v=1276 → v=1277` в `deploy-host/site/index.html:228` и `app-lite/www/index.html:228`; `App.razor:122` `v=3542 → 3543`.

Там, где градиент работает (обычный браузер), код рисует ровно то же, что и раньше: те же два радиальных градиента и те же 1800 звёзд.

---

## 3. Проверка

### 3.1. Синтаксис
- `node --check solar.js` — **exit 0**; `node --check` по всем `wwwroot/js/*.js` — **без ошибок**.
- md5 `solar.js`: `605B4A33176A7E24CBA8A8CD032D529E` — `wwwroot` = `site`.

### 3.2. Браузер (CDP, headless Chrome 157, локальная копия `deploy-host/site`)

Стенд: `python -m http.server` + Chrome `--headless=new --remote-debugging-port=9337`.
Тест: `node tools/starfield_ctx_test.js 9337 http://127.0.0.1:<порт>/` — **exit 0**, 4/4; прогон повторён дважды (стабильно).

| Случай | Как эмулируется | Ошибок `starCtx` | Что нарисовано |
|---|---|---|---|
| **A. обычный 2D-контекст** | без подмен | **0** | пикселей звёзд **418–474**, альфа центра туманности **38**, canvas **3000×3000** — градиент работает, визуал не изменился |
| **B. `getContext('2d')` → null** | `HTMLCanvasElement.prototype.getContext` для `#starfield-canvas` | **0** | тихий выход, страница жива (`SHIPS` загружен) |
| **C. контекст без `createRadialGradient`** (arc/fill есть) | подменный объект | **0** | `arc` **1802**, `fill` **1802** — звёзды и туманности рисуются без градиента |
| **D. контекст только с `fillRect`** | подменный объект | **0** | `fillRect` **1800**, `fill` **1800** — звёзды рисуются прямоугольниками |

Во всех случаях страница исполняла `solar.js` (ожидание `typeof window.SHIPS === 'object'`), т.е. измерялась не пустая канва. Единственное «прочее» исключение в одном промежуточном прогоне (`Cannot read properties of undefined (reading '0')`) не воспроизвелось ни изолированно, ни при повторном прогоне — к `starCtx` отношения не имеет (в отчёте оставлено как транзиентное).

### 3.3. Чего не проверял
- Реальное окружение пострадавшего пользователя (Chrome 145 + его расширения): воспроизвёл класс проблемы подменой контекста, а не его точную причину.
- **Прод**: деплоя не было — ошибка исчезнет у клиентов только после выкладки (и после `v=1277`).

---

## 4. Файлы

| Файл | Изменение |
|---|---|
| `src/galaktika.Web/wwwroot/js/solar.js` | проверка API `starCtx`, fallback `fillRect`/плоская заливка, `try/catch` (`:4521-4564`) |
| `deploy-host/site/js/solar.js` | зеркало (md5 совпадает) |
| `deploy-host/site/index.html`, `app-lite/www/index.html` | `solar.js?v=1277` |
| `src/galaktika.Web/Components/App.razor` | `solar.js?v=3543` |
| `tools/starfield_ctx_test.js` | новый CDP-тест (4 случая) |
| `reports/AGENT-CORE-DEF03.md` | этот отчёт |

Прод не тронут: там прежний `solar.js` (md5 `C2FEBDA2…`) и `v=1276`.
