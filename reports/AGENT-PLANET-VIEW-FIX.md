# AGENT-PLANET-VIEW-FIX — применён фикс заголовка `?pv=adrasteya`

- **Дата/время:** 2026-11-05, 08:27–08:40 MSK.
- **Зона:** `galaktika/src/galaktika.Web/wwwroot/js/planetview.js` (+ версия в `App.razor`).
- **Режим:** правка кода **без деплоя** (деплой — за P-01). Сервер, БД, `/api/planet/save` не трогались.
- **Проверка:** живое приложение `https://warbattleuniverse.com` + Chrome DevTools Protocol, `Fetch.fulfillRequest` подменяет ответ на `/js/planetview.js` локальным файлом. То есть в реальном приложении (остальные скрипты — продовые) исполняется **исправленный** `planetview.js`, без выкладки. Доказательство подмены: появилось поле `window.__pvOpenId` (есть только в новой версии) и `hasProfile: true` у Адрастеи.
- **Синтаксис:** `node --check planetview.js` → `exit 0` (824 строки, 44 5xx байт). Байт-в-байт исходная версия сверена с продом ранее (SHA256 `1FCA52A2…C0C6`).

## 1. Что изменено

Все правки — в `js/planetview.js`, кроме последней строки таблицы.

| № | Файл:строка | Было | Стало | Зачем |
|---|---|---|---|---|
| 1 | `planetview.js:722-738` | `ensureWorldsFromCatalog` пушил «голый» профиль: `WORLDS.push(profileFromCatalog(b.id))` | добавлена `worldById(worldId)` → всегда `{ id, name, profile }`; старые записи апгрейдятся на месте | одна точка правды `id → запись`; у мира каталога появляется `.profile` |
| 2 | `planetview.js:740-746` | тело `ensureWorldsFromCatalog` с `WORLDS.some/push` | `list.forEach(b => worldById(b.id))` | тот же один путь создания записи |
| 3 | `planetview.js:266` | `world = WORLDS.filter(...)[0] \|\| profileFromCatalog(worldId) \|\| WORLDS[0]` | `world = worldById(worldId)` | убран молчаливый `WORLDS[0]` = Земля |
| 4 | `planetview.js:489` | `var profile = world.profile \|\| WORLD_PROFILES.earth;` | `var profile = world.profile \|\| profileFromCatalog(world.id);` | нет подмены на Землю, профиль всегда от своего id |
| 5 | `planetview.js:491` | — | `window.__pvWorld = world.id;` | после смены мира селектом диагностика не врёт старым id |
| 6 | `planetview.js:645` | `title: … + profile.name + ' · гравитационная платформа'` | `… + (world.name \|\| profile.name) + …` | заголовок — от записи мира (каталожное имя) |
| 7 | `planetview.js:227-229` | вход без защиты | `if (window.__pvOpenId === worldId && document.getElementById('blocks3d-wrap')) return; window.__pvOpenId = worldId;` | идемпотентность: один экземпляр вида на страницу |
| 8 | `planetview.js:240-248` | сторож повторял открытие через 400 мс | `if (age > 1800 && age < 3000 && …)` | штатный спуск длится ~780 мс + загрузка 3D; порог 400 мс давал второй вид |
| 9 | `planetview.js:470-474` | — | перед сценой удаляются прежние `#pv-bar` и `#blocks3d-wrap` | дубль невозможен, даже если `planetScene` позовут дважды |
| 10 | `planetview.js:621` | `x.id === worldId` (переменной нет в `planetScene`) | `x.id === world.id` | `ReferenceError` глотался `try/catch` → `camK` всегда 1, камера не масштабировалась |
| 11 | `planetview.js:635-638` | `var c = profile.palette[k]; c >> 16 …` | `if (typeof c === 'string') c = parseInt(c.replace('#',''),16) \|\| 0;` | у профилей каталога цвета — строки `'#rrggbb'`; битовые сдвиги давали 0 → чёрная ночь |
| 12 | `App.razor:65` | `js/planetview.js?v=10` | `js/planetview.js?v=11` | сброс кеша при деплое |

Ключевой фрагмент (новый единственный путь «id → мир»):

```js
// planetview.js:728-738
function worldById(worldId) {
    var w = WORLDS.filter(function (x) { return x.id === worldId; })[0] || null;
    if (w && w.profile) return w;                       // уже в правильном формате
    var p = profileFromCatalog(worldId);                // всегда возвращает профиль
    var cat = (window.CATALOG && (window.CATALOG.bodies || window.CATALOG)) || [];
    var b = cat.filter(function (x) { return x && x.id === worldId; })[0] || null;
    var rec = { id: worldId, name: (b && b.name) || p.name || worldId, profile: p };
    if (w) { w.name = rec.name; w.profile = p; return w; }
    WORLDS.push(rec);
    return rec;
}
```

## 2. Числа до/после (один и тот же стенд, `?pv=adrasteya&shot=1&onb=1`)

| Показатель | ДО (прод `v=10`) | ПОСЛЕ (локальный файл) |
|---|---|---|
| `#blocks3d-wrap` | **2** | **1** |
| `#pv-bar` | **2** | **1** |
| Заголовок 3D | «🌍 **Земля** · гравитационная платформа» ×2 | «🌍 **Адрастея** · гравитационная платформа» |
| Заголовок панели | «🌍 Земля · горизонт из блоков…» | «🌍 Тарсис · арена гонок (Адрастея) · горизонт из блоков…» |
| `PlanetView.worlds[adrasteya]` | `keys=[id,arena,name,color,…]`, `hasProfile:false` | `keys=[id,name,profile]`, `hasProfile:true`, `profile.arena:true` |
| Вызовов `Blocks3D.open` | 2 | **1** |
| `camera` | `[46, 30, 56]` (camK=1 для всех) | `[16.1, 10.5, 19.6]` (camK=0.35 по R=8 км) |
| `palette.grass` | `5208634` = `0x4F7A3A` (земля) | `'#6b5c4c'` (арена) |
| Блоков рельефа (terrain) | 23 385 (как у Земли) | 25 494 |
| Блоков станции | 541 | 621 (арена без воды → радиаторы) |
| `__pvRetried` | `true` (сторож сработал) | `false` |

