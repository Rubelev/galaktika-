// Оплата: реквизиты и пакеты задаёт администратор в игре,
// игрок выбирает пакет, получает код платежа, админ подтверждает — кристаллы начисляются.
// Работает поверх API: /api/pay/* (см. api.php).
(function () {
    'use strict';

    var API = {
        get: function (path) {
            return fetch(path, { headers: { 'X-Auth-Token': token() }, credentials: 'same-origin' })
                .then(function (r) { return r.json().catch(function () { return {}; }); });
        },
        post: function (path, body) {
            return fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
                credentials: 'same-origin',
                body: JSON.stringify(body || {})
            }).then(function (r) { return r.json().catch(function () { return {}; }); });
        }
    };

    function token() { return localStorage.getItem('galaktika_token') || ''; }
    function user() { return (window.getCurrentUser && window.getCurrentUser()) || null; }
    function isAdmin() { var u = user(); return !!(u && u.role === 'admin'); }
    function money(v) { return Number(v || 0).toLocaleString('ru-RU'); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function toast(text) { if (typeof window.notify === 'function') window.notify(text); }

    // ---------- модальное окно ----------
    function modal() {
        var el = document.getElementById('pay-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'pay-modal';
        el.className = 'pay-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div class="pay-box" style="width:min(720px,96vw);max-height:88vh;overflow:auto;' +
            'background:#0b1526;border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;' +
            'font-family:inherit;box-shadow:0 20px 60px rgba(0,0,0,.55);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<h2 style="margin:0;font-size:20px;">💎 Купить кристаллы</h2>' +
            '<button onclick="window.Payments.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button>' +
            '</div><div id="pay-body"></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Payments.close(); });
        document.body.appendChild(el);
        return el;
    }

    function body() { return document.getElementById('pay-body'); }

    // ---------- экран игрока ----------
    function renderPlayer() {
        var box = body();
        box.innerHTML = '<div style="opacity:.7;">Загружаю реквизиты…</div>';
        API.get('/api/pay/settings').then(function (res) {
            var s = res.settings || {};
            if (!s.enabled) {
                box.innerHTML = '<p>Покупка кристаллов сейчас отключена администратором.</p>';
                return;
            }
            var pkgs = (s.packages || []).map(function (p) {
                return '<label style="display:flex;gap:10px;align-items:center;padding:10px;border:1px solid #1e3350;' +
                    'border-radius:8px;margin-bottom:8px;cursor:pointer;">' +
                    '<input type="radio" name="pay-package" value="' + esc(p.id) + '">' +
                    '<span style="flex:1;"><b>' + esc(p.title) + '</b><br>' +
                    '<span style="opacity:.7;">' + money(p.credits) + ' кристаллов</span></span>' +
                    '<b>' + money(p.price) + ' ₽</b></label>';
            }).join('');
            box.innerHTML =
                '<p style="margin-top:0;">Выберите пакет и способ оплаты. После перевода укажите код платежа в комментарии.</p>' +
                '<div id="pay-packages">' + pkgs + '</div>' +
                '<div style="display:flex;gap:10px;margin:12px 0;">' +
                '<label><input type="radio" name="pay-method" value="sbp" checked> СБП</label>' +
                '<label><input type="radio" name="pay-method" value="card"> Карта</label></div>' +
                '<button id="pay-get" style="padding:10px 16px;border-radius:8px;border:none;cursor:pointer;' +
                'background:#2ecc71;color:#04121f;font-weight:bold;">Получить реквизиты</button>' +
                '<div id="pay-details" style="margin-top:14px;"></div>' +
                '<div id="pay-history" style="margin-top:18px;"></div>';

            document.getElementById('pay-get').onclick = function () {
                var pkg = document.querySelector('input[name="pay-package"]:checked');
                if (!pkg) { toast('Выберите пакет'); return; }
                var m = document.querySelector('input[name="pay-method"]:checked');
                API.post('/api/pay/order', { packageId: pkg.value, method: m ? m.value : 'sbp' }).then(function (r) {
                    if (r.error) { toast(r.error); return; }
                    showDetails(r.order, r.settings);
                });
            };
            loadHistory();
        });
    }

    function showDetails(order, s) {
        var box = document.getElementById('pay-details');
        if (!box) return;
        var rows = '';
        if (order.method === 'card') {
            rows = '<div>Номер карты: <b>' + esc(s.card && s.card.number || '— не задан —') + '</b></div>' +
                '<div>Получатель: <b>' + esc(s.card && s.card.recipient || '—') + '</b></div>';
        } else {
            rows = (s.sbp && s.sbp.link
                ? '<div>Ссылка СБП: <a href="' + esc(s.sbp.link) + '" target="_blank" rel="noopener" style="color:#8ab4f8;">' + esc(s.sbp.link) + '</a></div>' : '') +
                (s.sbp && s.sbp.phone ? '<div>Телефон СБП: <b>' + esc(s.sbp.phone) + '</b></div>' : '') +
                '<div>Получатель: <b>' + esc(s.sbp && s.sbp.recipient || '—') + '</b></div>';
        }
        box.innerHTML =
            '<div style="border:1px solid #1e3350;border-radius:10px;padding:12px;background:#0e1a2d;">' +
            '<div style="margin-bottom:6px;">К оплате: <b>' + money(order.price) + ' ₽</b> за ' +
            money(order.credits) + ' кристаллов</div>' +
            rows +
            '<div style="margin-top:10px;">Код платежа: <b style="color:#f1c40f;font-size:18px;">' + esc(order.code) + '</b>' +
            '<div style="opacity:.7;font-size:13px;">' + esc(s.note || 'Укажите этот код в комментарии к переводу.') + '</div></div>' +
            '<div style="margin-top:8px;opacity:.6;font-size:13px;">После перевода админ подтвердит платёж, кристаллы начислятся автоматически.</div></div>';
        loadHistory();
    }

    function loadHistory() {
        var box = document.getElementById('pay-history');
        if (!box || !token()) return;
        API.get('/api/pay/my').then(function (r) {
            var orders = r.orders || [];
            if (!orders.length) { box.innerHTML = ''; return; }
            var rows = orders.slice(-8).reverse().map(function (o) {
                var st = o.status === 'paid' ? '✅ оплачен' : (o.status === 'rejected' ? '✖ отклонён' : '⏳ ждёт подтверждения');
                return '<tr><td>' + esc(o.code) + '</td><td>' + money(o.credits) + '</td><td>' + money(o.price) + ' ₽</td>' +
                    '<td>' + esc(o.method === 'card' ? 'карта' : 'СБП') + '</td><td>' + st + '</td></tr>';
            }).join('');
            box.innerHTML = '<h3 style="font-size:15px;margin:0 0 6px;">Мои платежи</h3>' +
                '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
                '<tr style="text-align:left;opacity:.6;"><th>Код</th><th>Кристаллы</th><th>Сумма</th><th>Способ</th><th>Статус</th></tr>' +
                rows + '</table>';
        });
    }

    // ---------- админский блок ----------
    function renderAdmin() {
        var list = document.getElementById('user-list-modal');
        if (!list || !isAdmin()) return;
        var old = document.getElementById('admin-pay-section');
        if (old) old.parentNode.removeChild(old);

        var sect = document.createElement('div');
        sect.id = 'admin-pay-section';
        sect.style.cssText = 'margin-top:18px;border-top:1px solid #1e3350;padding-top:14px;';
        sect.innerHTML = '<h3 style="margin:0 0 8px;">💰 Оплата: реквизиты и пакеты</h3><div id="admin-pay-form">загрузка…</div>';
        list.parentNode.insertBefore(sect, list.nextSibling);

        API.get('/api/pay/settings').then(function (r) {
            var s = r.settings || {};
            var sbp = s.sbp || {}, card = s.card || {};
            var pk = s.packages || [];
            var pkgRows = [0, 1, 2].map(function (i) {
                var p = pk[i] || { title: '', credits: '', price: '', id: 'p' + (i + 1) };
                return '<tr>' +
                    '<td><input data-pk="' + i + '" data-f="title" value="' + esc(p.title) + '" placeholder="Название" style="width:100%;"></td>' +
                    '<td><input data-pk="' + i + '" data-f="credits" value="' + esc(p.credits) + '" placeholder="кристаллы" style="width:90px;"></td>' +
                    '<td><input data-pk="' + i + '" data-f="price" value="' + esc(p.price) + '" placeholder="₽" style="width:80px;"></td>' +
                    '</tr>';
            }).join('');

            document.getElementById('admin-pay-form').innerHTML =
                '<div style="margin-bottom:8px;"><label><input type="checkbox" id="pay-enabled"' + (s.enabled ? ' checked' : '') + '> оплата включена</label></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
                '<label>СБП — ссылка<br><input id="pay-sbp-link" value="' + esc(sbp.link) + '" placeholder="https://qr.nspk.ru/..." style="width:100%;"></label>' +
                '<label>СБП — телефон<br><input id="pay-sbp-phone" value="' + esc(sbp.phone) + '" placeholder="+7 900 000-00-00" style="width:100%;"></label>' +
                '<label>СБП — получатель<br><input id="pay-sbp-recipient" value="' + esc(sbp.recipient) + '" style="width:100%;"></label>' +
                '<label>Карта — номер<br><input id="pay-card-number" value="' + esc(card.number) + '" placeholder="0000 0000 0000 0000" style="width:100%;"></label>' +
                '<label>Карта — получатель<br><input id="pay-card-recipient" value="' + esc(card.recipient) + '" style="width:100%;"></label>' +
                '<label>Примечание для игрока<br><input id="pay-note" value="' + esc(s.note) + '" style="width:100%;"></label>' +
                '</div>' +
                '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><tr style="text-align:left;opacity:.6;">' +
                '<th>Пакет</th><th>Кристаллы</th><th>Цена, ₽</th></tr>' + pkgRows + '</table>' +
                '<button id="pay-save" style="padding:8px 14px;border-radius:8px;border:none;background:#2ecc71;color:#04121f;font-weight:bold;cursor:pointer;">Сохранить настройки</button>' +
                '<div id="pay-orders" style="margin-top:14px;"></div>';

            document.getElementById('pay-save').onclick = saveSettings;
            loadOrders();
        });
    }

    function saveSettings() {
        function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; }
        var packages = [];
        [0, 1, 2].forEach(function (i) {
            var t = document.querySelector('[data-pk="' + i + '"][data-f="title"]');
            var c = document.querySelector('[data-pk="' + i + '"][data-f="credits"]');
            var p = document.querySelector('[data-pk="' + i + '"][data-f="price"]');
            if (!t || !t.value.trim() || !Number(c.value) || !Number(p.value)) return;
            packages.push({ id: 'p' + (i + 1), title: t.value.trim(), credits: Number(c.value), price: Number(p.value) });
        });
        API.post('/api/pay/settings', {
            enabled: document.getElementById('pay-enabled').checked,
            currency: 'RUB',
            sbp: { link: val('pay-sbp-link'), phone: val('pay-sbp-phone'), recipient: val('pay-sbp-recipient') },
            card: { number: val('pay-card-number'), recipient: val('pay-card-recipient') },
            note: val('pay-note'),
            packages: packages
        }).then(function (r) {
            toast(r.error ? r.error : 'Настройки оплаты сохранены');
        });
    }

    function loadOrders() {
        var box = document.getElementById('pay-orders');
        if (!box) return;
        API.get('/api/pay/orders').then(function (r) {
            var orders = (r.orders || []).slice(0, 12);
            if (!orders.length) { box.innerHTML = '<div style="opacity:.6;">Заказов пока нет.</div>'; return; }
            var rows = orders.map(function (o) {
                var st = o.status === 'paid' ? '✅' : (o.status === 'rejected' ? '✖' : '⏳');
                var act = o.status === 'pending'
                    ? '<button onclick="window.Payments.setStatus(\'' + o.id + '\',\'paid\')" style="margin-right:4px;">подтвердить</button>' +
                      '<button onclick="window.Payments.setStatus(\'' + o.id + '\',\'rejected\')">отклонить</button>'
                    : '';
                return '<tr><td>' + esc(o.code) + '</td><td>' + esc(o.email) + '</td>' +
                    '<td>' + money(o.credits) + '</td><td>' + money(o.price) + ' ₽</td>' +
                    '<td>' + esc(o.method === 'card' ? 'карта' : 'СБП') + '</td><td>' + st + '</td><td>' + act + '</td></tr>';
            }).join('');
            box.innerHTML = '<h3 style="font-size:15px;margin:0 0 6px;">Заказы</h3>' +
                '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
                '<tr style="text-align:left;opacity:.6;"><th>Код</th><th>Игрок</th><th>Кристаллы</th><th>Сумма</th><th>Способ</th><th></th><th></th></tr>' +
                rows + '</table>';
        });
    }

    // ---------- начисление кристаллов ----------
    function syncCredits() {
        if (!token() || !user()) return;
        API.get('/api/pay/my').then(function (r) {
            var orders = r.orders || [];
            var toApply = orders.filter(function (o) { return o.status === 'paid' && !o.applied; });
            if (!toApply.length) return;
            var sum = toApply.reduce(function (a, o) { return a + Number(o.credits || 0); }, 0);
            var u = user();
            u.resources = u.resources || {};
            u.resources.eternity = (u.resources.eternity || 0) + sum;
            if (typeof window.saveUser === 'function') window.saveUser();
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            toast('Начислено ' + money(sum) + ' кристаллов');
            API.post('/api/pay/ack', { ids: toApply.map(function (o) { return o.id; }) });
        }).catch(function () {
            // сеть могла моргнуть — это не ошибка клиента, повторять не нужно
        });
    }

    // ---------- публичный интерфейс ----------
    window.Payments = {
        open: function () { modal().style.display = 'flex'; renderPlayer(); },
        close: function () { var m = document.getElementById('pay-modal'); if (m) m.style.display = 'none'; },
        setStatus: function (id, status) {
            API.post('/api/pay/status', { id: id, status: status }).then(function (r) {
                toast(r.error ? r.error : 'Статус обновлён');
                loadOrders();
            });
        }
    };

    // кнопка в левом меню
    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('pay-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'pay-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '💎 Купить кристаллы';
        b.onclick = function () { window.Payments.open(); };
        items.appendChild(b);
    }

    // вставка блока в админку
    function hookAdmin() {
        var original = window.openAdminModal;
        if (typeof original !== 'function' || original.__payHooked) return;
        var wrapped = function () {
            original.apply(this, arguments);
            setTimeout(renderAdmin, 60);
        };
        wrapped.__payHooked = true;
        window.openAdminModal = wrapped;
    }

    function boot() {
        addMenuButton();
        hookAdmin();
        syncCredits();
        setInterval(syncCredits, 60000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
