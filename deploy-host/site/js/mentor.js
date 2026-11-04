// Наставник для нового игрока: история и пошаговые задачи.
// Подключается после solar.js; состояние шага хранится в профиле (mentorStep).
(function () {
    // на служебных страницах (pv/war/garage) обучение не запускается
    var q = new URLSearchParams(location.search);
    if (q.has('pv') || q.has('planet') || q.has('war') || q.has('garage') || q.has('quest') || q.has('spec') || q.has('sys') || q.has('sandbox') || q.has('tour')) return;
    window.__servicePageGuard = true;

    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    var STEP_KEY = 'gm_mentor_step';

    var STEPS = [
        {
            id: 'look',
            panelName: 'Ресурсы',
            action: 'Нажмите «Ресурсы»',
            title: 'Осмотреться',
            story: 'Вы просыпаетесь в тесной каюте на орбитальной станции. За иллюминатором — '
                + 'Млечный Путь, а в кармане скафандра — 200 000 кредитов и немного стали. '
                + 'Пора понять, что у вас есть.',
            task: 'Откройте «📦 Ресурсы» и посмотрите, чем вы располагаете.',
            target: ['Ресурсы'],
            panel: 'resources',
            inside: 'Все ресурсы по категориям',
            explain: [
                '📦 Ресурсы — ваш склад: сколько чего добыто и сколько влезает.',
                'Здесь видно все ресурсы склада: металлы, льды, газы, органика.',
                'Отсюда же запускается добыча на поверхности: «🌍 Поверхность».',
                'Если ресурса не хватает на постройку — покупайте на бирже или добывайте.'
            ],
            check: function (u) { return u.__sawResources === true; },
            hint: function () { return 'Нажмите «📦 Ресурсы» в левом меню — там склад и добыча.'; }
        },
        {
            id: 'sell',
            panelName: 'Биржа',
            action: 'Нажмите «Биржа»',
            title: 'Первая сделка',
            story: 'Диспетчер станции советует: «На бирже платят за сталь. Продайте излишек — '
                + 'на выручку можно поставить корабль».',
            task: 'Продайте 100 кг стали на «📈 Бирже» — это первый доход.',
            target: ['Биржа', 'Рынок'],
            panel: 'market',
            inside: 'Кнопка продажи',
            explain: [
                '📈 Биржа — NPC-рынок: покупает и продаёт ресурсы по рыночной цене.',
                'Цена меняется: когда все продают — падает, когда скупают — растёт.',
                'Продавайте излишки, покупайте нужное для корабля или колонии.',
                'Дальше появятся лоты живых игроков: «🏪 Рынок» — там цена договорная.'
            ],
            check: function (u) { return (u.credits || 0) >= 201000; },
            hint: function (u) {
                return 'Откройте «📈 Биржа», выберите сталь и продайте 100 кг. Сейчас у вас '
                    + Math.round(u.credits || 0).toLocaleString('ru-RU') + ' кр.';
            }
        },
        {
            id: 'ship',
            panelName: 'Флот',
            action: 'Нажмите «Флот»',
            title: 'Свой корабль',
            story: 'Без корабля вы прикованы к станции. Разведчик «Искра» стоит 18 000 кредитов '
                + 'и требует 60 кг стали, 20 меди, 10 никеля, немного серебра, золота, чипов и плат.',
            task: 'Постройте корабль в доке: «🚀 Флот» → «Искра» → Построить.',
            target: ['Флот', 'Док'],
            panel: 'fleet',
            inside: 'Искра',
            explain: [
                '🚀 Флот — док: здесь покупаются и строятся корабли.',
                'Каждому кораблю нужны кредиты И комплектующие: сталь, медь, никель, чипы, платы.',
                'Мест в доке — 2: третий корабль не встанет, пока не расширите док.',
                '«Искра» — самый дешёвый разведчик: 18 000 кр и немного ресурсов.'
            ],
            check: function (u) { return (u.ships || []).length > 0; },
            hint: function (u) {
                var s = (window.SHIPS || {}).jet_scout;
                if (!s) return 'Откройте «🚀 Флот» и выберите «Искру».';
                var miss = [];
                if ((u.credits || 0) < s.price) {
                    miss.push('кредитов ' + (s.price - Math.round(u.credits || 0)).toLocaleString('ru-RU'));
                }
                Object.keys(s.parts || {}).forEach(function (k) {
                    var need = (s.parts || {})[k] || 0;
                    var have = (u.resources || {})[k] || 0;
                    if (have < need) {
                        miss.push((NAMES[k] || k) + ' ' + need + ' (есть ' + Math.round(have) + ')');
                    }
                });
                if (!miss.length) return 'Всё есть — открывайте «🚀 Флот» и стройте «Искру».';
                return 'Не хватает: ' + miss.join(', ') + '. Ресурсы покупаются на бирже или добываются в поясе астероидов.';
            }
        },
        {
            id: 'survey',
            panelName: 'Разведка',
            action: 'Нажмите «Разведка»',
            title: 'Разведка',
            story: 'В поясе астероидов между Марсом и Юпитером кружит металл: серебро, золото, '
                + 'редкие кристаллы. Разведчик окупится за пару рейсов.',
            task: 'Отправьте разведку астероидов (кнопка в панели видов) — стоит 3 000 кр.',
            target: ['Разведка', 'Поверхность'],
            panel: 'fleet',
            explain: [
                '🛰 Разведка астероидов: рейс стоит 3 000 кр и приносит серебро и золото.',
                '🌍 Поверхность — добыча на планете: ставите буровые и получаете руду каждый тик.',
                'Добытое можно продать на бирже — это главный доход новичка.'
            ],
            check: function (u) { return (u.resources || {}).silver >= 20; },
            hint: function (u) {
                if ((u.ships || []).length === 0) return 'Сначала постройте корабль — без него разведка недоступна.';
                if ((u.credits || 0) < 3000) return 'Нужно 3 000 кр на рейс, у вас ' + Math.round(u.credits || 0).toLocaleString('ru-RU') + ' кр.';
                return 'Найдите кнопку «Разведка астероидов» в панели видов (справа) и нажмите её.';
            }
        },
        {
            id: 'colony',
            panelName: 'Колония',
            action: 'Нажмите «Колония»',
            title: 'Колония',
            story: 'Земля далеко, а жить где-то надо. На Луне продают участок под колонию: '
                + '300 000 кредитов и корабль-носильщик. Дорого — но это ваш дом.',
            task: 'Накопите 300 000 кр и оснуйте колонию («🏙 Колония» → Основать).',
            target: ['Колония'],
            panel: 'colony',
            explain: [
                '🏙 Колония — ваш дом: население, налоги, счастье, стройка, оборона.',
                'Колония стоит 300 000 кр и корабль: он уйдёт на перевозку людей.',
                'Население платит налоги каждый день, но ест 0,3 кг зерна и пьёт 0,003 т воды.',
                'Ставка налога: 10 % — мало денег, 20 % — рост, но счастье падает.'
            ],
            check: function (u) { return !!u.colony; },
            hint: function (u) {
                var need = 300000 - Math.round(u.credits || 0);
                if ((u.ships || []).length === 0) return 'Для колонии нужен корабль: он уйдёт на перевозку людей.';
                if (need > 0) return 'Не хватает ' + need.toLocaleString('ru-RU') + ' кр. Источники: торговля на бирже, разведка, налоги других колоний.';
                return 'Денег достаточно — открывайте «🏙 Колония» и основывайте.';
            }
        }
    ];

    var NAMES = {
        steel: 'сталь', copper: 'медь', nickel: 'никель', silver: 'серебро', gold: 'золото',
        chips: 'чипы', boards: 'платы', manip: 'манипуляторы', quartz: 'кварц',
        grain: 'зерно', water: 'вода', ice: 'лёд', polymer: 'полимер'
    };

    var box = null;
    var stepIndex = 0;
    var collapsed = false;

    function user() {
        try {
            if (typeof window.getCurrentUser === 'function') return window.getCurrentUser();
            if (typeof window.currentUser !== 'undefined' && window.currentUser) return window.currentUser;
            var raw = localStorage.getItem('galaktika_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function loadStep() {
        var n = 0;
        try { n = parseInt(localStorage.getItem(STEP_KEY) || '0', 10) || 0; } catch (e) { n = 0; }
        return Math.max(0, Math.min(STEPS.length - 1, n));
    }

    function saveStep(n) {
        try { localStorage.setItem(STEP_KEY, String(n)); } catch (e) { }
        var u = user();
        if (u && typeof window.saveUser === 'function') {
            u.mentorStep = n;
            try { window.saveUser(); } catch (e) { }
        }
    }

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text) d.textContent = text;
        return d;
    }

    function build() {
        if (document.getElementById('mentor-box')) return;

        box = el('div', 'mentor-box');
        box.id = 'mentor-box';

        var head = el('div', 'mentor-head');
        var title = el('div', 'mentor-title', '🤖 Наставник');
        head.appendChild(title);
        var min = el('button', 'mentor-min', '—');
        min.type = 'button';
        min.title = 'Свернуть';
        min.onclick = function () { collapsed = !collapsed; box.classList.toggle('mentor-collapsed', collapsed); };
        head.appendChild(min);
        box.appendChild(head);

        var body = el('div', 'mentor-body');
        body.id = 'mentor-body';
        box.appendChild(body);

        var foot = el('div', 'mentor-foot');
        var next = el('button', 'mentor-next', 'Понятно');
        next.type = 'button';
        next.onclick = function () {
            clearSpot();
            closePanel(STEPS[stepIndex]);
            openedFor = -1;
            if (stepIndex < STEPS.length - 1) { stepIndex += 1; saveStep(stepIndex); render(); }
            else { collapsed = true; box.classList.add('mentor-collapsed'); }
        };
        foot.appendChild(next);
        var inChat = el('button', 'mentor-help', 'В чат');
        inChat.type = 'button';
        inChat.title = 'Рекомендации — в панели чата';
        inChat.onclick = function () {
            if (window.Chat && typeof window.Chat.open === 'function') window.Chat.open();
            else if (typeof window.openChat === 'function') window.openChat();
        };
        foot.appendChild(inChat);
        var help = el('button', 'mentor-help', 'Что мешает?');
        help.type = 'button';
        help.onclick = function () { checkBlockers(true); };
        foot.appendChild(help);
        box.appendChild(foot);

        document.body.appendChild(box);

        var style = document.createElement('style');
        style.textContent = [
            '.mentor-box{position:fixed;right:14px;bottom:14px;z-index:9500;width:min(340px,calc(100vw - 28px));',
            'background:#0b1727;border:1px solid #2c4a6e;border-radius:14px;color:#dce8f7;',
            'font:12.5px/1.5 Inter,system-ui,Segoe UI,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5);overflow:hidden}',
            '.mentor-head{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;',
            'background:linear-gradient(90deg,#12263f,#0b1727);border-bottom:1px solid #1d3450}',
            '.mentor-title{font-weight:700;font-size:13px;color:#8fd0ff}',
            '.mentor-min{background:none;border:none;color:#7f93ad;font-size:15px;cursor:pointer}',
            '.mentor-body{padding:10px 12px;max-height:38vh;overflow-y:auto;overscroll-behavior:contain}',
            '.mentor-story{color:#b9cbe0;margin-bottom:8px}',
            '.mentor-task{background:#101f33;border-left:3px solid #4f8ef7;padding:7px 9px;border-radius:0 8px 8px 0;margin:6px 0}',
            '.mentor-hint{color:#ffcf7a;margin-top:6px}',
            '.mentor-ok{color:#2ecc71;margin-top:6px}',
            '.mentor-dots{display:flex;gap:4px;margin-top:8px}',
            '.mentor-dot{width:7px;height:7px;border-radius:50%;background:#22374f}',
            '.mentor-dot.on{background:#4f8ef7}',
            '.mentor-dot.done{background:#2ecc71}',
            '.mentor-foot{display:flex;gap:8px;padding:9px 12px;border-top:1px solid #1d3450}',
            '.mentor-next{flex:1;padding:7px 10px;border-radius:8px;border:none;background:#4f8ef7;color:#04121f;font-weight:700;cursor:pointer}',
            '.mentor-help{padding:7px 10px;border-radius:8px;border:1px solid #2c4a6e;background:#101f33;color:#cfe0f5;cursor:pointer}',
            '.mentor-collapsed .mentor-body,.mentor-collapsed .mentor-foot{display:none}',
            '.mentor-explain{background:#0d1a2a;border:1px solid #1d3450;border-radius:9px;padding:8px 10px;margin:7px 0}',
            '.mentor-explain-line{color:#b9cbe0;font-size:11.5px;margin:3px 0;line-height:1.45}',
            '.mentor-open{width:100%;margin-top:6px;padding:7px 10px;border-radius:8px;border:1px dashed #3a5f86;',
            'background:#101f33;color:#8fd0ff;cursor:pointer;font:600 11.5px Inter,system-ui,sans-serif}',
            '.mentor-spot{outline:3px solid #ffd166 !important;outline-offset:2px;border-radius:8px;',
            'animation:mentorPulse 1.15s ease-in-out infinite;position:relative;z-index:9600}',
            '@keyframes mentorPulse{0%,100%{box-shadow:0 0 0 3px rgba(255,209,102,.30),0 0 16px rgba(255,209,102,.55)}',
            '50%{box-shadow:0 0 0 8px rgba(255,209,102,.12),0 0 30px rgba(255,209,102,.85)}}',
            '.mentor-callout{position:fixed;z-index:9601;pointer-events:none;background:#ffd166;color:#1a1200;',
            'font:700 11.5px Inter,system-ui,sans-serif;padding:5px 9px;border-radius:8px;',
            'box-shadow:0 6px 18px rgba(0,0,0,.45);animation:mentorBob 1.1s ease-in-out infinite}',
            '@keyframes mentorBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}'
        ].join('');
        document.head.appendChild(style);
    }

    var spotEl = null;
    var calloutEl = null;

    function clearSpot() {
        if (spotEl) spotEl.classList.remove('mentor-spot');
        spotEl = null;
        if (calloutEl && calloutEl.parentNode) calloutEl.parentNode.removeChild(calloutEl);
        calloutEl = null;
    }

    function findTarget(step) {
        if (!step.target) return null;
        var btns = Array.prototype.slice.call(document.querySelectorAll('button, .menu-btn'))
            .filter(function (b) { return !b.closest('#mentor-box') && !b.closest('#reactor-wrap'); });
        for (var t = 0; t < step.target.length; t++) {
            var key = step.target[t];
            for (var i = 0; i < btns.length; i++) {
                var b = btns[i];
                if (!b.offsetParent) continue;
                var text = (b.textContent || '').trim();
                if (text.indexOf(key) >= 0) return b;
            }
        }
        // кнопка может быть в свёрнутой группе — раскрываем её
        for (var t2 = 0; t2 < step.target.length; t2++) {
            var key2 = step.target[t2];
            for (var j = 0; j < btns.length; j++) {
                var hidden = btns[j];
                if (hidden.offsetParent) continue;
                if ((hidden.textContent || '').indexOf(key2) < 0) continue;
                var body = hidden.closest('.menu-sec-body');
                if (body && body.classList.contains('menu-collapsed')) {
                    var title = body.previousElementSibling;
                    if (title && title.classList.contains('menu-sec-title')) title.click();
                }
            }
        }
        for (var t3 = 0; t3 < step.target.length; t3++) {
            for (var k = 0; k < btns.length; k++) {
                if (!btns[k].offsetParent) continue;
                if ((btns[k].textContent || '').indexOf(step.target[t3]) >= 0) return btns[k];
            }
        }
        return null;
    }

    function calloutFor(el, label) {
        var box = el.getBoundingClientRect();
        var tip = document.createElement('div');
        tip.className = 'mentor-callout';
        tip.textContent = '👇 ' + label;
        document.body.appendChild(tip);
        var tr = tip.getBoundingClientRect();
        var left = Math.min(window.innerWidth - tr.width - 8, Math.max(8, box.right + 10));
        var top = Math.min(window.innerHeight - tr.height - 8, Math.max(8, box.top + box.height / 2 - tr.height / 2));
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
        return tip;
    }

    function ensureMenuOpen() {
        var items = document.getElementById('left-menu-items');
        if (items && getComputedStyle(items).display === 'none') {
            items.style.display = 'flex';
            var menu = document.getElementById('left-menu');
            if (menu) {
                menu.style.display = 'flex';
                menu.classList.remove('collapsed');
            }
        }
    }

    function spotlight(step, u) {
        ensureMenuOpen();
        var el = findTarget(step);
        if (!el) { clearSpot(); return; }
        if (el === spotEl) {
            // пересчитываем позицию подсказки
            if (calloutEl) {
                var box = el.getBoundingClientRect();
                calloutEl.style.left = Math.min(window.innerWidth - 12, box.right + 10) + 'px';
                calloutEl.style.top = Math.max(8, box.top + box.height / 2 - 12) + 'px';
            }
            return;
        }
        clearSpot();
        spotEl = el;
        el.classList.add('mentor-spot');
        try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { }
        calloutEl = calloutFor(el, step.action || 'Нажмите здесь');
    }

    var openedFor = -1;

    function openPanel(step, idx) {
        // Раньше наставник САМ открывал окна (биржу, склад, флот) — игрок видел
        // «само открылось окно биржи». Теперь только подсвечиваем кнопку,
        // открывает её сам игрок.
        if (!step || !step.panel) return;
        if (openedFor === idx) return;
        openedFor = idx;
        return;
    }

    function closePanel(step) {
        if (!step || !step.panel) return;
        try {
            if (step.panel === 'colony' && window.Colony && window.Colony.close) window.Colony.close();
            if (step.panel === 'market' && window.Market && window.Market.close) window.Market.close();
            if (step.panel === 'fleet' && typeof window.closeFleet === 'function') window.closeFleet();
            if (step.panel === 'resources' && typeof window.closeResourcesPanel === 'function') window.closeResourcesPanel();
        } catch (e) { }
    }

    function render() {
        build();
        var u = user() || {};
        var step = STEPS[stepIndex];
        var body = document.getElementById('mentor-body');
        if (!body) return;
        body.innerHTML = '';

        body.appendChild(el('div', 'mentor-story', step.story));
        var task = el('div', 'mentor-task');
        task.appendChild(el('b', null, 'Задача ' + (stepIndex + 1) + ' из ' + STEPS.length + ': '));
        task.appendChild(document.createTextNode(step.task));
        body.appendChild(task);

        if (step.explain && step.explain.length) {
            var list = el('div', 'mentor-explain');
            step.explain.forEach(function (line) {
                list.appendChild(el('div', 'mentor-explain-line', line));
            });
            body.appendChild(list);
        }

        if (step.panel) {
            var openBtn = el('button', 'mentor-open', '📂 Открыть «' + (step.panelName || 'панель') + '»');
            openBtn.type = 'button';
            openBtn.onclick = function () { openedFor = -1; openPanel(step, stepIndex); };
            body.appendChild(openBtn);
        }

        var done = false;
        try { done = !!step.check(u); } catch (e) { done = false; }
        if (done) {
            body.appendChild(el('div', 'mentor-ok', '✓ Выполнено. Нажмите «Понятно», чтобы идти дальше.'));
        } else {
            body.appendChild(el('div', 'mentor-hint', 'Подсказка: ' + step.hint(u)));
        }

        if (!done) {
            openPanel(step, stepIndex);
            setTimeout(function () { spotlight(step, u); }, 450);
        } else clearSpot();

        var dots = el('div', 'mentor-dots');
        STEPS.forEach(function (s, i) {
            var d = el('span', 'mentor-dot' + (i === stepIndex ? ' on' : (i < stepIndex ? ' done' : '')));
            dots.appendChild(d);
        });
        body.appendChild(dots);
    }

    function checkBlockers(loud) {
        var u = user() || {};
        var step = STEPS[stepIndex];
        var text;
        try {
            text = step.check(u) ? 'Шаг уже выполнен — жмите «Понятно».' : step.hint(u);
        } catch (e) {
            text = 'Не удалось проверить состояние.';
        }
        if (loud && typeof window.notify === 'function') window.notify(text);
        var hintEl = document.querySelector('#mentor-body .mentor-hint');
        if (hintEl) hintEl.textContent = 'Подсказка: ' + text;
    }

    function tick() {
        var u = user();
        if (!u) {
            // вышли из игры — карточка наставника больше не нужна
            ['mentor-box', 'mentor-body'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.remove();
            });
            return;
        }
        var step = STEPS[stepIndex];
        var ok = false;
        try { ok = !!step.check(u); } catch (e) { ok = false; }
        if (ok) {
            if (typeof window.notify === 'function') window.notify('✓ Задача выполнена: ' + step.title);
            if (stepIndex < STEPS.length - 1) {
                stepIndex += 1;
                saveStep(stepIndex);
                render();
            } else {
                render();
            }
            return;
        }
        if (!ok) spotlight(step, u);
        // обновляем подсказку по актуальным данным
        var hintEl = document.querySelector('#mentor-body .mentor-hint');
        if (hintEl) {
            try { hintEl.textContent = 'Подсказка: ' + step.hint(u); } catch (e) { }
        }
    }

    function markResourcesSeen() {
        var u = user();
        if (!u || u.__sawResources) return;
        u.__sawResources = true;
        render();
    }

    var DEMO = /[?&]mentor=1/.test(location.search);

    function boot() {
        if (DEMO && !user()) {
            // режим проверки: показываем наставника с демонстрационным состоянием
            window.__mentorDemo = { credits: 200000, resources: { steel: 140, copper: 40, nickel: 20 }, ships: [] };
            var menu = document.getElementById('left-menu');
            if (menu) menu.style.display = 'flex';
            stepIndex = loadStep();
            render();
            setInterval(function () {
                var m2 = document.getElementById('left-menu');
                if (m2) m2.style.display = 'flex';
                spotlight(STEPS[stepIndex], window.__mentorDemo);
            }, 1200);
            return;
        }
        if (!user()) { setTimeout(boot, 2500); return; }
        stepIndex = loadStep();
        render();
        setInterval(tick, 2500);

        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) return;
            var btn = t.closest('button');
            if (btn && (btn.textContent || '').indexOf('Ресурсы') >= 0) markResourcesSeen();
        }, true);
    }

    window.Mentor = { show: function () { collapsed = false; if (box) box.classList.remove('mentor-collapsed'); render(); },
        step: function () { return stepIndex; } };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 2000); });
    else setTimeout(boot, 2000);
})();
