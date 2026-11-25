// ============================================================================
//  CASINO-VEGAS.JS — экран «Кеп-Вегас».
//
//  Пять зон → залы → игры. Для каждой игры — ставка и кнопка «Играть».
//  Все расчёты на сервере (casino_play), клиент только показывает результат.
//  Запуск: ?vegas=1 (кнопка «🎰 Вегас» добавляется в меню).
// ============================================================================
(function (global) {
    'use strict';
    const params = new URLSearchParams(location.search);
    const isVegas = params.has('vegas');

    function token() {
        try { return localStorage.getItem('galaktika_token') || params.get('token') || ''; }
        catch (e) { return params.get('token') || ''; }
    }
    function api(action, body) {
        const t = token();
        const opts = {
            method: body ? 'POST' : 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { 'X-Auth-Token': t } : {})
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch('api.php?action=' + action, opts).then(r => r.json().then(j => ({ ok: r.ok, j })));
    }
    const money = n => Math.round(Number(n) || 0).toLocaleString('ru-RU');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const ZONE_COLORS = {
        roulette: '#c9a44c', slots: '#b46bd4', cards: '#6fbf8f',
        horses: '#d08a4a', sports: '#5aa8e0'
    };
    const ZONE_ICONS = { roulette: '🎡', slots: '🎰', cards: '🃏', horses: '🐎', sports: '🏅' };

    function shell(host) {
        host.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">' +
            '<div style="font-size:19px;font-weight:800;color:#e6cf95">🎰 КЕП-ВЕГАС</div>' +
            '<div id="vg-balance" style="font-size:12px;opacity:.85"></div></div>' +
            '<div id="vg-zones" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px"></div>' +
            '<div id="vg-hall" style="margin-top:14px"></div>';

        api('casino_status').then(function (r) {
            if (r.ok && r.j && r.j.credits != null) {
                host.querySelector('#vg-balance').textContent = 'баланс: ' + money(r.j.credits) + ' кр';
            }
        });

        api('casino_zones').then(function (r) {
            if (!r.ok || !r.j || !r.j.ok) { host.querySelector('#vg-zones').textContent = 'Зоны недоступны'; return; }
            const zones = r.j.zones || [];
            host.querySelector('#vg-balance').textContent =
                'зон ' + zones.length + ' · залов ' + r.j.halls_total + ' · игр ' + r.j.games_total;
            const box = host.querySelector('#vg-zones');
            box.innerHTML = zones.map(function (z) {
                const c = ZONE_COLORS[z.id] || '#8fd0ff';
                return '<button data-zone="' + z.id + '" style="text-align:left;cursor:pointer;padding:12px;border-radius:12px;' +
                    'border:1px solid ' + c + '55;background:linear-gradient(160deg,' + c + '18,rgba(8,14,24,.9));color:#e8eef8;font:inherit">' +
                    '<div style="font-size:16px;font-weight:700;color:' + c + '">' + (ZONE_ICONS[z.id] || '') + ' ' + esc(z.name) + '</div>' +
                    '<div style="font-size:12px;opacity:.75;margin:4px 0 6px">' + esc(z.description || '') + '</div>' +
                    '<div style="font-size:11px;opacity:.85">залов ' + z.halls.length + ' · игр ' + z.games_total +
                    ' · ставки ' + money(z.min_stake) + '–' + money(z.max_stake) + '</div></button>';
            }).join('');
            box.querySelectorAll('[data-zone]').forEach(function (b) {
                b.onclick = function () { openZone(host, zones.find(z => z.id === b.getAttribute('data-zone'))); };
            });
            openZone(host, zones[0]);
        });
    }

    function openZone(host, zone) {
        if (!zone) return;
        const hall = host.querySelector('#vg-hall');
        const c = ZONE_COLORS[zone.id] || '#8fd0ff';
        hall.innerHTML =
            '<div style="font-size:14px;font-weight:700;color:' + c + ';margin-bottom:8px">' + esc(zone.name) + ' · залы</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
            zone.halls.map(function (h) {
                return '<div style="padding:8px 10px;border-radius:9px;border:1px solid rgba(143,208,255,.2);background:rgba(10,18,30,.65);font-size:12px">' +
                    '<b>' + esc(h.name) + '</b> · тир ' + h.tier + '<br><span style="opacity:.7">' + money(h.stake_min) + '–' +
                    money(h.stake_max) + ' · столов ' + h.tables + '</span><br><span style="opacity:.55">' + esc(h.vibe || '') + '</span></div>';
            }).join('') + '</div>' +
            '<div style="font-size:13px;font-weight:700;color:#e6cf95;margin-bottom:6px">Игры</div>' +
            '<div id="vg-games" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px"></div>';

        const games = zone.games || [];
        const gm = host.querySelector('#vg-games');
        gm.innerHTML = games.map(function (g, i) {
            return '<div style="padding:9px 10px;border-radius:9px;border:1px solid rgba(143,208,255,.16);background:rgba(8,14,24,.6)">' +
                '<div style="font-size:13px;font-weight:600">' + esc(g.name) + '</div>' +
                '<div style="font-size:11px;opacity:.7;margin:2px 0 6px">edge ' + (g.house_edge * 100).toFixed(2) + '% · ' +
                money(g.min_bet) + '–' + money(g.max_bet) + '</div>' +
                '<div style="display:flex;gap:6px">' +
                '<input id="vg-stake-' + i + '" type="number" value="' + g.min_bet + '" style="width:86px;padding:5px;border-radius:7px;border:1px solid #29405f;background:#0a1220;color:#e8eef8">' +
                '<button data-play="' + i + '" style="padding:5px 10px;border-radius:7px;border:1px solid ' + c + '66;background:' + c + '18;color:#e8eef8;cursor:pointer">Играть</button>' +
                '</div><div id="vg-res-' + i + '" style="font-size:11px;margin-top:5px;min-height:14px"></div></div>';
        }).join('');

        gm.querySelectorAll('[data-play]').forEach(function (b) {
            b.onclick = function () {
                const i = Number(b.getAttribute('data-play'));
                const g = games[i];
                const stake = Number((host.querySelector('#vg-stake-' + i) || {}).value || g.min_bet);
                const out = host.querySelector('#vg-res-' + i);
                out.textContent = '…';
                const body = { game: g.id, stake: stake };
                if (g.kind === 'roulette') body.bet = { type: 'red' };
                if (g.kind === 'horses') body.pick = 0;
                if (g.kind === 'sports') { body.event = 0; body.pick = 0; }
                if (g.kind === 'cards' && (g.id === 'bridge')) body.pick = 0;
                api('casino_play', body).then(function (res) {
                    if (!res.ok || !res.j || !res.j.ok) {
                        out.innerHTML = '<span style="color:#ff9b9b">' + esc((res.j && res.j.error) || 'ошибка') + '</span>';
                        return;
                    }
                    const j = res.j;
                    out.innerHTML = (j.net >= 0 ? '<span style="color:#8fe3a8">+' : '<span style="color:#ff9b9b">') +
                        money(j.net) + '</span> · баланс ' + money(j.credits);
                });
            };
        });
    }

    function standalone() {
        const host = document.createElement('div');
        host.id = 'vegas-panel';
        host.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1040px,95vw);' +
            'max-height:90vh;overflow:auto;z-index:100040;padding:18px;border-radius:14px;background:#070b14;' +
            'border:1px solid #4a3a1f;color:#e8eef8;font:13px/1.5 system-ui,sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.75)';
        document.body.appendChild(host);
        shell(host);
    }

    function addButton() {
        if (document.getElementById('vegas-btn')) return;
        const b = document.createElement('button');
        b.id = 'vegas-btn';
        b.textContent = '🎰 Кеп-Вегас';
        b.style.cssText = 'position:fixed;left:14px;bottom:128px;z-index:100005;padding:7px 12px;border-radius:9px;' +
            'border:1px solid rgba(230,207,149,.5);background:rgba(8,14,24,.9);color:#e6cf95;' +
            'font:12px ui-monospace,monospace;cursor:pointer';
        b.onclick = function () { location.href = location.pathname + '?vegas=1'; };
        document.body.appendChild(b);
    }

    if (isVegas) setTimeout(standalone, 700);
    else {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(addButton, 2400); });
        else setTimeout(addButton, 2400);
    }
    global.CasinoVegas = { open: standalone };
})(typeof window !== 'undefined' ? window : globalThis);
