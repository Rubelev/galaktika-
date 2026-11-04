// Брошенные миры: список и колонизация чужой колонии с остатками цивилизации.
(function () {
    'use strict';

    var COST = 200000;

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }

    var FAC = { robots: 'Фабрика андроидов', equipment: 'Завод оборудования' };

    function api(path, body) {
        var opt = { headers: { 'X-Auth-Token': token() } };
        if (body) {
            opt.method = 'POST';
            opt.headers['Content-Type'] = 'application/json';
            opt.body = JSON.stringify(body);
        }
        return fetch(path, opt).then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }

    function modal() {
        var el = document.getElementById('abandoned-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'abandoned-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(760px,96vw);max-height:86vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<h2 style="margin:0;font-size:20px;">🌍 Брошенные миры</h2>' +
            '<button onclick="window.AbandonedWorlds.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<div style="opacity:.65;font-size:12px;margin-bottom:12px;">Хозяин не заходил в игру месяц — колония одичала. ' +
            'Чем дольше она пустует, тем меньше от неё остаётся. Захват стоит ' + money(COST) + ' кр.</div>' +
            '<div id="abandoned-body">Загрузка…</div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.AbandonedWorlds.close(); });
        document.body.appendChild(el);
        return el;
    }

    function render(worlds) {
        var box = document.getElementById('abandoned-body');
        if (!box) return;
        if (!worlds || !worlds.length) {
            box.innerHTML = '<p style="opacity:.7;">Свободных миров нет. Колонии освобождаются через 30 дней после того, как хозяин перестал заходить.</p>';
            return;
        }
        var me = (window.getCurrentUser && window.getCurrentUser()) || {};
        var myEmail = String(me.email || '').toLowerCase();
        box.innerHTML = worlds.map(function (w) {
            var fac = w.factories && Object.keys(w.factories).length
                ? Object.keys(w.factories).map(function (k) { return (FAC[k] || k) + ' ' + w.factories[k]; }).join(', ')
                : 'построек не осталось';
            var pct = Math.round((w.richness || 0) * 100);
            var mine = String(w.owner || '').toLowerCase() === myEmail;
            var reserved = !!w.reserved;
            var until = w.reservedUntil ? new Date(w.reservedUntil * 1000).toLocaleDateString('ru-RU') : '';
            var button;
            if (reserved && !mine) {
                button = '<div style="opacity:.6;font-size:12px;">🔒 зарезервирован за прежним хозяином до ' + until + '</div>';
            } else if (reserved && mine) {
                button = '<button class="colonize free" data-id="' + esc(w.id) + '" style="padding:7px 14px;border-radius:8px;border:none;' +
                    'background:#f1c40f;color:#04121f;font-weight:bold;cursor:pointer;">Вернуть бесплатно</button>';
            } else {
                button = '<button class="colonize" data-id="' + esc(w.id) + '" style="padding:7px 14px;border-radius:8px;border:none;' +
                    'background:#2ecc71;color:#04121f;font-weight:bold;cursor:pointer;">Колонизировать · ' + money(COST) + ' кр</button>';
            }
            return '<div style="border:1px solid #16263d;border-radius:10px;padding:12px;margin-bottom:10px;">' +
                '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                '<b>' + esc(w.name) + '</b><span style="opacity:.7;">пустует ' + w.days + ' дн. · сохранилось ' + pct + '%</span></div>' +
                '<div style="opacity:.75;font-size:12px;margin:6px 0;">Выживших: ' + money(w.population) + ' · Руины: ' + esc(fac) + '</div>' +
                button + '</div>';
        }).join('');
        Array.prototype.forEach.call(box.querySelectorAll('button.colonize'), function (btn) {
            btn.onclick = function () {
                btn.disabled = true;
                btn.textContent = 'Захватываем…';
                api('/api/colony/colonize', { worldId: btn.getAttribute('data-id') }).then(function (res) {
                    if (!res) { toast('Сервер недоступен'); btn.disabled = false; return; }
                    if (res.error) { toast(res.error); btn.disabled = false; btn.textContent = 'Колонизировать'; return; }
                    if (window.pullServerProfile) window.pullServerProfile();
                    toast('Мир колонизирован: выживших ' + money((res.colony || {}).population || 0));
                    window.AbandonedWorlds.close();
                    if (typeof window.renderDock === 'function') { try { window.renderDock(); } catch (e) { } }
                });
            };
        });
    }

    function load() {
        if (!token()) { render([]); return; }
        api('/api/worlds/abandoned').then(function (r) { render(r && r.worlds); });
    }

    window.AbandonedWorlds = {
        open: function () {
            modal().style.display = 'flex';
            load();
        },
        close: function () {
            var m = document.getElementById('abandoned-modal');
            if (m) m.style.display = 'none';
        }
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('abandoned-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'abandoned-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🌍 Миры';
        b.onclick = function () { window.AbandonedWorlds.open(); };
        items.appendChild(b);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMenuButton);
    else addMenuButton();
})();
