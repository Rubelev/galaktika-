# Публикация: что уже готово и что нажать

## Готово в проекте

| Файл | Назначение |
|---|---|
| `Dockerfile` | образ из готовой сборки `publish/linux-x64` |
| `render.yaml` | сервис `galaktika-mlechny-put`, план free |
| `.dockerignore` | мусор не попадает в образ |
| `publish/linux-x64/` | автономная сборка под Linux (109 МБ, проверена) |
| `tunnel.bat` | публичная ссылка без хостинга (запускать у себя) |
| `deploy.bat` | тест → сборка → коммит → push |

Репозиторий git готов, коммит сделан, remote не задан.

## Шаг 1. GitHub (3 минуты)

1. https://github.com/signup — почта, пароль, ник, код из письма.
2. Кнопка **New repository**:
   - Repository name: `galaktika`
   - **Private** (или Public — на ваш выбор)
   - **НЕ ставить** галочки README / .gitignore / license
   - Create repository
3. В PowerShell:

```powershell
cd C:\Users\asus\galaktika_final
git remote add origin https://github.com/ВАШ_НИК/galaktika.git
git branch -M main
git push -u origin main
```

При первом push откроется браузер — войти тем же аккаунтом.

## Шаг 2. Render (2 минуты)

1. https://render.com → **Get Started** → **GitHub** → Authorize.
2. **New → Blueprint** → выбрать репозиторий `galaktika` → **Apply**.
3. Render прочитает `render.yaml`, соберёт образ из `publish/linux-x64`.
4. Через 5–10 минут сервис станет Live.

Адрес появится в панели сверху: `https://galaktika-mlechny-put.onrender.com`.
Если имя занято — Render предложит другое, тогда поправить `name:` в `render.yaml`.

## Шаг 3. Проверка

1. Открыть адрес — страница входа.
2. Войти: `ab@btema.ru` / `Docent@1973Docent`.
3. Проверить флот, биржу, глобус.

## Особенности бесплатного плана

- Засыпает после 15 минут без запросов, первый заход до 30 секунд.
- Пинг раз в 10 минут через UptimeRobot решает проблему.
- 750 часов в месяц — на один сервис хватает с запасом.

## Профили игроков

Сейчас прогресс хранится в браузере (localStorage). Сервер раздаёт страницу,
но не хранит данные игроков. Для общего прогресса нужен серверный слой —
API авторизации уже написан (`galaktika.Web/Auth/AuthStore.cs`), осталось
подключить к нему клиент.