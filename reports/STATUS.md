# Статус проекта «Галактика» — 30.10.2026

## Продакшн
- Основной домен: https://warbattleuniverse.com (200)
- Зеркало: https://warbattleuniverse.store (самоподписанный сертификат)
- Версии: solar.js v=774, app.css v=764, planetview v=10, descent v=6, build v=4, market v=4, mentor v=4, onboarding v=9
- Аудит: 47 / 47 (galaktika\deploy-host\audit_all.py)
- Деплой: galaktika\deploy-host\deploy.ps1 -Version N (полная сборка; -SkipBuild оставляет старые ?v=)

## Что работает (проверено)
- Двойной клик по планете → глобус (ручное определение двойного клика — планеты движутся)
- Биржа: цены с сервера (/api/npcmarket/quote), сделки через /api/npcmarket/trade
- Доки: docks_count учитывает dockSlots; в окне стройки «Доки: 2 / 3»
- Меню: 45 видимых пунктов, без дублей, «Рынок» и «Админка» скрыты
- Esc закрывает окна (computed style), колесо не зумит под окном
- Обучение только новичкам, отмена сохраняется (/api/auth/onb_done)
- CORS для .store, роутинг с подчёркиванием в /api/auth/*
- Торговые трассы: облёт Солнца (SUN_SAFE 135 px), гравитационная стоимость, длина дуги
- Время: 1 с = 1 мин (MAX_TIME_SCALE 60); сутки/год только в ?test=1

## Блокеры
1. Планетарный вид не строится: planetScene вызывается, возвращается без ошибки, но #blocks3d-wrap и #pv-bar не создаются. Маркеры внутри сцены не срабатывают → вероятно дубль кода или другой файл на сервере.
2. Гражданские борта (40 маркеров) имеют статичные координаты — «облако» слева от системы.
3. Флоты: ROUTES.pts нормализованы 0..1, routeLines() не используется, слой #fleet-routes отсутствует.

## Очередь
1. Переписать флоты: маршрут в пикселях при вылете, пунктир, движение борта по трассе
2. Планетарный вид (блокер)
3. 100 новых памятников Земли (сейчас 91) с проверкой открытия с глобуса
4. Постройки на лунах
5. Стройка поверхностных построек не списывает чипы
6. Счётчики прогресса, пролог, звание, языки, аренда дока

## Аккаунты
- admin: ab@btema.ru (пароль в galaktika\deploy-host\ADMIN-PASSWORD.txt)
- агенты: agent@…/GalaktikaAgent2026!, trader@…/GalaktikaTrader2026!, quartermaster@…/GalaktikaQuarter2026!
- новичок: mila@warbattleuniverse.com / GalaktikaMila2026! (имя «Мила», торговля)
- токен агента для скриншотов: galaktika\reports\_token.txt

## Инструменты
- Скриншоты: galaktika\tools\shot.ps1 -Url ... -Out ... -Width 1400 -Height 900
- Режимы: ?shot=1, ?token=<токен>, ?tilt=-85..85&spin=-180..180, ?open=market|resources|build
- Самотесты: ?testdbl=earth, ?testpv=mars[&mode=direct], ?planet=mars
- Правила 22/23 (скриншот целиком, 3D-ракурсы) — в AGENTS.md