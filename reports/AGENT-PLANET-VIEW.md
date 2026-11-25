# AGENT-PLANET-VIEW — почему `?pv=adrasteya` показывает «Земля · гравитационная платформа»

- **Дата/время:** 2026-11-05, 08:10–08:25 MSK.
- **Сайт:** https://warbattleuniverse.com (build `202611011025`), `js/planetview.js?v=10`, `js/pv-boot.js?v=2`, `js/solar.js?v=1268`, `js/catalog.js?v=5`.
- **Локальный исходник:** `galaktika/src/galaktika.Web/wwwroot/js/planetview.js` — **байт-в-байт совпадает с задеплоенным** (SHA256 `1FCA52A2…C0C6`, 41 986 байт, 794 строки), поэтому выводы по коду применимы и к локальной копии, и к проду.
- **Режим:** только диагностика. Код, конфиги и база не менялись, деплой не выполнялся.
- **Метод:** разбор кода + живые прогоны Chrome (headless, CDP `Runtime.evaluate`) на `?pv=<id>&shot=1&onb=1`, замер числа `#blocks3d-wrap` / `#pv-bar` во времени, перехват вызовов `PlanetView.open`.

## Вердикт

Заголовок «Земля» — **не следствие второго экземпляра**. Это отсутствие `.profile` у записи мира, взятой из каталога:

> `WORLDS` хранит два разных формата записи: `{id, name, profile}` (ручная таблица профилей) и «голый» профиль `{id, name, color, palette…}` (миры из `CATALOG`). `planetScene()` читает `world.profile`, у каталожного мира его нет → срабатывает умолчание `WORLD_PROFILES.earth` → «Земля».

Второй экземпляр вида **реально существует** (2 × `#blocks3d-wrap`, 2 × `#pv-bar`), но он рисует тот же ошибочный объект: у обоих инстансов заголовок «Земля». Его источник — не второй загрузчик, а собственный «самолечащий» таймер `planetview.js`, который переоткрывает вид через 400 мс, хотя штатный спуск занимает ~780 мс + асинхронную загрузку 3D.

Оба дефекта независимы и лечатся двумя правками в одном файле.

## Доказательства из кода

### 1. Два формата записи мира (корень «Земли»)

| Место | Код | Что даёт |
|---|---|---|
| `planetview.js:173-175` | `var WORLDS = Object.keys(WORLD_PROFILES).map(function (id) { return { id: id, name: WORLD_PROFILES[id].name, profile: WORLD_PROFILES[id] }; });` | формат **A**: `{id, name, profile}` |
| `planetview.js:705-715` | `WORLDS.push(profileFromCatalog(b.id));` (строка **712**) | формат **B**: пушится сам профиль, без обёртки `.profile` |
| `planetview.js:259` | `world = WORLDS.filter(...)[0] \|\| profileFromCatalog(worldId) \|\| WORLDS[0]` | обе ветки дают формат B (или, в третьей, Землю) |
| `planetview.js:475` | `var profile = world.profile \|\| WORLD_PROFILES.earth;` | у формата B `.profile` → `undefined` → **Земля** |
| `planetview.js:626` | `title: (nightOn ? '🌙 ' : '🌍 ') + profile.name + ' · гравитационная платформа'` | имя в заголовке берётся из **профиля**, а не из мира |
| `blocks3d.js:142-145` | `title.textContent = opts.title \|\| 'Блочный конструктор'` | это и есть видимый `<b>` в шапке 3D — единственная точка вывода заголовка |

`profileFromCatalog()` (`planetview.js:655-701`) для `adrasteya` отдаёт арена-профиль **без** поля `profile`:

```js
// planetview.js:661-676
var isArena = (b && b.role === 'arena') || worldId === 'adrasteya';
if (isArena) {
    return { id: worldId, arena: true, name: 'Тарсис · арена гонок (Адрастея)', color: '#8a7a68', … };
}
```

Каталог действительно содержит этот мир (`catalog.js:2`):
`{"id":"adrasteya","name":"Адрастея","class":"moon","radius_km":8.0,"color":"#d8c070","type":"moon_rock","role":"arena","parent":"jupiter","system":"sol"}`

