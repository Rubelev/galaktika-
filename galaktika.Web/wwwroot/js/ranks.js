// Звания капитана: условия, прогресс, повышение с наградой.
// Состояние хранится в профиле игрока (currentUser.rank), уезжает на сервер через syncProfile.
(function () {
    'use strict';

    function user() { return (window.getCurrentUser && window.getCurrentUser()) || null; }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }
    function save() {
        if (typeof window.saveUser === 'function') window.saveUser();
        if (typeof window.syncProfile === 'function') window.syncProfile();
    }

    function shipsCount(u) {
        if (Array.isArray(u.ships)) return u.ships.length;
        var f = u.fleet || {};
        return Object.keys(f).reduce(function (a, k) { return a + (Number(f[k]) || 0); }, 0);
    }
    function buildingsCount(u) {
        var f = u.factories || {};
        return Object.keys(f).reduce(function (a, k) { return a + (Number(f[k]) > 0 ? 1 : 0); }, 0);
    }
    function colonyPop(u) { return (u.colony && u.colony.population) || 0; }

    // Условия описаны данными, чтобы прогресс можно было показать полосками.
    var RANKS = [
        { id: 'cadet', name: 'Капитан-стажёр', bonus: 0, needs: [] },
        {
            id: 'trader', name: 'Торговец', bonus: 5000,
            needs: [{ text: '200 000 кредитов', value: function (u) { return u.credits || 0; }, goal: 200000 }]
        },
        {
            id: 'owner', name: 'Владелец флота', bonus: 10000,
            needs: [
                { text: '200 000 кредитов', value: function (u) { return u.credits || 0; }, goal: 250000 },
                { text: '5 кораблей', value: shipsCount, goal: 5 }
            ]
        },
        {
            id: 'industrial', name: 'Промышленник', bonus: 20000,
            needs: [
                { text: '5 кораблей', value: shipsCount, goal: 5 },
                { text: '3 постройки', value: buildingsCount, goal: 3 },
                { text: 'колония 100 000 жителей', value: colonyPop, goal: 100000 }
            ]
        },
        {
            id: 'governor', name: 'Губернатор колонии', bonus: 40000,
            needs: [
                { text: 'колония 500 000 жителей', value: colonyPop, goal: 500000 },
                { text: 'счастье колонии 60%', value: function (u) { return (u.colony && u.colony.happiness) || 0; }, goal: 60 }
            ]
        },
        {
            id: 'magnate', name: 'Магнат', bonus: 80000,
            needs: [
                { text: '5 000 000 кредитов', value: function (u) { return u.credits || 0; }, goal: 5000000 },
                { text: 'колония 1 500 000', value: colonyPop, goal: 1500000 },
                { text: '10 кораблей', value: shipsCount, goal: 10 }
            ]
        },
        {
            id: 'legend', name: 'Легенда Галактики', bonus: 150000,
            needs: [
                { text: '10 000 000 кредитов', value: function (u) { return u.credits || 0; }, goal: 10000000 },
                { text: 'колония 3 000 000', value: colonyPop, goal: 3000000 },
                { text: '15 кораблей', value: shipsCount, goal: 15 }
            ]
        }
    ];

    function rankIndex(u) {
        var id = (u && u.rankId) || 'cadet';
        for (var i = 0; i < RANKS.length; i++) if (RANKS[i].id === id) return i;
        return 0;
    }

    function meets(rank, u) {
        return rank.needs.every(function (n) { return n.value(u) >= n.goal; });
    }

    // Чистая функция: какое звание положено и сколько наград выдать
    function evaluate(u) {
        if (!u) return { index: 0, bonus: 0, promoted: 0 };
        var current = rankIndex(u);
        var target = current;
        var bonus = 0;
        for (var i = current + 1; i < RANKS.length; i++) {
            if (meets(RANKS[i], u)) { target = i; bonus += RANKS[i].bonus; }
            else break;
        }
        return { index: target, bonus: bonus, promoted: target - current, from: current };
    }

    // Локальный расчёт — только когда нет токена (офлайн-режим).
    function localCheck(silent) {
        var u = user();
        if (!u) return null;
        var r = evaluate(u);
        if (r.index > rankIndex(u)) {
            u.rankId = RANKS[r.index].id;
            u.rank = RANKS[r.index].name;
            if (r.bonus > 0) u.credits = (u.credits || 0) + r.bonus;
            save();
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            if (!silent) toast('🎖 Новое звание: ' + RANKS[r.index].name + (r.bonus ? ' · +' + money(r.bonus) + ' кр' : ''));
            return r;
        }
        return r;
    }

    // Основная проверка: звание и награду решает сервер, клиент только показывает.
    function check(silent) {
        var u = user();
        if (!u) return null;
        var t = '';
        try { t = localStorage.getItem('galaktika_token') || ''; } catch (e) { t = ''; }
        if (!t) return localCheck(silent);
        fetch('/api/rank/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': t },
            body: '{}'
        }).then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (r) {
                if (!r || r.error) return;
                if (r.promoted > 0) {
                    u.rankId = r.rankId;
                    u.rank = r.rank;
                    if (typeof r.credits === 'number') u.credits = r.credits;
                    save();
                    if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                    if (!silent) toast('🎖 Новое звание: ' + r.rank + (r.bonus ? ' · +' + money(r.bonus) + ' кр' : ''));
                    render();
                }
            })
            .catch(function () { localCheck(silent); });
        return null;
    }

    // ---- интерфейс ----
    function modal() {
        var el = document.getElementById('rank-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'rank-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(720px,96vw);max-height:88vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<h2 style="margin:0;font-size:20px;">🎖 Звания</h2>' +
            '<button onclick="window.Ranks.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button>' +
            '</div><div id="rank-body"></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Ranks.close(); });
        document.body.appendChild(el);
        return el;
    }

    function bar(value, goal) {
        var pct = Math.max(0, Math.min(100, goal > 0 ? value / goal * 100 : 100));
        var color = pct >= 100 ? '#2ecc71' : (pct >= 50 ? '#f1c40f' : '#e74c3c');
        return '<div style="height:6px;background:#16263d;border-radius:3px;overflow:hidden;margin-top:4px;">' +
            '<div style="height:100%;width:' + pct.toFixed(1) + '%;background:' + color + ';"></div></div>';
    }

    function render() {
        var box = document.getElementById('rank-body');
        if (!box) return;
        var u = user();
        if (!u) { box.innerHTML = '<p>Войдите в игру.</p>'; return; }
        var idx = rankIndex(u);
        var cur = RANKS[idx];
        var next = RANKS[idx + 1];

        var html = '<div style="margin-bottom:12px;">Текущее звание: <b style="color:#f1c40f;">' + cur.name + '</b>' +
            (cur.bonus ? ' <span style="opacity:.6;">(награда ' + money(cur.bonus) + ' кр получена)</span>' : '') + '</div>';

        if (!next) {
            html += '<p>Все звания получены. Это высшая ступень в 2226 году.</p>';
        } else {
            html += '<div style="margin-bottom:8px;">Следующее: <b>' + next.name + '</b> · награда ' + money(next.bonus) + ' кр</div>';
            next.needs.forEach(function (n) {
                var v = n.value(u);
                html += '<div style="padding:7px 0;border-bottom:1px solid #16263d;">' +
                    '<div style="display:flex;justify-content:space-between;"><span>' + n.text + '</span>' +
                    '<span>' + (n.goal >= 1000 ? money(v) : Math.round(v)) + ' / ' + (n.goal >= 1000 ? money(n.goal) : n.goal) + '</span></div>' +
                    bar(v, n.goal) + '</div>';
            });
        }

        html += '<h3 style="margin:18px 0 6px;font-size:15px;">Все ступени</h3><table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<tr style="text-align:left;opacity:.6;"><th>Звание</th><th>Условия</th><th>Награда</th></tr>';
        RANKS.forEach(function (r, i) {
            var mark = i < idx ? '✅ ' : (i === idx ? '▶ ' : '');
            html += '<tr style="opacity:' + (i > idx ? .55 : 1) + ';"><td>' + mark + r.name + '</td>' +
                '<td>' + (r.needs.length ? r.needs.map(function (n) { return n.text; }).join(' · ') : 'старт') + '</td>' +
                '<td>' + (r.bonus ? money(r.bonus) + ' кр' : '—') + '</td></tr>';
        });
        html += '</table>';
        box.innerHTML = html;
    }

    window.Ranks = {
        open: function () { modal().style.display = 'flex'; check(true); render(); },
        close: function () { var m = document.getElementById('rank-modal'); if (m) m.style.display = 'none'; },
        check: function () { return check(false); },
        list: RANKS,
        evaluate: evaluate
    };
    window.RanksMath = { evaluate: evaluate, RANKS: RANKS };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('rank-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'rank-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🎖 Звания';
        b.onclick = function () { window.Ranks.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        check(true);
        setInterval(function () { check(true); }, 45000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
