// Панель администратора: рост и интерес к игре. Видна только админу.
(function () {
    'use strict';

    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function user() { return (window.getCurrentUser && window.getCurrentUser()) || null; }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }

    function row(name, value, hint) {
        return '<tr><td style="padding:6px 8px;border-bottom:1px solid #16263d;">' + name + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #16263d;font-weight:bold;">' + value + '</td>' +
            '<td style="padding:6px 8px;border-bottom:1px solid #16263d;opacity:.6;font-size:12px;">' + (hint || '') + '</td></tr>';
    }

    function modal() {
        var el = document.getElementById('stats-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'stats-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(720px,96vw);max-height:86vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<h2 style="margin:0;font-size:20px;">📊 Рост и интерес</h2>' +
            '<button onclick="window.Stats.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button></div>' +
            '<table id="stats-table" style="width:100%;border-collapse:collapse;font-size:13px;"></table>' +
            '<div style="margin-top:10px;opacity:.6;font-size:12px;">Обновляется по кнопке «Обновить».</div>' +
            '<button onclick="window.Stats.load()" style="margin-top:8px;padding:8px 14px;border-radius:8px;border:none;' +
            'background:#4f8ef7;color:#04121f;font-weight:bold;cursor:pointer;">Обновить</button></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Stats.close(); });
        document.body.appendChild(el);
        return el;
    }

    function render(d) {
        var box = document.getElementById('stats-table');
        if (!box) return;
        if (!d || d.error) {
            box.innerHTML = '<tr><td>' + ((d && d.error) || 'нет данных') + '</td></tr>';
            return;
        }
        var u = d.users || {}, r = d.ranks || {}, p = d.pay || {};
        var ranks = Object.keys(r).map(function (k) { return k + ': ' + r[k]; }).join(', ') || '—';
        box.innerHTML =
            row('Всего игроков', u.total) +
            row('Новых сегодня', u.newToday) +
            row('Новых за неделю', u.newWeek) +
            row('Заходили сегодня', u.activeToday, 'признак интереса') +
            row('Заходили за неделю', u.activeWeek) +
            row('Не заходили месяц', u.idleMonth, 'кандидаты в брошенные') +
            row('С колонией', u.withColony) +
            row('Кораблей всего', u.ships) +
            row('Средний капитал', money(u.avgCredits) + ' кр') +
            row('Брошенных миров', (d.worlds || {}).abandoned) +
            row('Звания', ranks) +
            row('Сообщений в чате сегодня', (d.chat || {}).today) +
            row('Заказов на оплату', (p.orders || 0) + ' (оплачено ' + (p.paid || 0) + ' на ' + money(p.sum) + ' ₽)');
    }

    window.Stats = {
        open: function () {
            modal().style.display = 'flex';
            window.Stats.load();
        },
        close: function () {
            var m = document.getElementById('stats-modal');
            if (m) m.style.display = 'none';
        },
        load: function () {
            fetch('/api/stats', { headers: { 'X-Auth-Token': token() } })
                .then(function (r) { return r.json().catch(function () { return {}; }); })
                .then(render)
                .catch(function () { render(null); });
        }
    };

    function addMenuButton() {
        var u = user();
        if (!u || u.role !== 'admin') return;
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('stats-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'stats-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '📊 Статистика';
        b.onclick = function () { window.Stats.open(); };
        items.appendChild(b);
    }

    // профиль подгружается после входа — пробуем несколько раз
    function boot() {
        addMenuButton();
        var tries = 0;
        var t = setInterval(function () {
            tries++;
            addMenuButton();
            if (document.getElementById('stats-menu-btn') || tries > 20) clearInterval(t);
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