Из-за того же промаха **мёртв весь арена-рендер**: ветки `if (profile.arena)` в `buildTerrain()` (`planetview.js:338-357` и `360-362` — кратеры, каньон, соляные пустоши, серпантин, «нет зелени и воды») не исполняются никогда, потому что в `planetScene` приходит профиль Земли. Отсюда же одинаковые кадры у 12 тел в отчёте `agents-audit-19.md` (дефект №1).

### 2. Второй экземпляр вида (подтверждён, но не он виноват в имени)

`planetview.js:231-244` — сторож «вид закрылся сам, откроем ещё раз»:

```js
if (!window.__pvWatch) {
    window.__pvWatch = setInterval(function () {
        if (!window.__pvOpenedAt) return;
        if (Date.now() - window.__pvOpenedAt > 5000) { clearInterval(...); return; }
        var w = document.getElementById('blocks3d-wrap');
        if (!w && !window.__pvUserExit && !window.__pvRetried &&
            Date.now() - window.__pvOpenedAt < 3000) {
            window.__pvRetried = true;
            try { open(worldId); } catch (e) { }      // ← второй полный проход
        }
    }, 400);
}
```

Спуск (`planetview.js:285-299`) создаёт оболочку только через **780 мс** после `open()`, а сторож проверяет уже через **400 мс** → всегда видит «пусто» → переоткрывает. Дубликат нечем сдержать:

- `planetScene()` (`planetview.js:477-478`, `572`) каждый раз создаёт **новый** `#pv-bar` и **не удаляет** прежний;
- `Blocks3D.open()` (`blocks3d.js:129-135`, `199`) каждый раз создаёт **новый** `#blocks3d-wrap` и **не удаляет** прежний;
- в `open()` нет проверки «этот мир уже открыт» (`planetview.js:225`).

## Эмпирика (живой прогон, Chrome + CDP)

### Матрица заголовков (реальная загрузка, 12 с после старта)

| `?pv=` | `#pv-bar` | `#blocks3d-wrap` | заголовок 3D |
|---|---|---|---|
| `earth` | 2 | 2 | 🌍 **Земля** · гравитационная платформа |
| `mars` | 2 | 2 | 🌍 **Марс** · гравитационная платформа |
| `vesta` | 2 | 2 | 🌍 **Земля** · гравитационная платформа ← дефект |
| `sedna` | 2 | 2 | 🌍 **Земля** · гравитационная платформа ← дефект |
| `adrasteya` | 2 | 2 | 🌍 **Земля** · гравитационная платформа ← дефект |
| `warclon` | 2 | 2 | 🌍 **Земля** · гравитационная платформа ← дефект |

Тела из ручной таблицы профилей (`earth`, `mars`) — верно; тела, пришедшие из каталога, — Земля. Совпадает с `agents-audit-19.md` (12 тел, «но это Земля»).

### Состояние живой страницы `?pv=adrasteya`

```
pvWorld   = "adrasteya"      pvRequested = "adrasteya"     data-pv = "adrasteya"
bars      = 2                wraps       = 2               __pvClosedBy = ""   (ничего не удаляли)
#pv-bar select (оба) selectedIndex → «Тарсис · арена гонок (Адрастея)»   ← id разрезолвлен верно
#pv-bar span     → «🌍 Земля · горизонт из блоков…» ×2
#blocks3d-wrap b → «🌍 Земля · гравитационная платформа» ×2
```

Ключевое — форма записи в `PlanetView.worlds` (значения из живой страницы):

```json
adrasteya: { keys: ["id","arena","name","color","hills","fog","fogNear","fogFar","sky","palette"],
             name: "Тарсис · арена гонок (Адрастея)", hasProfile: false, arena: true }
earth:     { keys: ["id","name","profile"], hasProfile: true }
```

То есть `id → данные` работает (селект показывает Адрастею, `__pvWorld = adrasteya`), а `world.profile` отсутствует → `WORLD_PROFILES.earth`. `window.__pvWorld` поэтому **не является доказательством корректного вида**: он пишется из `world.id` (`planetview.js:262`) и врёт вместе с заголовком.

