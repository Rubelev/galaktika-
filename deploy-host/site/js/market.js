// Рынок: цены и склады считает сервер (/api/npcmarket/*), локальная математика — только
// для офлайн-режима и как резерв. Между игроками — /api/market/*.
(function () {
    'use strict';

    var HOUR = 3600000;
    var SPREAD = 0.05;

    var GOODS = {
        grain: { name: 'Зерно', unit: 'кг', base: 4, norm: 400000 },
        water: { name: 'Вода', unit: 'т', base: 7, norm: 200000 },
        ice: { name: 'Лёд', unit: 'т', base: 3, norm: 150000 },
        steel: { name: 'Сталь', unit: 'т', base: 12, norm: 120000 },
        quartz: { name: 'Кварц', unit: 'кг', base: 30, norm: 60000 },
        polymer: { name: 'Полимер', unit: 'т', base: 25, norm: 80000 },
        // Детали для постройки корабля: без них обучение упиралось в тупик —
        // «Искре» нужны платы и чипы, а в бирже их не было.
        copper: { name: 'Медь', unit: 'т', base: 18, norm: 90000 },
        nickel: { name: 'Никель', unit: 'т', base: 22, norm: 80000 },
        silver: { name: 'Серебро', unit: 'кг', base: 60, norm: 40000 },
        gold: { name: 'Золото', unit: 'кг', base: 180, norm: 20000 },
        chips: { name: 'Чипы', unit: 'шт', base: 45, norm: 30000 },
        boards: { name: 'Платы', unit: 'шт', base: 30, norm: 50000 },
        manip: { name: 'Манипуляторы', unit: 'шт', base: 120, norm: 15000 }
    };

    // Резервный расчёт (офлайн): те же формулы, что на сервере
    var MarketMath = {
        GOODS: GOODS,
        create: function () {
            var stock = {};
            Object.keys(GOODS).forEach(function (k) { stock[k] = GOODS[k].norm; });
            return { stock: stock, lastTick: Date.now() };
        },
        step: function (state, hours) {
            if (!(hours > 0)) return state;
            hours = Math.min(hours, 72);
            Object.keys(GOODS).forEach(function (k) {
                var norm = GOODS[k].norm;
                var s = (state.stock[k] == null ? norm : state.stock[k]) + norm * 0.004 * hours - norm * 0.0038 * hours;
                state.stock[k] = Math.max(0, Math.min(norm * 3, s));
            });
            state.lastTick = Date.now();
            return state;
        },
        price: function (state, key) {
            var g = GOODS[key];
            if (!g) return 0;
            var s = state.stock[key] == null ? g.norm : state.stock[key];
            var f = Math.max(0.5, Math.min(2.5, 1 + 1.5 * (1 - s / g.norm)));
            return g.base * f;
        },
        buyPrice: function (state, key) { return this.price(state, key) * (1 + SPREAD); },
        sellPrice: function (state, key) { return this.price(state, key) * (1 - SPREAD); },
        trade: function (state, key, qty, buying) {
            qty = Math.max(0, Math.floor(qty));
            if (!qty || !GOODS[key]) return { ok: false, reason: 'параметры' };
            var stock = state.stock[key] || 0;
            if (buying && stock < qty) return { ok: false, reason: 'на складе NPC только ' + Math.floor(stock) };
            var price = buying ? this.buyPrice(state, key) : this.sellPrice(state, key);
            state.stock[key] = buying ? stock - qty : Math.min(GOODS[key].norm * 3, stock + qty);
            return { ok: true, sum: price * qty, price: price };
        }
    };
    window.MarketMath = MarketMath;

    function localLoad() {
        var raw = null;
        try { raw = JSON.parse(localStorage.getItem('galaktika_market_v1') || 'null'); } catch (e) { raw = null; }
        var st = raw && raw.stock ? raw : MarketMath.create();
        MarketMath.step(st, (Date.now() - (st.lastTick || Date.now())) / HOUR);
        localStorage.setItem('galaktika_market_v1', JSON.stringify(st));
        return st;
    }

    function user() { return (window.getCurrentUser && window.getCurrentUser()) || null; }
    function money(v) { return Math.round(v || 0).toLocaleString('ru-RU'); }
    function save() {
        if (typeof window.saveUser === 'function') window.saveUser();
        if (typeof window.syncProfile === 'function') window.syncProfile();
    }
    function apiGet(path) {
        return fetch(path, { headers: { 'X-Auth-Token': localStorage.getItem('galaktika_token') || '' } })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }
    function apiPost(path, body) {
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem('galaktika_token') || '' },
            body: JSON.stringify(body || {})
        }).then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return null; });
    }

    function syncFromServer() {
        apiGet('/api/auth/me').then(function (r) {
            if (!r || !r.profile) return;
            var p = typeof r.profile === 'string' ? JSON.parse(r.profile) : r.profile;
            var u = user();
            if (!u) return;
            if (typeof p.credits === 'number') u.credits = p.credits;
            if (p.resources && typeof p.resources === 'object') {
                u.resources = u.resources || {};
                Object.keys(p.resources).forEach(function (k) { u.resources[k] = p.resources[k]; });
            }
            if (typeof window.saveUser === 'function') window.saveUser();
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
        });
    }

    function modal() {
        var el = document.getElementById('market-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'market-modal';
        el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
            'background:rgba(3,8,20,.72);z-index:12000;padding:16px;';
        el.innerHTML = '<div style="width:min(860px,96vw);max-height:88vh;overflow:auto;background:#0b1526;' +
            'border:1px solid #1e3350;border-radius:12px;padding:18px 20px;color:#dbe6f5;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<h2 style="margin:0;font-size:20px;">🏪 Рынок</h2>' +
            '<button onclick="window.Market.close()" style="background:none;border:none;color:#8ab4f8;font-size:22px;cursor:pointer;">&times;</button>' +
            '</div><div id="market-body"></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.Market.close(); });
        document.body.appendChild(el);
        return el;
    }

    function render(prices) {
        var box = document.getElementById('market-body');
        if (!box) return;
        var u = user();
        if (!u) { box.innerHTML = '<p>Войдите в игру.</p>'; return; }

        var st = localLoad();
        var rows = Object.keys(GOODS).map(function (k) {
            var g = GOODS[k];
            var have = (u.resources || {})[k] || 0;
            var p = (prices && prices[k]) ? prices[k]
                : { stock: Math.floor(st.stock[k] || 0), buy: MarketMath.buyPrice(st, k), sell: MarketMath.sellPrice(st, k) };
            var lot = (k === 'grain' || k === 'quartz') ? 1000 : 100;
            return '<tr>' +
                '<td><b>' + g.name + '</b><div style="opacity:.55;font-size:12px;">у вас ' + money(have) + ' ' + g.unit + '</div></td>' +
                '<td style="text-align:right;">' + money(p.stock) + '</td>' +
                '<td style="text-align:right;">' + Number(p.buy).toFixed(2) + '</td>' +
                '<td style="text-align:right;">' + Number(p.sell).toFixed(2) + '</td>' +
                '<td style="white-space:nowrap;">' +
                '<button class="mk" data-k="' + k + '" data-n="' + lot + '" data-buy="1">+ ' + lot + '</button> ' +
                '<button class="mk" data-k="' + k + '" data-n="10" data-buy="1">+10</button> ' +
                '<button class="mk" data-k="' + k + '" data-n="' + lot + '" data-buy="0">− ' + lot + '</button> ' +
                '<button class="mk" data-k="' + k + '" data-n="all" data-buy="0">всё</button>' +
                '</td></tr>';
        }).join('');

        box.innerHTML =
            '<div style="margin-bottom:8px;">Кредиты: <b>' + money(u.credits || 0) + '</b> · ' +
            (prices ? 'цены и склады общие (сервер)' : 'офлайн-расчёт, цены локальные') + '</div>' +
            '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
            '<tr style="text-align:left;opacity:.6;"><th>Товар</th><th style="text-align:right;">Склад NPC</th>' +
            '<th style="text-align:right;">Купить</th><th style="text-align:right;">Продать</th><th>Сделка</th></tr>' +
            rows + '</table>' +
            '<div id="market-msg" style="margin-top:10px;opacity:.85;"></div>';

        Array.prototype.forEach.call(box.querySelectorAll('button.mk'), function (btn) {
            btn.style.cssText = 'padding:4px 8px;border-radius:6px;border:1px solid #1e3350;background:#101f33;color:#dbe6f5;cursor:pointer;';
            btn.onclick = function () {
                var k = btn.getAttribute('data-k');
                var buying = btn.getAttribute('data-buy') === '1';
                var n = btn.getAttribute('data-n');
                var have = (u.resources || {})[k] || 0;
                trade(k, n === 'all' ? Math.floor(have) : Number(n), buying, prices);
            };
        });

        var server = document.createElement('div');
        server.id = 'market-server';
        server.style.cssText = 'margin-top:18px;border-top:1px solid #1e3350;padding-top:12px;';
        box.appendChild(server);
        renderServer(server);
    }

    function trade(key, qty, buying, prices) {
        var u = user();
        var msg = document.getElementById('market-msg');
        if (!u) return;
        if (!buying) qty = Math.min(qty, Math.floor((u.resources || {})[key] || 0));
        if (qty <= 0) { if (msg) msg.textContent = 'Нечего продавать'; return; }

        apiPost('/api/npcmarket/trade', { key: key, qty: qty, side: buying ? 'buy' : 'sell' }).then(function (r) {
            if (r && r.error) { if (msg) msg.textContent = r.error; return; }
            if (r && typeof r.sum === 'number') {
                if (msg) msg.textContent = (buying ? 'Куплено ' : 'Продано ') + money(qty) + ' ' + GOODS[key].unit +
                    ' по ' + Number(r.price).toFixed(2) + ' · ' + (buying ? '−' : '+') + money(r.sum) + ' кр';
                syncFromServer();
                render(prices);
                return;
            }
            // сервер недоступен — локальная сделка
            var st = localLoad();
            var res = MarketMath.trade(st, key, qty, buying);
            if (!res.ok) { if (msg) msg.textContent = 'Нельзя: ' + res.reason; return; }
            if (buying) {
                if ((u.credits || 0) < res.sum) { if (msg) msg.textContent = 'Не хватает кредитов'; return; }
                u.credits -= res.sum;
                u.resources = u.resources || {};
                u.resources[key] = (u.resources[key] || 0) + qty;
            } else {
                u.credits = (u.credits || 0) + res.sum;
                u.resources[key] = (u.resources[key] || 0) - qty;
            }
            localStorage.setItem('galaktika_market_v1', JSON.stringify(st));
            save();
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            render(prices);
        });
    }

    // ---- серверный рынок игроков ----
    function renderServer(container) {
        container.innerHTML = '<h3 style="font-size:15px;margin:0 0 8px;">👥 Общий рынок игроков</h3>' +
            '<div id="srv-offers" style="opacity:.7;">загрузка…</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center;">' +
            '<select id="srv-res" style="padding:6px;border-radius:6px;background:#101f33;color:#dbe6f5;border:1px solid #1e3350;">' +
            Object.keys(GOODS).map(function (k) { return '<option value="' + k + '">' + GOODS[k].name + '</option>'; }).join('') +
            '</select>' +
            '<input id="srv-qty" type="number" min="1" value="100" style="width:90px;padding:6px;border-radius:6px;background:#101f33;color:#dbe6f5;border:1px solid #1e3350;">' +
            '<input id="srv-price" type="number" min="0.01" step="0.01" value="5" style="width:90px;padding:6px;border-radius:6px;background:#101f33;color:#dbe6f5;border:1px solid #1e3350;">' +
            '<button id="srv-add" style="padding:6px 12px;border-radius:6px;border:none;background:#2ecc71;color:#04121f;font-weight:bold;cursor:pointer;">Выставить лот</button>' +
            '<span id="srv-msg" style="opacity:.8;"></span></div>';

        apiGet('/api/market/list').then(function (r) {
            var box = document.getElementById('srv-offers');
            if (!box) return;
            var offers = (r && r.offers) || [];
            if (!offers.length) { box.innerHTML = 'Пока никто ничего не продаёт.'; return; }
            var me = (user() && user().email || '').toLowerCase();
            box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
                '<tr style="text-align:left;opacity:.6;"><th>Продавец</th><th>Товар</th><th style="text-align:right;">Кол-во</th>' +
                '<th style="text-align:right;">Цена</th><th></th></tr>' +
                offers.map(function (o) {
                    var g = GOODS[o.resource] || { name: o.resource, unit: '' };
                    var mine = String(o.email).toLowerCase() === me;
                    var act = mine
                        ? '<button class="srv-cancel" data-id="' + o.id + '" style="padding:4px 8px;border-radius:6px;border:1px solid #1e3350;background:#101f33;color:#dbe6f5;cursor:pointer;">снять</button>'
                        : '<button class="srv-buy" data-id="' + o.id + '" style="padding:4px 8px;border-radius:6px;border:none;background:#4f8ef7;color:#04121f;cursor:pointer;">купить</button>';
                    return '<tr><td>' + (o.seller || o.email) + '</td><td>' + g.name + '</td>' +
                        '<td style="text-align:right;">' + Math.floor(o.qty) + ' ' + g.unit + '</td>' +
                        '<td style="text-align:right;">' + Number(o.price).toFixed(2) + '</td><td>' + act + '</td></tr>';
                }).join('') + '</table>';

            Array.prototype.forEach.call(box.querySelectorAll('button.srv-buy'), function (btn) {
                btn.onclick = function () {
                    apiPost('/api/market/buy', { id: btn.getAttribute('data-id'), qty: 1000000 }).then(function (res) {
                        var msg = document.getElementById('srv-msg');
                        if (msg) msg.textContent = (res && res.error) ? res.error : ('Куплено на ' + Math.round((res && res.sum) || 0) + ' кр');
                        if (res && !res.error) { syncFromServer(); renderServer(container); }
                    });
                };
            });
            Array.prototype.forEach.call(box.querySelectorAll('button.srv-cancel'), function (btn) {
                btn.onclick = function () {
                    apiPost('/api/market/cancel', { id: btn.getAttribute('data-id') }).then(function () {
                        syncFromServer(); renderServer(container);
                    });
                };
            });
        });

        var addBtn = document.getElementById('srv-add');
        if (addBtn) {
            addBtn.onclick = function () {
                var msg = document.getElementById('srv-msg');
                apiPost('/api/market/offer', {
                    resource: document.getElementById('srv-res').value,
                    qty: Number(document.getElementById('srv-qty').value),
                    price: Number(document.getElementById('srv-price').value)
                }).then(function (res) {
                    if (msg) msg.textContent = (res && res.error) ? res.error : 'Лот выставлен';
                    if (res && !res.error) { syncFromServer(); renderServer(container); }
                });
            };
        }
    }

    window.Market = {
        open: function () {
            modal().style.display = 'flex';
            render(null);
            apiGet('/api/npcmarket/quote').then(function (r) {
                if (r && r.prices) render(r.prices);
            });
        },
        close: function () { var m = document.getElementById('market-modal'); if (m) m.style.display = 'none'; },
        trade: function (key, qty, buying) { trade(key, qty, buying, null); },
        prices: function () { var st = localLoad(); var out = {}; Object.keys(GOODS).forEach(function (k) { out[k] = MarketMath.price(st, k); }); return out; }
    };

    function addMenuButton() {
        var items = document.getElementById('left-menu-items');
        if (!items || document.getElementById('market-menu-btn')) return;
        var b = document.createElement('button');
        b.id = 'market-menu-btn';
        b.className = 'menu-btn';
        b.textContent = '🏪 Рынок';
        b.onclick = function () { window.Market.open(); };
        items.appendChild(b);
    }

    function boot() { addMenuButton(); localLoad(); }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
