// Задания новичка: пять шагов на первые минуты, награда приходит автоматически.
(function () {
    'use strict';

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function modal() {
        var el = document.getElementById('quests-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'quests-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(680px,96vw);max-height:86vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<h2 style="margin:0;font-size:20px;">🎯 Первые шаги</h2>' +
            '<button onclick="window.Quests.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div style="opacity:.65;font-size:12px;margin-bottom:12px;">Награда начисляется сама, как только шаг сделан.</div>' +
            '<div id="quests-body">Загрузка…</div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Quests.close(); });
        document.body.appendChild(el);
        return el;
    }

    function achievementsHtml(data) {
        var list = (data && data.achievements) || [];
        if (!list.length) return '';
        var done = list.filter(function (a) { return a.done; }).length;
        var rows = list.map(function (a) {
            return '<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;' +
                (a.done ? 'opacity:.55;' : '') + '">' +
                '<span>' + (a.done ? '🏆 ' : '▫️ ') + esc(a.title) + '</span>' +
                '<span style="color:' + (a.done ? '#2ecc71' : '#f1c40f') + ';white-space:nowrap;">' +
                '+' + money(a.credits) + ' кр' + (a.crystals ? ' · +' + a.crystals + ' крст' : '') + '</span></div>';
        }).join('');
        return '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #16263d;">' +
            '<div style="margin-bottom:6px;"><b>Достижения</b> <span style="opacity:.6;">(' + done + ' из ' + list.length + ')</span></div>' +
            rows + '</div>';
    }

    function render(data) {
        var box = document.getElementById('quests-body');
        if (!box) return;
        var list = (data && data.quests) || [];
        if (!list.length) { box.textContent = 'Заданий нет.'; return; }
        box.innerHTML = list.map(function (q) {
            return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;' +
                'border:1px solid #16263d;border-radius:10px;padding:10px 12px;margin-bottom:8px;' +
                (q.done ? 'opacity:.55;' : '') + '">' +
                '<div><div>' + (q.done ? '✅ ' : '▫️ ') + '<b>' + esc(q.title) + '</b></div>' +
                '<div style="opacity:.6;font-size:12px;">' + esc(q.hint) + '</div></div>' +
                '<div style="white-space:nowrap;font-weight:bold;color:' + (q.done ? '#2ecc71' : '#f1c40f') + ';">' +
                '+' + money(q.reward) + ' кр</div></div>';
        }).join('') +
            '<div style="margin-top:10px;opacity:.75;">Осталось: ' +
            list.filter(function (q) { return !q.done; }).length + ' из ' + list.length + '</div>' +
            achievementsHtml(data);

        var left = list.filter(function (q) { return !q.done; }).length;
        var btn = document.getElementById('quests-menu-btn');
        if (btn) btn.textContent = left ? ('🎯 Задания (' + left + ')') : '🎯 Задания';
        if (!left && window.localStorage) {
            try { localStorage.setItem('galaktika_quests_done', '1'); } catch (e) { }
        }
    }

    function load() {
        if (!token()) return;
        fetch('/api/quests', { headers: { 'X-Auth-Token': token() } })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (d) {
                render(d);
                if (d && typeof d.credits === 'number') {
                    var u = window.getCurrentUser && window.getCurrentUser();
                    if (u) {
                        var before = Number(u.credits) || 0;
                        u.credits = d.credits;
                        // кредиты не должны «молча» прыгать: показываем источник
                        var diff = Math.round(d.credits - before);
                        if (Math.abs(diff) >= 1000 && typeof window.notify === 'function') {
                            window.notify(diff > 0
                                ? 'Награды за задания: +' + Math.round(diff).toLocaleString('ru-RU') + ' кр'
                                : 'Списано: ' + Math.round(-diff).toLocaleString('ru-RU') + ' кр');
                        }
                        if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
                    }
                }
            }).catch(function () { render(null); });
    }

    window.Quests = {
        open: function () { modal().style.display = 'flex'; load(); },
        close: function () {
            var m = document.getElementById('quests-modal');
            if (m) m.style.display = 'none';
        },
        refresh: load
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('quests-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'quests-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🎯 Задания';
        b.onclick = function () { window.Quests.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            addMenuButton();
            if (document.getElementById('quests-menu-btn') || tries > 20) clearInterval(t);
        }, 1000);
        if (token()) setTimeout(load, 1500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