### Хронология появления второго инстанса (замер каждые ~350 мс, реальное время)

| t, мс | `#pv-bar` | `#blocks3d-wrap` | `__pvRetried` |
|---|---|---|---|
| 1 557 | 0 | 0 | false |
| 2 504 | 1 | 1 | **true** |
| 3 664 | **2** | **2** | true |
| 8 420+ | 2 | 2 | true (`__pvWatch` погас) |

`__pvRetried = true` до появления второго контейнера — отметка сторожа из `planetview.js:240`.

**Перехват вызовов `PlanetView.open`** (обёртка через `Page.addScriptToEvaluateOnNewDocument`) дал **ровно один** вызов:

```
{ id: "adrasteya", t: 1607, stack: "at tryOpen (solar.js?v=1268:9310:35) << at solar.js:9315:34" }
```

→ внешние «открыватели» (`solar.js` pvTab и `pv-boot.js`) сработали **один раз**; второй вид создан внутренним `open()`, вызванным из сторожа напрямую (мимо `window.PlanetView.open`, поэтому перехват его и не увидел). Гипотеза «второй загрузчик/второй экземпляр кода» **не подтвердилась**: `planetview.js` подключён в `App.razor:65` один раз.

### Сопутствующие находки

1. **`worldId` не существует внутри `planetScene`** — `planetview.js:605`:
   `var cb = (cat || []).filter(function (x) { return x.id === worldId; })[0];`
   Здесь есть только параметр `world`; `worldId` — неопределённое имя → `ReferenceError`, который молча съедает `try/catch` (603-608). Итог: `camK` всегда 1, камера не подстраивается под радиус тела — это и есть причина «поверхность занимает 17–36 % кадра» из `agents-audit-19.md`. Правка — `world.id`.
2. **Ночь на арене будет чёрной.** `profileFromCatalog` отдаёт цвета **строками** (`'#6b5c4c'`), а `planetScene:616-621` считает ночную палитру битовыми сдвигами: `((c >> 16) & 255) * 0.45` → для строки это `0` → все цвета `0x000000`. Пока `profile` = Земля, дефект скрыт; после починки `.profile` он проявится.
3. **Молчаливое подмена на Землю в двух местах**: `planetview.js:259` (`|| WORLDS[0]` = earth) и `475` (`|| WORLD_PROFILES.earth`). Пока они есть, любой неизвестный id даёт «Землю» вместо честной ошибки.
4. **Два независимых входа в вид**: `solar.js:9281-9315` (pvTab) и `pv-boot.js:74-83` — оба читают `?pv=`. В этом прогоне pv-boot не сработал (оболочка уже была), но при медленной загрузке он даст третий инстанс.
5. `guard в pv-boot.js:164-172` (уборщик каждые 600 мс) удаляет `#blocks3d-wrap`, если на `body` нет `pv-mode`; `pv-mode` ставится с задержкой 700 мс (`planetview.js:575-583`) — ещё один сценарий «вид исчез → сторож переоткрыл».

## Предлагаемый минимальный фикс (одна точка правды `id → запись`)

Все правки — в `galaktika/src/galaktika.Web/wwwroot/js/planetview.js`; после — поднять `?v=` в `App.razor:65` (сейчас `v=10`).

### Патч 1 (обязательный; лечит заголовок) — `planetview.js:705-715`

Единственный источник записи мира — функция `worldById`, к ней сводятся оба места.

```js
// рядом с profileFromCatalog() — одна точка правды «id → запись мира»
function worldById(worldId) {
    var w = WORLDS.filter(function (x) { return x.id === worldId; })[0];
    if (w && w.profile) return w;                        // уже в правильном формате
    var p = profileFromCatalog(worldId);                 // всегда возвращает профиль
    var cat = (window.CATALOG && (window.CATALOG.bodies || window.CATALOG)) || [];
    var b = cat.filter(function (x) { return x.id === worldId; })[0];
    var rec = { id: worldId, name: (b && b.name) || p.name || worldId, profile: p };
    if (w) { w.name = rec.name; w.profile = p; } else { WORLDS.push(rec); }
    return rec;
}

function ensureWorldsFromCatalog() {
    try {
        var c = window.CATALOG;
        var list = (c && (c.bodies || c)) || [];
        list.forEach(function (b) { if (b && b.id) worldById(b.id); });
    } catch (e) { }
}
```

