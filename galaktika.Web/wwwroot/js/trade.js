// Межпланетная торговля: вода Европы, водород Юпитера, кислород Земли.
// Топливный элемент: водород + кислород → вода и энергия.
// ?trade=1 — превью панели.
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }
    function token() { try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; } }
    function api(path, body, method) {
        return fetch(path, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }
    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }
    function profile() {
        return api('/api/auth/me', null, 'GET').then(function (res) {
            try { return JSON.parse(res.profile || '{}'); } catch (e) { return {}; }
        });
    }

    function open() {
        var old = document.getElementById('tr-wrap');
        if (old) old.remove();
        var wrap = el('div');
        wrap.id = 'tr-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:13100;background:rgba(4,8,12,.82);' +
            'display:flex;align-items:center;justify-content:center;padding:14px';

        var card = el('div');
        card.style.cssText = 'width:min(700px,96vw);max-height:92vh;overflow:auto;background:#0b1526;' +
            'border:2px solid #1e3a5f;border-radius:16px;padding:18px;color:#dce8f7;' +
            'font:14px/1.5 Inter,system-ui,sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.6)';
        card.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<b style="color:#8fd6ff;font-size:17px">🚀 Межпланетная торговля</b>' +
            '<button id="tr-close" style="padding:4px 10px;border:none;border-radius:8px;background:#2b3238;' +
            'color:#e6eaed;cursor:pointer">✕</button></div>' +
            '<div id="tr-info" style="color:#9fb2c6;margin-bottom:10px">Загрузка…</div>' +
            '<div id="tr-routes" style="display:grid;gap:10px"></div>' +
            '<div style="margin-top:14px;background:#101c2c;border:1px solid #1e3a5f;border-radius:12px;padding:12px">' +
            '<b style="color:#ffd05a">⚗️ Топливный элемент</b>' +
            '<div style="color:#9fb2c6;font-size:12.5px;margin:4px 0 8px">' +
            'H₂ + O₂ → вода и энергия. 1 кг водорода + 9 кг кислорода → ' +
            '<b style="color:#3ec97a">9 кг воды</b> и <b style="color:#8fd6ff">33 кВт·ч</b>.</div>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<input id="tr-h2" type="number" value="200" min="100" step="100" ' +
            'style="width:110px;padding:8px;border-radius:8px;border:1px solid #24405f;background:#0a1520;color:#dce8f7">' +
            '<span style="color:#9fb2c6">кг водорода</span>' +
            '<button id="tr-cell" style="padding:9px 14px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#8fd6ff,#2f9fe0);color:#04223a;font-weight:800">Запустить</button>' +
            '</div></div>' +
            '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
            '<span id="tr-energy" style="color:#9fb2c6">энергия: 0 кВт·ч</span>' +
            '<button id="tr-sell-energy" style="padding:8px 13px;border:none;border-radius:9px;cursor:pointer;' +
            'background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;font-weight:800">Продать энергию · 0,9 кр/кВт·ч</button>' +
            '</div>' +
            '<div id="tr-msg" style="margin-top:10px;min-height:18px;color:#8fd6ff"></div>';
        wrap.appendChild(card);
        document.body.appendChild(wrap);
        card.addEventListener('click', function (e) { e.stopPropagation(); });
        document.getElementById('tr-close').onclick = function () { wrap.remove(); };

        function msg(t, c) {
            var m = document.getElementById('tr-msg');
            if (m) { m.textContent = t; m.style.color = c || '#8fd6ff'; }
        }

        var routes = [];
        function refresh() {
            Promise.all([api('/api/trade/routes', null, 'GET'), profile()]).then(function (res) {
                routes = res[0].routes || [];
                var p = res[1], r = p.resources || {}, tr = p.trade || {};
                document.getElementById('tr-info').innerHTML =
                    'Кредиты <b style="color:#ffd05a">' + Math.round(p.credits || 0).toLocaleString('ru-RU') + '</b> · ' +
                    'корабли <b>' + (p.ships || []).length + '</b> · ' +
                    'вода ' + Math.round(r.water || 0) + ' т · водород ' + Math.round(r.hydrogen || 0) + ' кг · ' +
                    'кислород ' + Math.round(r.oxygen || 0) + ' кг' +
                    (tr.totalProfit ? ' · прибыль рейсов <b style="color:#3ec97a">' + Math.round(tr.totalProfit).toLocaleString('ru-RU') + '</b>' : '');

                var en = document.getElementById('tr-energy');
                if (en) en.textContent = 'энергия: ' + Math.round(tr.energy || 0).toLocaleString('ru-RU') + ' кВт·ч';
                var box = document.getElementById('tr-routes');
                box.innerHTML = routes.map(function (rt) {
                    var profit = Math.round(rt.batch * (rt.sell - rt.buy));
                    return '<div style="background:#0f1c2e;border:1px solid #1e3a5f;border-radius:12px;padding:11px">' +
                        '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
                        '<b style="color:#ffd05a">' + rt.from + ' → ' + rt.to + '</b>' +
                        '<span style="color:#3ec97a;font-weight:800">+' + profit.toLocaleString('ru-RU') + ' кр</span></div>' +
                        '<div style="color:#9fb2c6;font-size:12.5px;margin:3px 0 7px">' + rt.resource +
                        ' · партия ' + rt.batch + ' ' + rt.unit + ' · закупка ' + rt.buy + ' → продажа ' + rt.sell +
                        ' · ' + rt.hours + ' ч · риск ' + Math.round(rt.risk * 100) + '%<br>' +
                        (rt.note || '') + '</div>' +
                        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
                        '<button data-run="' + rt.id + '" data-qty="1" style="padding:7px 12px;border:none;border-radius:8px;' +
                        'cursor:pointer;background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;font-weight:800">1 партия</button>' +
                        '<button data-run="' + rt.id + '" data-qty="2" style="padding:7px 12px;border:none;border-radius:8px;' +
                        'cursor:pointer;background:#2b4a6e;color:#dce8f7;font-weight:800">2 партии</button>' +
                        '<button data-run="' + rt.id + '" data-qty="4" style="padding:7px 12px;border:none;border-radius:8px;' +
                        'cursor:pointer;background:#2b4a6e;color:#dce8f7;font-weight:800">4 партии</button>' +
                        '<button data-keep="' + rt.id + '" data-qty="1" style="padding:7px 12px;border:none;border-radius:8px;' +
                        'cursor:pointer;background:#2f7f5f;color:#eafff5;font-weight:800">Себе 1 партию</button>' +
                        '</div></div>';
                }).join('');

                Array.prototype.forEach.call(box.querySelectorAll('button[data-keep]'), function (b) {
                    b.onclick = function () {
                        b.disabled = true;
                        api('/api/trade/run', { route: b.getAttribute('data-keep'), qty: 1, keep: true })
                            .then(function (resp) {
                                b.disabled = false;
                                if (resp.error) { msg(resp.error, '#ff6b5a'); return; }
                                msg('📦 На склад: +' + resp.qty + ' ' + (resp.resource === 'water' ? 'т' : 'кг') +
                                    ' за ' + resp.cost + ' кр', '#3ec97a');
                                refresh();
                            });
                    };
                });
                Array.prototype.forEach.call(box.querySelectorAll('button[data-run]'), function (b) {
                    b.onclick = function () {
                        b.disabled = true;
                        api('/api/trade/run', { route: b.getAttribute('data-run'), qty: parseInt(b.getAttribute('data-qty'), 10) })
                            .then(function (resp) {
                                b.disabled = false;
                                if (resp.error) { msg(resp.error, '#ff6b5a'); return; }
                                if (resp.result === 'lost') {
                                    msg('🏴 ' + resp.message + ' — потеряно ' + resp.qty, '#ff6b5a');
                                    toast('Пираты перехватили груз');
                                } else {
                                    msg('✅ Рейс доставлен: +' + Math.round(resp.profit).toLocaleString('ru-RU') + ' кр прибыли', '#3ec97a');
                                    toast('+' + Math.round(resp.profit) + ' кр за рейс');
                                }
                                refresh();
                            });
                    };
                });
            });
        }

        document.getElementById('tr-sell-energy').onclick = function () {
            api('/api/trade/energy', {}).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Продано ' + Math.round(res.sold) + ' кВт·ч за ' + res.sum + ' кр', '#3ec97a');
                refresh();
            });
        };
        document.getElementById('tr-cell').onclick = function () {
            var h2 = parseInt(document.getElementById('tr-h2').value || '0', 10);
            api('/api/trade/fuelcell', { hydrogen: h2 }).then(function (res) {
                if (res.error) { msg(res.error, '#ff6b5a'); return; }
                msg('Вода +' + res.water + ' т · энергия +' + res.energy + ' кВт·ч', '#3ec97a');
                toast('Топливный элемент сработал');
                refresh();
            });
        };

        refresh();
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('trade-btn')) return;
        var b = el('button', 'menu-btn', '🚀 Торговля');
        b.id = 'trade-btn';
        b.setAttribute('data-tip', 'Торговля|Вода Европы, водород Юпитера, кислород Земли');
        b.onclick = open;
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Trade = { open: open };

    if (/[?&]trade=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(open, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
