// ============================================================================
//  FOOD-PANEL.JS — раздел «Завод еды» в панели колонии.
//  Показывает этапы из window.FOOD_FACTORY, текущие заводы игрока и покрытие
//  населения; кнопка строит завод через API (food_build).
//  Панель колонии рисуется colony.js, поэтому мы не лезем в его код:
//  наблюдаем за #colony-body и добавляем свой блок сверху.
// ============================================================================
(function (global) {
    'use strict';

    function token() {
        try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; }
    }
    function api(action, body) {
        const t = token();
        const opts = {
            method: body ? 'POST' : 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { 'X-Auth-Token': t } : {})
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch('api.php?action=' + action, opts).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

    function money(n) { return Math.round(n).toLocaleString('ru-RU'); }

    function render(host) {
        const tiers = global.FOOD_FACTORY || [];
        if (!host || !tiers.length) return;

        api('food_status').then(function (r) {
            const plan = (r.j && r.j.plan) || {};
            const cap = (r.j && r.j.capacity) || {};
            const mine = {};
            const col = (typeof user === 'function' ? (user() || {}).colony : null) || {};
            (col.food_factories || []).forEach(function (f) { mine[f.tier] = f.count; });

            const rows = tiers.map(function (f) {
                const cnt = mine[f.tier] || 0;
                return '<tr style="border-top:1px solid rgba(143,214,255,.12)">' +
                    '<td style="padding:6px 8px">T' + f.tier + ' · ' + esc(f.name) + '<div style="opacity:.6;font-size:11px">' + esc(f.era) + ' · ' + esc(f.tech) + '</div></td>' +
                    '<td style="padding:6px 8px;text-align:right">' + money(f.kg_day) + '</td>' +
                    '<td style="padding:6px 8px;text-align:right">' + f.kwh_kg + '</td>' +
                    '<td style="padding:6px 8px;text-align:right">' + money(f.kg_day / 0.3) + '</td>' +
                    '<td style="padding:6px 8px;text-align:right">' + money(f.cost) + '</td>' +
                    '<td style="padding:6px 8px;text-align:right">' + (cnt ? ('×' + cnt) : '—') + '</td>' +
                    '<td style="padding:6px 8px"><button data-food-tier="' + f.tier + '" style="padding:4px 10px;border-radius:7px;' +
                    'border:1px solid rgba(143,214,255,.4);background:rgba(143,214,255,.12);color:#e8eef8;cursor:pointer">Построить</button></td>' +
                    '</tr>';
            }).join('');

            const cov = Math.round((plan.coverage || 0) * 100);
            const box = document.createElement('div');
            box.id = 'food-factory-panel';
            box.style.cssText = 'margin:0 0 14px;padding:12px 14px;border-radius:12px;' +
                'background:rgba(10,18,30,.85);border:1px solid rgba(255,209,102,.35)';
            box.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
                '<div style="color:#ffd166;font-weight:700">ЗАВОД ЕДЫ</div>' +
                '<div style="font-size:12px;opacity:.85">покрытие: <b style="color:' + (cov >= 100 ? '#8fe3a8' : '#ff9b9b') + '">' + cov + '%</b>' +
                ' · людей: ' + money(plan.need_people || 0) + '</div></div>' +
                '<div style="font-size:12px;opacity:.8;margin:4px 0 8px">Заводы кормят раньше полей: сначала выпуск, потом закупка зерна. ' +
                'Энергия списывается кредитами, вода — из склада.</div>' +
                '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
                '<tr style="opacity:.65"><th style="text-align:left;padding:4px 8px">Этап</th>' +
                '<th style="text-align:right;padding:4px 8px">кг/сутки</th>' +
                '<th style="text-align:right;padding:4px 8px">кВт·ч/кг</th>' +
                '<th style="text-align:right;padding:4px 8px">людей</th>' +
                '<th style="text-align:right;padding:4px 8px">цена</th>' +
                '<th style="text-align:right;padding:4px 8px">у вас</th><th></th></tr>' + rows + '</table>' +
                '<div id="food-factory-msg" style="font-size:12px;margin-top:8px;min-height:16px"></div>';

            const old = document.getElementById('food-factory-panel');
            if (old) old.parentNode.replaceChild(box, old);
            else host.insertBefore(box, host.firstChild);

            box.querySelectorAll('[data-food-tier]').forEach(function (b) {
                b.onclick = function () {
                    const tier = Number(b.getAttribute('data-food-tier'));
                    b.disabled = true;
                    b.textContent = '…';
                    api('food_build', { tier: tier, count: 1 }).then(function (res) {
                        const msg = document.getElementById('food-factory-msg');
                        if (res.ok) {
                            if (msg) msg.innerHTML = '<span style="color:#8fe3a8">Завод T' + tier + ' построен. Кредитов: ' +
                                money(res.j.credits) + '</span>';
                            if (typeof global.notify === 'function') global.notify('Завод еды T' + tier + ' построен');
                            if (typeof global.ColonyTick === 'function') global.ColonyTick();
                            setTimeout(function () { render(host); }, 600);
                        } else {
                            const e = (res.j && (res.j.error || '')) + (res.j && res.j.need ? (' — нужно ' + money(res.j.need) + ', есть ' + money(res.j.have)) : '');
                            if (msg) msg.innerHTML = '<span style="color:#ff9b9b">' + esc(e) + '</span>';
                            b.disabled = false; b.textContent = 'Построить';
                        }
                    }).catch(function () {
                        b.disabled = false; b.textContent = 'Построить';
                    });
                };
            });
        }).catch(function () { });
    }

    function tryRender() {
        const host = document.getElementById('colony-body');
        if (host && host.children.length) render(host);
    }

    const obs = new MutationObserver(function () { tryRender(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
        document.body && obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(tryRender, 1500);
    });
    else {
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(tryRender, 1500);
    }
    setInterval(tryRender, 4000);


    // Отдельный режим ?foodpanel=1 — для проверки и скриншотов без панели колонии
    if (new URLSearchParams(location.search).has('foodpanel')) {
        const host = document.createElement('div');
        host.id = 'colony-body';
        host.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
            'width:min(980px,94vw);max-height:86vh;overflow:auto;z-index:100010;padding:16px;' +
            'border-radius:14px;background:#0b1526;border:1px solid #1e3350';
        document.body.appendChild(host);
        setTimeout(function () { render(host); }, 1200);
        setTimeout(function () { render(host); }, 2500);
    }

    global.FoodPanel = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