Было (строка 712): `WORLDS.push(profileFromCatalog(b.id));`

### Патч 2 (обязательный; убирает подмену на Землю) — `planetview.js:259` и `475`

```js
// 259: было  ... || profileFromCatalog(worldId) || WORLDS[0]
var world = worldById(worldId);

// 475: было  var profile = world.profile || WORLD_PROFILES.earth;
var profile = world.profile || profileFromCatalog(world.id);
```

### Патч 3 (обязательный; один экземпляр вида) — `planetview.js:225` и `231-244`

```js
// 225: идемпотентность входа
function open(worldId) {
    if (window.__pvOpenId === worldId && document.getElementById('blocks3d-wrap')) return;
    window.__pvOpenId = worldId;
    …
}

// 231-244: сторож не должен срабатывать, пока идёт нормальный спуск (~780 мс + загрузка 3D)
var canRetry = Date.now() - window.__pvOpenedAt > 1800;
if (canRetry && !w && !window.__pvUserExit && !window.__pvRetried) { … }
```

и защита от дубля в самом `planetScene` (начало функции, перед `bar` на строке 477):

```js
var prevBar = document.getElementById('pv-bar');   if (prevBar) prevBar.remove();
var prevWrap = document.getElementById('blocks3d-wrap'); if (prevWrap) prevWrap.remove();
```

### Патч 4 (1 строка; возвращает масштаб камеры) — `planetview.js:605`

```js
var cb = (cat || []).filter(function (x) { return x.id === world.id; })[0];   // было worldId
```

### Патч 5 (следом за патчем 1; ночь на арене) — `planetview.js:616-621`

```js
var c = profile.palette[k];
if (typeof c === 'string') c = parseInt(c.replace('#', ''), 16);
```

### Ожидаемая приёмка после патчей 1–3

| Проверка | Ожидание |
|---|---|
| `?pv=adrasteya` | заголовок «**Адрастея** · гравитационная платформа» (имя из каталога; арена-рельеф: кратеры, каньон, соляные пустоши) |
| `document.querySelectorAll('#blocks3d-wrap').length` | **1** |
| `document.querySelectorAll('#pv-bar').length` | **1** |
| `?pv=vesta`, `?pv=sedna`, `?pv=warclon` | свои имена, не «Земля» |
| `?pv=earth`, `?pv=mars` | без изменений |

Если имя «Тарсис · арена гонок (Адрастея)» в заголовке предпочтительнее — в `worldById` брать `p.name` вместо `b.name`; в селекте мира (`planetview.js:484-489`) останется длинное имя.

## Что не проверено

1. **Фикс не применялся и не проверялся** — задача только диагностическая; таблица приёмки выше — расчётная.
2. **Визуального скриншота-доказательства нет.** В headless-режиме (`--disable-gpu`, без логина) кадр получается затемнённым: сцена видна, но шапка 3D нечитаема. Доказательство заголовка — DOM/CDP (`#blocks3d-wrap b`), а не картинка. Нужен скриншот живым браузером с токеном (правило 22) — после фикса.
3. **Проверено 6 id** (`earth`, `mars`, `vesta`, `sedna`, `adrasteya`, `warclon`), не все 48 тел каталога.
4. **`solar.js` по содержимому не сверял**: задеплоен как `?v=1268`, локально в `App.razor` указан `?v=3540` — версии в разметке расходятся, но локальный pvTab (`solar.js:9281-9315`) и задеплоенный совпадают по коду вызова (`tryOpen` → `PlanetView.open(id)`).
5. **Другие входы не проверялись**: `?planet=` (`planetview.js:774-787`), `descent.js:106`, `scene-adapt.js:85`, `catalog-render.js:126` — могут дать такие же дубли.
6. **Мобильный вид и WebGL-сбой** не проверялись; число инстансов от WebGL не зависит (узлы создаются до рендера), но это не измерено.
7. **Экономика, награды, серверная часть** не затрагивались; `/api/planet/save` не вызывался.
