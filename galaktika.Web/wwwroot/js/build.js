// Очередь стройки: сервер хранит таймеры, клиент показывает и предлагает ускорение.
// Ускорение — «Резонанс Вечности»: осколок Кристалла Вечности сжимает время сборки.
(function () {
    'use strict';

    var POLL_MS = 2000;
    var timer = null;
    var ticker = null;              // обновляет полосы и таймеры раз в секунду

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function user() { return (window.getCurrentUser && window.getCurrentUser()) || null; }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    // Время в человеческом виде: «2 ч 14 мин», «3 сут 4 ч», «45 с».
    // Раньше минуты не ограничивались и таймер показывал 29 миллиардов часов.
    function mmss(sec) {
        sec = Math.max(0, Math.round(sec));
        if (sec < 60) return sec + ' с';
        var m = Math.floor(sec / 60) % 60;
        var h = Math.floor(sec / 3600) % 24;
        var d = Math.floor(sec / 86400);
        if (d > 0) return d + ' сут ' + h + ' ч';
        if (h > 0) return h + ' ч ' + m + ' мин';
        return m + ' мин';
    }

    function apiPost(path, body) {
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: JSON.stringify(body || {})
        }).then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }

    function modal() {
        var el = document.getElementById('build-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'build-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(720px,96vw);max-height:86vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<h2 style="margin:0;font-size:20px;">🏗 Стройка</h2>' +
            '<button onclick="window.BuildPanel.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div style="opacity:.65;font-size:12px;margin-bottom:10px;">Каждый следующий уровень строится вдвое дольше. ' +
            '⚡ <b>Резонанс Вечности</b> — осколок Кристалла Вечности сжимает время сборки: 1 кристалл за минуту остатка.</div>' +
            '<div id="build-docks" style="margin-bottom:10px;padding:9px 12px;background:#0f1c2e;' +
            'border:1px solid #1e3a5f;border-radius:10px;font-size:12.5px;color:#9fb2c6">🏗 Доки: загрузка…</div>' +
            '<div id="build-body"></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.BuildPanel.close(); });
        document.body.appendChild(el);
        return el;
    }

    function render(data) {
        var box = document.getElementById('build-body');
        if (!box) return;
        var queue = (data && data.queue) || [];
        if (!queue.length) {
            box.innerHTML = '<p style="opacity:.7;">Очередь пуста. Стройте в доке: сооружения, корабли или модули колонии.</p>';
            refreshDock();
            return;
        }
        var rows = queue.map(function (item) {
            var total = Math.max(1, item.seconds || 1);
            var left = Math.max(0, item.remaining || 0);
            var pct = Math.max(0, Math.min(100, (1 - left / total) * 100));
            var crystals = Math.max(1, Math.min(240, Math.ceil(left / 60)));
            return '<div style="padding:10px 0;border-bottom:1px solid #16263d;" ' +
                'data-ends="' + (item.endsAt || 0) + '" data-total="' + total + '">' +
                '<div style="display:flex;justify-content:space-between;gap:10px;">' +
                '<span><b>' + esc(item.title) + '</b>' + (item.level ? ' · уровень ' + item.level : '') + '</span>' +
                '<span class="bld-left">' + mmss(left) + '</span></div>' +
                '<div class="bld-track" style="height:6px;background:#16263d;border-radius:3px;overflow:hidden;margin:6px 0;">' +
                '<div class="bld-bar" style="height:100%;width:' + pct.toFixed(1) + '%;background:#4f8ef7;"></div></div>' +
                '<button class="accel" data-uid="' + esc(item.uid) + '" style="padding:5px 10px;border-radius:6px;border:none;' +
                'background:#a78bfa;color:#12061f;font-weight:bold;cursor:pointer;">⚡ Ускорить · ' + crystals + ' крст</button>' +
                '</div>';
        }).join('');
        box.innerHTML = rows;

        // локальный тикер: полоса и таймер идут каждую секунду, без запросов к серверу
        if (ticker) clearInterval(ticker);
        ticker = setInterval(function () {
            var nodes = box.querySelectorAll('[data-ends]');
            if (!nodes.length) { clearInterval(ticker); ticker = null; return; }
            Array.prototype.forEach.call(nodes, function (node) {
                var endsAt = parseFloat(node.getAttribute('data-ends') || '0');
                var total = parseFloat(node.getAttribute('data-total') || '1');
                if (!endsAt) return;
                var left = Math.max(0, Math.round(endsAt - Date.now() / 1000));
                var bar = node.querySelector('.bld-bar');
                var lab = node.querySelector('.bld-left');
                if (bar) bar.style.width = Math.max(0, Math.min(100, (1 - left / total) * 100)).toFixed(1) + '%';
                if (lab) lab.textContent = mmss(left);
            });
        }, 1000);
        Array.prototype.forEach.call(box.querySelectorAll('button.accel'), function (btn) {
            btn.onclick = function () {
                btn.disabled = true;
                btn.style.opacity = '.5';
                apiPost('/api/build/accelerate', { uid: btn.getAttribute('data-uid') }).then(function (res) {
                    if (res && res.error) { toast(res.error); btn.disabled = false; btn.style.opacity = '1'; return; }
                    if (res && res.applied && res.applied.length) {
                        toast('Готово: ' + res.applied[0].title + ' ⚡');
                        if (window.pullServerProfile) window.pullServerProfile();
                    }
                    load();
                });
            };
        });
    }

    // доки: общие для постройки кораблей и модернизации
    function paintDocks() {
        var box = document.getElementById('build-docks');
        if (!box || !token()) return;
        fetch('/api/docks/status', { headers: { 'X-Auth-Token': token() } })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!d || typeof d.docks === 'undefined') return;
                var busy = (d.busy || []);
                var queue = (d.queue || []);
                // занято = уже стоящие корабли + те, что строятся
                var u = (window.getCurrentUser && window.getCurrentUser()) || {};
                var ships = (u.ships || []).length;
                var used = Math.min(d.docks, ships + busy.length);
                var cells = '';
                for (var i = 0; i < d.docks; i++) {
                    var isUsed = i < used;
                    cells += '<span style="display:inline-block;width:20px;height:20px;border-radius:5px;' +
                        'margin-right:3px;line-height:20px;text-align:center;background:' +
                        (isUsed ? '#8a4a2a' : '#1f3a2a') + '">' + (isUsed ? '⚓' : '✓') + '</span>';
                }
                box.innerHTML = '<b style="color:#8fd6ff">🏗 Доки: ' + used + ' / ' + d.docks + '</b> ' +
                    cells +
                    (busy.length ? '<div style="margin-top:4px">' + busy.map(function (j) {
                        return '• ' + j.title + ' — ' + Math.ceil(j.left / 60) + ' мин';
                    }).join('<br>') + '</div>' : '') +
                    (queue.length ? '<div style="margin-top:4px;color:#ffd05a">В очереди: ' + queue.length + '</div>' : '') +
                    (d.docks < 5 ? '<div style="margin-top:4px">Следующий док: ' +
                        Math.round(d.upgradeCost).toLocaleString('ru-RU') + ' кр — в панели «Модернизация»</div>' : '');
            })
            .catch(function () {});
    }

    function refreshDock() {
        if (typeof window.renderDock === 'function') {
            try { window.renderDock(); } catch (e) { }
        }
    }

    function load() {
        if (!token()) return;
        apiPost('/api/build/status', {}).then(function (res) {
            if (!res) return;
            if (res.applied && res.applied.length) {
                res.applied.forEach(function (a) { toast('Построено: ' + a.title); });
                if (window.pullServerProfile) window.pullServerProfile();
                refreshDock();
            }
            var u = user();
            if (u && typeof res.credits === 'number') {
                u.credits = res.credits;
                if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            }
            render(res);
            paintDocks();
            updateMenuBadge(res.queue || []);
        });
    }

    function updateMenuBadge(queue) {
        var btn = document.getElementById('build-menu-btn');
        if (!btn) return;
        btn.textContent = queue.length ? ('🏗 Стройка (' + queue.length + ')') : '🏗 Стройка';
    }

    window.BuildPanel = {
        open: function () {
            modal().style.display = 'flex';
            load();
            if (timer) clearInterval(timer);
            timer = setInterval(load, POLL_MS);
        },
        close: function () {
            var m = document.getElementById('build-modal');
            if (m) m.style.display = 'none';
            if (timer) { clearInterval(timer); timer = null; }
        },
        refresh: load
    };

    // Начать стройку через сервер (вызывается из дока)
    window.buildStart = function (kind, id) {
        var body = { kind: kind };
        if (kind === 'module') body.id = id; else body.id = id;
        return apiPost('/api/build/start', body).then(function (res) {
            if (!res) { toast('Сервер недоступен'); return null; }
            if (res.error) {
            var msg = String(res.error);
            var RU = { steel: 'сталь', copper: 'медь', nickel: 'никель', silver: 'серебро', gold: 'золото',
                chips: 'чипы', boards: 'платы', manip: 'манипуляторы', quartz: 'кварц', ice: 'лёд',
                water: 'вода', grain: 'зерно', polymer: 'полимер', credit: 'кредиты', credits: 'кредиты' };
            Object.keys(RU).forEach(function (k) {
                msg = msg.replace(new RegExp('\\b' + k + '\\b', 'g'), RU[k]);
            });
            if (msg.indexOf('не хватает') >= 0) {
                msg += ' — докупите на бирже или добудьте в поясе астероидов';
            }
            toast(msg);
            if (typeof window.notify === 'function') window.notify(msg);
            return null;
        }
            var u = user();
            if (u && typeof res.credits === 'number') u.credits = res.credits;
            if (window.pullServerProfile) window.pullServerProfile();
            toast('В очереди: ' + res.queued.title + ' · ' + mmss(res.queued.seconds));
            load();
            return res;
        });
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('build-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'build-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🏗 Стройка';
        b.onclick = function () { window.BuildPanel.open(); };
        items.appendChild(b);
    }

    function boot() {
        addMenuButton();
        if (token()) {
            setInterval(function () { if (!document.hidden) load(); }, 15000);
            load();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
