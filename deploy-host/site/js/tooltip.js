// Подсказки при наведении: планеты, луны, станции, кнопки меню, корабли.
// Владелец: «Галактика». Подключается после solar.js.
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    var DELAY = 180;
    var tip = null;
    var timer = null;
    var current = null;

    var MENU_HINTS = [
        ['Задани', 'Ежедневные дела и разовые задания. За выполнение — кристаллы и ресурсы.'],
        ['Рейтинг', 'Таблица лидеров: население, кредиты и флот. Свой аккаунт всегда виден.'],
        ['Колония', 'Ваша колония: население, налоги, счастье, стройка и оборона.'],
        ['Аренда', 'Доки, мастерские, переселенцы и оптовый контракт торговца.'],
        ['Лун', 'Спутники планет, аванпосты и газовый завод: энергия и доход.'],
        ['Корабл', 'Док: покупка, постройка и продажа кораблей.'],
        ['Док', 'Док: покупка, постройка и продажа кораблей.'],
        ['Мегапроект', 'Орбитальная станция, терраформинг и кольцо Дайсона — самые дорогие цели.'],
        ['Рынок', 'Лоты игроков: продайте излишки или купите дешевле, чем у NPC.'],
        ['Чёрный рынок', 'Рискованные сделки: дешевле, но с шансом потерять груз.'],
        ['Черный рынок', 'Рискованные сделки: дешевле, но с шансом потерять груз.'],
        ['Справочник', 'Статьи о механиках: налоги, рост, корабли, стройка.'],
        ['Энциклопеди', 'Статьи о механиках: налоги, рост, корабли, стройка.'],
        ['Статистик', 'Цифры сервера: игроки, активность, рынок.'],
        ['Пожелани', 'Предложите идею, корабль, постройку или оборудование — за принятое дают кристаллы.'],
        ['Чат', 'Общий чат игроков. Сообщение — раз в минуту.'],
        ['Карта', 'Карта систем и миров: где что добывают.'],
        ['Гильди', 'Гильдии: общий чат, помощь и союзники.'],
        ['Наук', 'Исследования: скорость кораблей, добыча, медицина.'],
        ['Ресурс', 'Склад: что добыто и сколько ещё влезет.'],
        ['Автопилот', 'Автопилот выполняет рутинные действия за вас.']
    ];

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text) d.textContent = text;
        return d;
    }

    function ensureTip() {
        if (tip) return tip;
        tip = el('div', 'dsh-tip');
        tip.id = 'dsh-tip';
        tip.setAttribute('role', 'tooltip');
        document.body.appendChild(tip);
        return tip;
    }

    function fmt(n, digits) {
        if (typeof n !== 'number' || !isFinite(n)) return '—';
        var d = typeof digits === 'number' ? digits : 0;
        return n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    function scenePlanet(id) {
        var sys = window.__sceneSystem;
        if (!sys || !sys.planets) return null;
        for (var i = 0; i < sys.planets.length; i++) {
            if (sys.planets[i].id === id) return sys.planets[i];
        }
        return null;
    }

    function worldInfo(id, name) {
        var list = window.WORLDS || [];
        for (var i = 0; i < list.length; i++) {
            if ((id && list[i].id === id) || (name && list[i].name === name)) return list[i];
        }
        return null;
    }

    function shipInfo(name) {
        var ships = window.SHIPS || {};
        for (var key in ships) {
            if (!Object.prototype.hasOwnProperty.call(ships, key)) continue;
            if (ships[key].name === name) return ships[key];
        }
        return null;
    }

    function rowsFor(target) {
        var out = [];

        var planetEl = target.closest('.planet');
        if (planetEl) {
            var pid = planetEl.getAttribute('data-planet-id');
            var p = scenePlanet(pid);
            var title = p ? p.name : (planetEl.querySelector('.tooltip') || {}).textContent;
            out.push({ title: title || 'Планета' });
            if (p) {
                out.push(['Удалённость', fmt(p.au, 3) + ' а.е.']);
                out.push(['Год', fmt(p.period, 1) + ' сут']);
                out.push(['Сутки', fmt(Math.abs(p.rotH), 2) + ' ч' + (p.rotH < 0 ? ' (обратное вращение)' : '')]);
                out.push(['Луны', (p.moons || []).length ? p.moons.map(function (m) { return m.name; }).join(', ') : 'нет']);
            }
            var w = worldInfo(pid, title);
            if (w) {
                if (w.pop) out.push(['Население', fmt(w.pop)]);
                if (w.produces) out.push(['Добыча', w.produces]);
                if (w.needs) out.push(['Нужно', w.needs]);
            }
            return out;
        }

        var moonEl = target.closest('.moon');
        if (moonEl) {
            var mname = (moonEl.querySelector('.tooltip') || {}).textContent || 'Луна';
            var host = moonEl.closest('.planet-wrapper');
            var hostName = host ? ((host.querySelector('.planet > .tooltip') || {}).textContent || '') : '';
            out.push({ title: mname });
            if (hostName) out.push(['Планета', hostName]);
            out.push(['Что даёт', 'Аванпост на луне: +2 энергии в день и доход']);
            return out;
        }

        var stationEl = target.closest('.station');
        if (stationEl) {
            var st = el('span');
            out.push({ title: 'Орбитальная станция' });
            out.push(['Назначение', 'Перевалочный узел: снабжение и ремонт']);
            return out;
        }

        var menuEl = target.closest('.menu-btn');
        if (menuEl) {
            var text = (menuEl.textContent || '').trim();
            var hint = null;
            for (var i = 0; i < MENU_HINTS.length; i++) {
                if (text.indexOf(MENU_HINTS[i][0]) >= 0) { hint = MENU_HINTS[i][1]; break; }
            }
            out.push({ title: text });
            out.push([null, hint || 'Открыть раздел']);
            return out;
        }

        var shipEl = target.closest('.ship-card');
        if (shipEl) {
            var nameEl = shipEl.querySelector('.ship-name');
            var s = nameEl ? shipInfo(nameEl.textContent.trim()) : null;
            out.push({ title: s ? s.name : (nameEl ? nameEl.textContent.trim() : 'Корабль') });
            if (s) {
                out.push(['Класс', s.cls]);
                out.push(['Цена', fmt(s.price) + ' кр']);
                out.push(['Корпус / щит', fmt(s.hull) + ' / ' + fmt(s.shield)]);
                out.push(['Трюм', fmt(s.cargo) + ' т']);
                out.push(['Ход', fmt(s.speed, 1)]);
                if (s.desc) out.push([null, s.desc]);
            }
            return out;
        }

        var explicit = target.getAttribute('data-tip');
        if (explicit) {
            var parts = explicit.split('|');
            out.push({ title: parts[0] });
            if (parts[1]) out.push([null, parts.slice(1).join('|')]);
            return out;
        }

        var title = target.getAttribute('title');
        if (title) {
            out.push({ title: title });
            return out;
        }
        return null;
    }

    function render(rows) {
        var box = ensureTip();
        box.innerHTML = '';
        rows.forEach(function (row) {
            if (!row) return;
            if (Array.isArray(row)) {
                if (!row[0]) {
                    var p = el('div', 'dsh-tip-text', row[1]);
                    box.appendChild(p);
                } else {
                    var line = el('div', 'dsh-tip-row');
                    line.appendChild(el('span', 'dsh-tip-key', row[0]));
                    line.appendChild(el('span', 'dsh-tip-val', String(row[1])));
                    box.appendChild(line);
                }
            } else if (row.title) {
                box.appendChild(el('div', 'dsh-tip-title', row.title));
            }
        });
        return box;
    }

    function place(x, y) {
        var box = ensureTip();
        var rect = box.getBoundingClientRect();
        var pad = 14;
        var left = x + pad;
        var top = y + pad;
        if (left + rect.width > window.innerWidth - 8) left = x - rect.width - pad;
        if (top + rect.height > window.innerHeight - 8) top = y - rect.height - pad;
        box.style.left = Math.max(8, left) + 'px';
        box.style.top = Math.max(8, top) + 'px';
    }

    function show(target, x, y) {
        var rows = rowsFor(target);
        if (!rows || !rows.length) return;
        render(rows);
        ensureTip().classList.add('dsh-tip-on');
        place(x, y);
    }

    function hide() {
        if (timer) { clearTimeout(timer); timer = null; }
        current = null;
        if (tip) tip.classList.remove('dsh-tip-on');
    }

    document.addEventListener('mouseover', function (e) {
        var target = e.target.closest && e.target.closest('[data-tip], .planet, .moon, .station, .menu-btn, .ship-card');
        if (!target || target === current) return;
        current = target;
        if (timer) clearTimeout(timer);
        var x = e.clientX;
        var y = e.clientY;
        timer = setTimeout(function () { show(target, x, y); }, DELAY);
    });

    document.addEventListener('mousemove', function (e) {
        if (!tip || !tip.classList.contains('dsh-tip-on')) return;
        if (e.target !== document.body) place(e.clientX, e.clientY);
    });

    document.addEventListener('mouseout', function (e) {
        if (!current) return;
        var to = e.relatedTarget;
        if (to && current.contains(to)) return;
        hide();
    });

    document.addEventListener('mousedown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);

    // стили подсказки
    var style = document.createElement('style');
    style.textContent = [
        '.dsh-tip{position:fixed;z-index:99999;max-width:280px;padding:9px 11px;border-radius:10px;',
        'background:rgba(8,16,28,.96);border:1px solid #2c4a6e;color:#dce8f7;',
        'font:12px/1.45 Inter,system-ui,Segoe UI,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);',
        'opacity:0;pointer-events:none;transition:opacity .12s ease;transform:translateZ(0)}',
        '.dsh-tip-on{opacity:1}',
        '.dsh-tip-title{font-weight:700;font-size:13px;color:#8fd0ff;margin-bottom:4px}',
        '.dsh-tip-row{display:flex;justify-content:space-between;gap:12px;margin:2px 0}',
        '.dsh-tip-key{color:#7f93ad}',
        '.dsh-tip-val{color:#e8f2ff;text-align:right}',
        '.dsh-tip-text{margin-top:5px;color:#b9cbe0}'
    ].join('');
    document.head.appendChild(style);

    // создаём заранее, чтобы элемент был в разметке
    if (document.body) ensureTip();
    else document.addEventListener('DOMContentLoaded', ensureTip);

    window.DshTip = { show: show, hide: hide };
})();
