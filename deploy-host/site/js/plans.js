// Планы на будущее: правила «когда → что сделать» для флота, торговли и стройки.
// Правила хранятся в профиле на сервере, выполняются клиентом через обычные API игры.
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    var ACTIONS = [
        { id: 'colony_tick', name: 'Тик колонии (налоги, рост)', arg: null },
        { id: 'sell', name: 'Продать зерно, кг', arg: 1000 },
        { id: 'buy', name: 'Купить зерно, кг', arg: 1000 },
        { id: 'hire', name: 'Нанять переселенцев, чел', arg: 100 },
        { id: 'build_ship', name: 'Построить корабль', arg: 'jet_scout' },
        { id: 'build_factory', name: 'Построить фабрику', arg: 'androids' }
    ];

    var WHEN = [
        { id: 'every_10', name: 'каждые 10 минут' },
        { id: 'every_60', name: 'каждый час' },
        { id: 'credits_gt', name: 'когда кредитов больше 50 000' },
        { id: 'grain_lt', name: 'когда зерна меньше 10 000 кг' }
    ];

    var plans = [];
    var timer = null;

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text) d.textContent = text;
        return d;
    }

    function token() {
        try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; }
    }

    function user() {
        try {
            if (typeof window.getCurrentUser === 'function') return window.getCurrentUser();
            var raw = localStorage.getItem('galaktika_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function api(path, body, method) {
        return fetch(path, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }

    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }

    function styles() {
        if (document.getElementById('plans-style')) return;
        var s = document.createElement('style');
        s.id = 'plans-style';
        s.textContent = [
            '#plans-modal{position:fixed;inset:0;z-index:13000;display:none;align-items:center;justify-content:center;',
            'background:rgba(4,10,18,.78);padding:14px}',
            '#plans-modal .pl-card{width:min(680px,96vw);max-height:88vh;overflow:auto;background:#0d1a29;',
            'border:2px solid #23405f;border-radius:12px;padding:16px 18px;color:#dce8f7;',
            'font:13px/1.5 Inter,system-ui,sans-serif}',
            '.pl-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}',
            '.pl-head h2{margin:0;font-size:18px;color:#8fd0ff}',
            '.pl-sub{opacity:.65;font-size:12px;margin-bottom:12px}',
            '.pl-rule{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px;margin-bottom:8px;',
            'background:#101f33;border:1px solid #1e3350;border-radius:9px}',
            '.pl-rule select,.pl-rule input{padding:5px 7px;border-radius:6px;background:#0b1622;color:#dce8f7;',
            'border:1px solid #24405f;font:12px Inter,system-ui,sans-serif}',
            '.pl-rule input{width:78px}',
            '.pl-btn{padding:7px 12px;border-radius:8px;border:none;cursor:pointer;font-weight:700;font-size:12px;',
            'background:#2ecc71;color:#04121f}',
            '.pl-btn.ghost{background:#1a2c42;color:#cfe0f5;border:1px solid #2b4a6e}',
            '.pl-btn.warn{background:#3a1f1f;color:#ffb4b4;border:1px solid #7a2b2b}',
            '.pl-del{padding:3px 8px;border-radius:6px;border:1px solid #7a2b2b;background:#2a1414;color:#ffb4b4;',
            'cursor:pointer;font-size:11px}',
            '.pl-log{margin-top:10px;padding-top:10px;border-top:1px solid #16263d;font-size:11.5px;opacity:.8;',
            'max-height:120px;overflow:auto}'
        ].join('');
        document.head.appendChild(s);
    }

    function modal() {
        styles();
        var m = document.getElementById('plans-modal');
        if (m) return m;
        m = el('div', '', '');
        m.id = 'plans-modal';
        m.innerHTML = '<div class="pl-card">' +
            '<div class="pl-head"><h2>📜 Планы на будущее</h2>' +
            '<button class="pl-btn ghost" onclick="window.Plans.close()">✕</button></div>' +
            '<div class="pl-sub">Правила выполняются, пока игра открыта: флот, торговля, найм и стройка по расписанию.</div>' +
            '<div id="plans-list"></div>' +
            '<button class="pl-btn" id="plans-add">+ Добавить правило</button> ' +
            '<button class="pl-btn ghost" id="plans-save">Сохранить</button>' +
            '<div class="pl-log" id="plans-log"></div></div>';
        m.addEventListener('click', function (e) { if (e.target === m) close(); });
        document.body.appendChild(m);
        m.querySelector('#plans-add').onclick = function () {
            plans.push({ enabled: true, when: 'every_10', action: 'colony_tick', arg: null, lastRun: 0 });
            render();
        };
        m.querySelector('#plans-save').onclick = save;
        return m;
    }

    function render() {
        var box = document.getElementById('plans-list');
        if (!box) return;
        box.innerHTML = '';
        if (!plans.length) {
            box.appendChild(el('div', 'pl-sub', 'Пока нет правил. Добавьте первое — например «каждый час: тик колонии».'));
            return;
        }
        plans.forEach(function (p, i) {
            var row = el('div', 'pl-rule');

            var chk = el('input');
            chk.type = 'checkbox';
            chk.checked = !!p.enabled;
            chk.onchange = function () { p.enabled = chk.checked; };
            row.appendChild(chk);

            var when = el('select');
            WHEN.forEach(function (w) {
                var o = el('option', null, w.name);
                o.value = w.id;
                if (p.when === w.id) o.selected = true;
                when.appendChild(o);
            });
            when.onchange = function () { p.when = when.value; };
            row.appendChild(when);

            row.appendChild(el('span', null, '→'));

            var act = el('select');
            ACTIONS.forEach(function (a) {
                var o = el('option', null, a.name);
                o.value = a.id;
                if (p.action === a.id) o.selected = true;
                act.appendChild(o);
            });
            act.onchange = function () {
                p.action = act.value;
                var def = ACTIONS.filter(function (a) { return a.id === act.value; })[0];
                p.arg = def ? def.arg : null;
                render();
            };
            row.appendChild(act);

            var def = ACTIONS.filter(function (a) { return a.id === p.action; })[0];
            if (def && def.arg !== null) {
                if (p.action === 'build_ship') {
                    var sel = el('select');
                    ['jet_scout', 'jet_hauler', 'ion_courier', 'ion_prospector', 'ion_corsair'].forEach(function (sid) {
                        var o = el('option', null, sid);
                        o.value = sid;
                        if (p.arg === sid) o.selected = true;
                        sel.appendChild(o);
                    });
                    sel.onchange = function () { p.arg = sel.value; };
                    row.appendChild(sel);
                } else {
                    var inp = el('input');
                    inp.type = 'number';
                    inp.value = p.arg;
                    inp.onchange = function () { p.arg = parseInt(inp.value, 10) || 0; };
                    row.appendChild(inp);
                }
            }

            var del = el('button', 'pl-del', 'удалить');
            del.onclick = function () { plans.splice(i, 1); render(); };
            row.appendChild(del);

            box.appendChild(row);
        });
    }

    function save() {
        api('/api/plans/save', { plans: plans }).then(function (res) {
            if (!res || res.error) { toast(res && res.error ? res.error : 'не сохранилось'); return; }
            plans = res.plans || [];
            toast('Планы сохранены: ' + plans.length);
            render();
        });
    }

    function load() {
        if (!token()) return;
        api('/api/plans/list', null, 'GET').then(function (res) {
            if (res && res.plans) { plans = res.plans; render(); }
        });
    }

    function due(p, now) {
        var last = p.lastRun || 0;
        var u = user() || {};
        if (p.when === 'every_10') return now - last > 10 * 60 * 1000;
        if (p.when === 'every_60') return now - last > 60 * 60 * 1000;
        if (p.when === 'credits_gt') return (u.credits || 0) > 50000 && now - last > 10 * 60 * 1000;
        if (p.when === 'grain_lt') return ((u.resources || {}).grain || 0) < 10000 && now - last > 10 * 60 * 1000;
        return false;
    }

    function runAction(p) {
        var arg = p.arg;
        if (p.action === 'colony_tick') return api('/api/colony/tick', {});
        if (p.action === 'sell') return api('/api/npcmarket/trade', { key: 'grain', qty: arg, side: 'sell' });
        if (p.action === 'buy') return api('/api/npcmarket/trade', { key: 'grain', qty: arg, side: 'buy' });
        if (p.action === 'hire') return api('/api/hire', { count: arg, source: 'earth' });
        if (p.action === 'build_ship') return api('/api/build/start', { kind: 'ship', id: arg });
        if (p.action === 'build_factory') return api('/api/build/start', { kind: 'factory', id: arg });
        return Promise.resolve({ error: 'неизвестное действие' });
    }

    function tick() {
        if (!token() || !plans.length) return;
        var now = Date.now();
        var log = [];
        plans.forEach(function (p) {
            if (!p.enabled || !due(p, now)) return;
            p.lastRun = now;
            runAction(p).then(function (res) {
                var name = (ACTIONS.filter(function (a) { return a.id === p.action; })[0] || {}).name || p.action;
                log.push(name + ': ' + ((res && res.error) ? res.error : 'выполнено'));
                var box = document.getElementById('plans-log');
                if (box) box.textContent = log.join(' · ');
            });
        });
        api('/api/plans/save', { plans: plans });
    }

    function open() {
        modal().style.display = 'flex';
        load();
    }

    function close() {
        var m = document.getElementById('plans-modal');
        if (m) m.style.display = 'none';
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('plans-btn')) return;
        var b = el('button', 'menu-btn', '📜 Планы');
        b.id = 'plans-btn';
        b.setAttribute('data-tip', 'Планы|Автоматизация: флот, торговля, найм и стройка по правилам');
        b.onclick = open;
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    function addBuildButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('blocks-btn')) return;
        var b = el('button', 'menu-btn', '🧱 Конструктор');
        b.id = 'blocks-btn';
        b.setAttribute('data-tip', 'Конструктор|Блочный мир: собери сцену из блоков и сохрани скрипт');
        b.onclick = function () {
            if (!window.Blocks3D) { toast('Модуль блоков не загрузился'); return; }
            window.Blocks3D.open({ editor: true, title: '🧱 Конструктор сцен' });
        };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.saveSceneScript = function (script) {
        api('/api/scene/save', { name: 'Сцена игрока', script: script }).then(function (res) {
            if (!res || res.error) { toast(res && res.error ? res.error : 'не сохранилось'); return; }
            toast('Сцена сохранена, №' + res.id);
        });
    };

    window.Plans = { open: open, close: close, run: tick };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1600); });
    else setTimeout(boot, 1600);

    if (/[?&]plans=1/.test(location.search)) {
        setTimeout(function () {
            ['welcome-screen', 'auth-overlay', 'legend-overlay', 'tut-modal'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
            open();
        }, 1600);
    }

    function boot() {
        addMenuButton();
        addBuildButton();
        setInterval(addMenuButton, 4000);
        setInterval(addBuildButton, 4000);
        if (token()) { load(); timer = setInterval(tick, 60000); }
    }
})();