## 3. Матрица после фикса (4 тела)

| `?pv=` | wraps | bars | Заголовок | `camera` | `palette.grass` | terrain |
|---|---|---|---|---|---|---|
| `adrasteya` | 1 | 1 | 🌍 **Адрастея** · гравитационная платформа | 16.1 / 10.5 / 19.6 | `'#6b5c4c'` | 25 494 |
| `vesta` | 1 | 1 | 🌍 **Веста** · гравитационная платформа | 16.1 / 10.5 / 19.6 | `'rgb(150,143,131)'` | 22 522 |
| `jupiter` | 1 | 1 | 🌍 **Юпитер** · гравитационная платформа | 101.2 / 66 / 123.2 | `0xD8B78A` | 21 783 |
| `earth` | 1 | 1 | 🌍 **Земля** · гравитационная платформа (регрессии нет) | 46 / 30 / 56 | `0x4F7A3A` | 23 385 |

Камера под радиус: `camK = clamp(√(R/6371), 0.35, 2.2)` → Адрастея (R=8 км) 0.35, Веста (262) 0.35, Земля (6371) 1.0, Юпитер (69 911) 2.2. Три разных значения — масштабирование работает (до фикса всегда было 1.0 из-за `ReferenceError` на `worldId`).

## 4. Критерии приёмки P-02

| Критерий | Факт | Статус |
|---|---|---|
| `#blocks3d-wrap` = 1 | 1 на всех 4 телах, `__pvRetried:false` | ✅ |
| `?pv=adrasteya` → «Адрастея» | «🌍 Адрастея · гравитационная платформа» | ✅ |
| `?pv=vesta` → «Веста» | «🌍 Веста · гравитационная платформа» | ✅ |
| Профиль не Earth: `hasProfile:true`, цвет не земной | `hasProfile:true`, `profile.arena:true`, `grass:'#6b5c4c'` (земля — `0x4F7A3A`) | ✅ |
| Камера масштабируется (2+ тела) | Юпитер `[101.2,66,123.2]` vs Земля `[46,30,56]` vs Адрастея `[16.1,10.5,19.6]` | ✅ |
| Смена мира без перезагрузки (инвариант 3) | селект `adrasteya → vesta`: wraps=1, bars=1, заголовок «Веста», `__pvWorld='vesta'` | ✅ |

## 5. Риски и совместимость

- **Формат записи `PlanetView.worlds` изменился** у каталожных тел (`{id,name,profile}` вместо «голого» профиля). Потребителей `PlanetView.worlds` в `js/` нет (проверено grep: только диагностика) — регрессии не ждём.
- **Подписи в селекте мира** теперь каталожные: «Адрастея» вместо «Тарсис · арена гонок (Адрастея)». Внутри сцены профиль остаётся арены (`profile.name`), заголовок — от мира.
- **`open()` стал идемпотентным**: повторный `open(id)` при живом `#blocks3d-wrap` игнорируется. Если вид закрыт (контейнера нет) — открывается заново, как раньше.
- **`planetScene` удаляет прежние узлы** — переход между мирами не копит слои.
- **Земля считается по-прежнему верно**: `_pvWorld='earth'`, `camera [46,30,56]`, `blocks 541`, палитра земная.

## 6. Что не проверено

1. **Не задеплоено.** В проде по-прежнему `planetview.js?v=10`; в рабочей копии — `v=11`. Выкладка за P-01.
2. **Визуального скриншота нет.** Headless-браузер без GPU и без логина даёт затемнённый кадр, заголовок на картинке нечитаем — принимал по DOM/CDP. После деплоя нужен скриншот по правилу 22 (`?pv=adrasteya`, окно ≥1200×800) и по правилу 23 (`?tilt=45&spin=20`).
3. **Небо.** У Адрастеи/Весты нет своих панорам — `skyTexture` остаётся `/images/skies/earth-day.webp` (это арт-вопрос, не заголовок; у Юпитера — `jupiter.webp`).
4. **Ночной режим** на арене не смотрел: конвертация строковых цветов в число сделана, но визуально (🌙 Ночь) не проверялась.
5. **Проверены 4 тела** (`adrasteya`, `vesta`, `jupiter`, `earth`), не все 48 каталога; `warclon`/`warfront`/карликовые не перепроверял после фикса.
6. **Другие входы** (`?planet=`, `descent.js`, `scene-adapt.js`, `catalog-render.js`, `pv-boot.js`) после фикса не гонял — они зовут тот же `PlanetView.open`, теперь идемпотентный.
7. **Мобильный вид**, `no-auto-windows`, онбординг поверх PV не проверялись.
8. **`dotnet build`** не запускал: изменён один атрибут `?v=` в разметке и один JS-файл; JS проверен `node --check`.

## 7. Откат

`planetview.js` — вернуть 12 фрагментов из таблицы §1 к прежнему виду; `App.razor:65` — `?v=10`. Git-репозитория в рабочей копии нет (`galaktika/.git` отсутствует), поэтому откат — только ручной правкой этих фрагментов (все они локальные, в одном файле). Серверных изменений нет, откат безопасен.
