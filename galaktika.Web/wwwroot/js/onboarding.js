// Онбординг: одно понятное действие вместо пятнадцати кнопок.
// 1) меню сжимается в три группы, 2) карточка «следующий шаг», 3) гайд «Как играть».
(function () {
    // на служебных страницах (pv/war/garage) обучение не запускается
    var q = new URLSearchParams(location.search);
    if (q.has('pv') || q.has('planet') || q.has('war') || q.has('garage') || q.has('quest') || q.has('spec') || q.has('sys') || q.has('sandbox') || q.has('tour')) return;
    window.__servicePageGuard = true;

    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    // Тексты берём из реальных данных, а не пишем руками: цифры в подсказках
    // разъезжались с ценами на сервере (подсказка занижала цену в девять раз).
    function shipPriceText() {
        var S = (window.SHIPS && window.SHIPS.jet_scout) ? window.SHIPS.jet_scout : null;
        if (!S) return 'Первый корабль — разведчик «Искра». Откройте верфь и проверьте цену.';
        var parts = S.parts || {};
        var names = { steel: 'стали', copper: 'меди', nickel: 'никеля', silver: 'серебра',
                      gold: 'золота', chips: 'чипов', boards: 'досок', manip: 'манипуляторов' };
        var need = Object.keys(parts).map(function (k) {
            var unit = (k === 'chips' || k === 'boards' || k === 'manip') ? '' : ' т';
            return parts[k] + unit + ' ' + (names[k] || k);
        }).join(', ');
        var money = (S.price || 0).toLocaleString('ru-RU');
        // в карточке — только суть, полный список деталей в подсказке к кнопке
        return 'Разведчик «Искра»: ' + money + ' кр + ресурсы. Детали — на верфи.';
    }

    function colonyPriceText() {
        return 'Колония даёт налоги каждый час. Нужно 300 000 кр и хотя бы один корабль — ' +
               'колонизатор садится на луну и превращается в жилой модуль.';
    }

    var STEPS = [
        {
            id: 'sell',
            title: 'Заработай на бирже',
            text: 'Продай руду или лёд на бирже. Первый корабль стоит 18 000 кр — копи до этой суммы.',
            button: 'Открыть биржу',
            run: function () { if (window.Market) window.Market.open(); else if (typeof openMarket === 'function') openMarket(); },
            done: function (p) {
                // считается только после реальной сделки: торговый счётчик растёт на сервере
                var trades = (p.tradeStats && Object.keys(p.tradeStats).length) ? 1 : 0;
                var sold = (p.marketSold || 0) > 0 || trades > 0;
                return sold || (p.credits || 0) >= 18000;
            }
        },
        {
            id: 'ship',
            title: 'Построй корабль',
            text: shipPriceText,
            button: 'Открыть верфь',
            run: function () {
                // верфь = каталог кораблей; очередь стройки пустая и только пугает
                if (typeof window.openFleet === 'function') {
                    window.openFleet();
                    if (typeof window.renderHangar === 'function') window.renderHangar('jet_scout');
                    return;
                }
                if (typeof window.openHangar === 'function') return window.openHangar('jet_scout');
                if (window.BuildPanel) window.BuildPanel.open();
            },
            done: function (p) { return (p.ships || []).length > 0; }
        },
        {
            id: 'colony',
            title: 'Оснуй колонию',
            text: colonyPriceText,
            button: 'Открыть колонию',
            run: function () { if (window.Colony) window.Colony.open(); },
            done: function (p) { return !!(p.colony && p.colony.population); }
        },
        {
            id: 'food',
            title: 'Запасись едой и водой',
            text: 'Колония ест 0,3 кг зерна и 0,003 т воды на человека в сутки.',
            button: 'Открыть торговлю',
            run: function () { if (window.Trade) window.Trade.open(); else if (window.Market) window.Market.open(); },
            done: function (p) {
                var c = p.colony || {}, r = p.resources || {}, pop = c.population || 0;
                if (!pop) return false;
                return (r.grain || 0) / (pop * 0.3) >= 5 && (r.water || 0) / (pop * 0.003) >= 5;
            }
        },
        {
            id: 'quest',
            title: 'Пройди первый квест',
            text: 'Квесты дают кредиты и кристаллы. Один уже доступен.',
            button: 'Открыть квесты',
            run: function () { if (window.Quests) window.Quests.open(); else if (typeof openQuests === 'function') openQuests(); },
            done: function (p) { return (p.questsDone || 0) > 0; }
        },
        {
            id: 'trade',
            title: 'Запусти торговый рейс',
            text: 'Вода Европы и водород Юпитера приносят больше, чем налоги.',
            button: 'Открыть торговлю',
            run: function () { if (window.Trade) window.Trade.open(); },
            done: function (p) { return !!(p.trade && (p.trade.totalProfit || 0) > 0); }
        }
    ];

    var card = null, stepIndex = 0, collapsed = false, profileCache = null;

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }

    // до входа карточка не нужна: она перекрывала кнопку «Зарегистрироваться»
    function dismissed() {
        try { return localStorage.getItem('gm_onb_dismissed') === '1'; } catch (e) { return false; }
    }
    function dismiss() {
        try { localStorage.setItem('gm_onb_dismissed', '1'); } catch (e) {}
        var el = document.getElementById('onb-card');
        if (el) el.remove();
        var g = document.getElementById('onb-guide');
        if (g) g.remove();
        // флаг в профиле: отменили — больше не показываем ни на одном устройстве
        fetch('/api.php?action=onb_done', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: '{}'
        }).catch(function () {});
    }

    function loggedIn() {
        try { return !!localStorage.getItem('galaktika_token'); } catch (e) { return false; }
    }

    var roleCache = null;
    var profileCache2 = null;

    // Один запрос на всё: роль (админ или игрок) и профиль.
    function loadMe() {
        return fetch('/api/auth/me', { headers: { 'X-Auth-Token': token() } })
            .then(function (r) { return r.json(); })
            .then(function (res) {
                roleCache = res && res.role ? res.role : 'player';
                try { profileCache2 = JSON.parse(res.profile || '{}'); } catch (e) { profileCache2 = {}; }
                return profileCache2;
            })
            .catch(function () { roleCache = null; return {}; });
    }

    function loadProfile() { return loadMe(); }

    function isAdmin() { return roleCache === 'admin'; }

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    // ---------- карточка «следующий шаг» ----------
    function ensureCard() {
        if (card && card.parentNode) return card;
        card = el('div');
        card.id = 'onb-card';
        card.style.cssText = 'position:fixed;left:300px;bottom:14px;z-index:16000;width:280px;' +
            'background:linear-gradient(#12202e,#0b1520);border:3px solid #0a0e12;border-radius:14px;' +
            'box-shadow:0 10px 30px rgba(0,0,0,.5);font:13px/1.45 Inter,system-ui,sans-serif;color:#dce8f7';
        document.body.appendChild(card);
        return card;
    }

    // Карточка не должна висеть поверх склада и других окон:
    // если открыта панель — прячемся, закрылась — возвращаемся.
    function anyPanelOpen() {
        var nodes = document.querySelectorAll('[id$="-modal"], .panel, .market-modal, .npc-modal, .flight-modal');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el.id === 'onb-card' || el.id === 'onb-guide') continue;
            var st = (el.style && el.style.display) || '';
            if (st === 'flex' || st === 'block' || (el.offsetParent && st !== 'none' && !el.classList.contains('hidden'))) {
                return true;
            }
        }
        return false;
    }

    function renderCard(p) {
        if (dismissed()) {
            var old = document.getElementById('onb-card');
            if (old) old.remove();
            return;
        }
        var c = ensureCard();
        c.style.display = anyPanelOpen() ? 'none' : 'block';
        // ищем первый невыполненный шаг
        var idx = 0;
        for (var i = 0; i < STEPS.length; i++) {
            if (!STEPS[i].done(p)) { idx = i; break; }
            idx = i + 1;
        }
        stepIndex = Math.min(idx, STEPS.length - 1);
        var allDone = idx >= STEPS.length;

        // крестик в углу карточки
        var closeBtn = c.querySelector('#onb-close');
        if (closeBtn) closeBtn.onclick = dismiss;

        if (collapsed) {
            c.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px">' +
                '<b style="color:#8fd6ff">❓ Помощь</b>' +
                '<span style="flex:1"></span>' +
                '<button id="onb-expand" style="border:none;border-radius:6px;padding:4px 8px;cursor:pointer;' +
                'background:#2b4a6e;color:#dce8f7">развернуть</button></div>';
            document.getElementById('onb-expand').onclick = function () { collapsed = false; renderCard(p); };
            return;
        }

        if (allDone && !dismissed()) {
            fetch('/api.php?action=onb_done', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
                body: '{}'
            }).catch(function () {});
        }
        if (allDone) {
            c.innerHTML = '<div style="padding:12px">' +
                '<b style="color:#3ec97a">✅ Все шаги пройдены</b>' +
                '<div style="color:#9fb2c6;font-size:12.5px;margin-top:4px">' +
                'Дальше — торговые рейсы, оборона колонии и квесты.</div>' +
                '<div style="display:flex;gap:6px;margin-top:8px">' +
                '<button id="onb-trade" style="flex:1;padding:8px;border:none;border-radius:8px;cursor:pointer;' +
                'background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;font-weight:800">Торговля</button>' +
                '<button id="onb-fold" style="padding:8px 10px;border:none;border-radius:8px;cursor:pointer;' +
                'background:#2b3238;color:#dce8f7">свернуть</button></div></div>';
            document.getElementById('onb-trade').onclick = function () { if (window.Trade) window.Trade.open(); };
            document.getElementById('onb-fold').onclick = function () { collapsed = true; renderCard(p); };
            return;
        }

        var s = STEPS[stepIndex];
        var dots = STEPS.map(function (_, i) {
            var on = STEPS[i].done(p);
            return '<i style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;' +
                'background:' + (on ? '#3ec97a' : (i === stepIndex ? '#ffd05a' : '#2b3a48')) + '"></i>';
        }).join('');

        c.innerHTML = '<div style="padding:11px 12px">' +
            '<div style="display:flex;align-items:center;gap:6px">' +
            '<b style="color:#8fd6ff">Шаг ' + (stepIndex + 1) + ' из ' + STEPS.length + '</b>' +
            '<span style="flex:1"></span>' + dots +
            '<button id="onb-close" title="Скрыть подсказки" style="margin-left:6px;border:none;background:transparent;' +
            'color:#7f93a8;font-size:15px;line-height:1;cursor:pointer">✕</button></div>' +
            '<div style="font-weight:800;margin-top:6px;font-size:14px">' + s.title + '</div>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin-top:2px">' +
                (typeof s.text === 'function' ? s.text() : s.text) + '</div>' +
            '<div style="display:flex;gap:6px;margin-top:9px">' +
            '<button id="onb-go" style="flex:1;padding:9px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#8fd6ff,#2f9fe0);color:#04223a;font-weight:800">' + s.button + '</button>' +
            '<button id="onb-help" title="Как играть" style="padding:9px 11px;border:none;border-radius:9px;' +
            'cursor:pointer;background:#2b3238;color:#dce8f7;font-weight:800">?</button>' +
            '<button id="onb-fold" title="Свернуть" style="padding:9px 11px;border:none;border-radius:9px;' +
            'cursor:pointer;background:#2b3238;color:#dce8f7">–</button></div></div>';

        document.getElementById('onb-go').onclick = function () {
            try { s.run(); } catch (e) {}
        };
        document.getElementById('onb-help').onclick = guide;
        document.getElementById('onb-fold').onclick = function () { collapsed = true; renderCard(p); };
    }

    // ---------- гид «Как играть» ----------
    function guide() {
        var old = document.getElementById('onb-guide');
        if (old) old.remove();
        var wrap = el('div');
        wrap.id = 'onb-guide';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:13500;background:rgba(4,8,12,.85);' +
            'display:flex;align-items:center;justify-content:center;padding:14px';
        var cardEl = el('div');
        cardEl.style.cssText = 'width:min(620px,96vw);max-height:92vh;overflow:auto;background:#0b1526;' +
            'border:2px solid #1e3a5f;border-radius:16px;padding:18px;color:#dce8f7;' +
            'font:14px/1.55 Inter,system-ui,sans-serif';
        var list = STEPS.map(function (s, i) {
            return '<div style="display:flex;gap:10px;align-items:flex-start;margin-top:10px">' +
                '<span style="min-width:26px;height:26px;border-radius:50%;background:#1e3a5f;' +
                'display:flex;align-items:center;justify-content:center;font-weight:800">' + (i + 1) + '</span>' +
                '<div><b>' + s.title + '</b><div style="color:#9fb2c6;font-size:12.5px">' +
                (typeof s.text === 'function' ? s.text() : s.text) + '</div></div></div>';
        }).join('');

        cardEl.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<b style="color:#8fd6ff;font-size:17px">🧭 Как играть — 6 шагов</b>' +
            '<button id="onb-gclose" style="padding:4px 10px;border:none;border-radius:8px;background:#2b3238;' +
            'color:#e6eaed;cursor:pointer">✕</button></div>' +
            '<div style="color:#9fb2c6;margin-top:4px">Делайте по одному шагу — карточка слева подскажет следующий.</div>' +
            list +
            '<div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            '<button id="onb-g1" style="padding:10px;border:none;border-radius:9px;cursor:pointer;background:#2b4a6e;color:#dce8f7;font-weight:700">Биржа</button>' +
            '<button id="onb-g2" style="padding:10px;border:none;border-radius:9px;cursor:pointer;background:#2b4a6e;color:#dce8f7;font-weight:700">Флот</button>' +
            '<button id="onb-g3" style="padding:10px;border:none;border-radius:9px;cursor:pointer;background:#2b4a6e;color:#dce8f7;font-weight:700">Колония</button>' +
            '<button id="onb-g4" style="padding:10px;border:none;border-radius:9px;cursor:pointer;background:#2b4a6e;color:#dce8f7;font-weight:700">Квесты</button>' +
            '</div>' +
            '<div style="margin-top:10px;color:#6f8296;font-size:11.5px">Совет: если потерялись — жмите «?» в карточке слева.</div>';
        wrap.appendChild(cardEl);
        document.body.appendChild(wrap);
        document.getElementById('onb-gclose').onclick = function () { wrap.remove(); };
        wrap.onclick = function (e) { if (e.target === wrap) wrap.remove(); };
        document.getElementById('onb-g1').onclick = function () { wrap.remove(); if (window.Market) window.Market.open(); };
        document.getElementById('onb-g2').onclick = function () { wrap.remove(); if (window.BuildPanel) window.BuildPanel.open(); };
        document.getElementById('onb-g3').onclick = function () { wrap.remove(); if (window.Colony) window.Colony.open(); };
        document.getElementById('onb-g4').onclick = function () { wrap.remove(); if (window.Quests) window.Quests.open(); };
    }

    // ---------- сжатие меню в группы ----------
    var PRIMARY = ['флот', 'ресурсы', 'квесты', 'чат', 'админка', 'история', 'справочник', 'карта'];
    var WORLD = ['бирж', 'рынок', 'колони', 'торговл', 'достопримеч', 'марс', 'астероид', 'пекин',
        'гуанчжоу', 'париж', 'москв', 'нью-йорк', 'планет', 'конструктор'];

    function groupMenu() {
        var box = document.getElementById('left-menu-items');
        if (!box || box.getAttribute('data-grouped') === '1') return;
        var buttons = Array.prototype.slice.call(box.querySelectorAll(':scope > button'));
        if (!buttons.length) return;

        var more = el('div');
        more.id = 'menu-more';
        more.style.cssText = 'display:none;flex-direction:column;gap:6px;margin-top:6px';
        var toggle = el('button', 'menu-btn', '🎛 Ещё');
        toggle.id = 'menu-more-btn';
        toggle.style.cssText = 'margin-top:6px;opacity:.9';
        toggle.onclick = function () {
            var open = more.style.display === 'flex';
            more.style.display = open ? 'none' : 'flex';
            toggle.textContent = open ? '🎛 Ещё' : '🎛 Свернуть';
        };

        var moved = 0;
        buttons.forEach(function (b) {
            var t = (b.textContent || '').toLowerCase();
            if (b.id === 'admin-btn') return;
            // кнопки модулей (мои панели) — в «Ещё»
            var isPrimary = PRIMARY.some(function (k) { return t.indexOf(k) >= 0; });
            if (isPrimary) return;
            // оставляем на виду только 4 главных, остальное прячем
            b.style.marginTop = '0';
            more.appendChild(b);
            moved++;
        });

        if (moved >= 3) {
            box.appendChild(toggle);
            box.appendChild(more);
            box.setAttribute('data-grouped', '1');
        }
    }

    function tick() {
        groupMenu();
        if (!loggedIn()) {
            var noCard = document.getElementById('onb-card');
            if (noCard) noCard.remove();
            return;
        }
        loadMe().then(function (p) {
            profileCache = p;
            // администратору обучение не нужно: убираем карточку и гайд
            var p2 = p || {};
            var shipsCount = (p2.ships && p2.ships.length) || 0;
            var isNewPlayer = shipsCount === 0 && !p2.colony && (p2.credits || 0) < 50000;
            if (isAdmin() || p2.onbDone || dismissed() || !isNewPlayer) {
                var card = document.getElementById('onb-card');
                if (card) card.remove();
                var guide = document.getElementById('onb-guide');
                if (guide) guide.remove();
                return;
            }
            renderCard(p);
            if (!isAdmin() && /[?&]guide=1/.test(location.search) && !document.getElementById('onb-guide')) guide();
        });
    }

    window.Onboarding = { guide: guide, steps: STEPS, refresh: tick };

    // ?shot=1 — режим скриншотов: убираем модалки, чтобы был виден сам объект
    if (/[?&]shot=1/.test(location.search)) {
        var shotStyle = document.createElement('style');
        // ?shot=1 — только приветствие и подсказки; окна (биржа, флот) остаются,
        // чтобы их можно было проверить скриншотом
        shotStyle.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#onb-card,#onb-guide{display:none !important}';
        document.head.appendChild(shotStyle);
    }

    if (/[?&]onb=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay{display:none !important}';
        document.head.appendChild(st);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(tick, 2200); });
    } else setTimeout(tick, 2200);
    setInterval(tick, 12000);
})();
