// ============================================================================
//  WORLD-EVENT-PANEL.JS — экран зрелищ: Вармир (арены) и Тарсис (гонки).
//  Показывает заполняемость, выручку, расходы, прибыль и точку безубыточности,
//  кнопка проводит событие (world_tick) и обновляет кредиты.
//  Открывается: ?world=race | ?world=war (витрина) или кнопкой «Зрелища».
// ============================================================================
(function (global) {
    'use strict';

    const params = new URLSearchParams(location.search);
    const mode = params.get('world');           // race | war | null

    function token() {
        try {
            return localStorage.getItem('galaktika_token') ||
                   params.get('token') || '';
        } catch (e) { return params.get('token') || ''; }
    }
    function api(action, body) {
        const t = token();
        const opts = {
            method: body ? 'POST' : 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { 'X-Auth-Token': t } : {})
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch('api.php?action=' + action, opts).then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, j: j }; });
        });
    }
    const money = n => Math.round(Number(n) || 0).toLocaleString('ru-RU');
    const pct = n => Math.round((Number(n) || 0) * 100);

    function panel(host) {
        host.innerHTML = '<div style="color:#8fd6ff;padding:18px">Загрузка события…</div>';
        api('world_status').then(function (r) {
            if (!r.ok || !r.j || !r.j.ok) {
                host.innerHTML = '<div style="color:#ff9b9b;padding:18px">Не удалось получить событие: ' +
                    ((r.j && r.j.error) || 'нет ответа') + '</div>';
                return;
            }
            const w = r.j, b = w.balance;
            const isRace = w.focus === 'race';
            const color = isRace ? '#8fd6ff' : '#ffd166';
            const rows = [
                ['Гостей', b.guests + ' / ' + b.capacity + '  (' + pct(w.fill) + '%)'],
                ['Выручка', money(b.revenue) + ' кр'],
                ['— билеты', money(b.tickets)],
                ['— ставки', money(b.bets)],
                ['— деликатесы', money(b.luxury)],
                ['Расходы', money(b.costs)],
                ['— еда, кг', money(b.food_kg) + '  (' + money(b.food_cost) + ' кр)'],
                ['— энергия, кВт·ч', money(b.energy_kwh) + '  (' + money(b.energy_cost) + ' кр)'],
                ['— персонал / приз / арена', money(b.staff_cost) + ' / ' + money(b.prize) + ' / ' + money(b.upkeep)],
                ['Прибыль', money(b.profit) + ' кр  · маржа ' + pct(b.margin) + '%'],
                ['Безубыточность', b.breakeven_guests + ' гостей']
            ].map(function (x) {
                return '<tr><td style="padding:4px 10px 4px 0;opacity:.7">' + x[0] + '</td>' +
                       '<td style="padding:4px 0;text-align:right">' + x[1] + '</td></tr>';
            }).join('');

            host.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
                '<div><div style="color:' + color + ';font-weight:800;font-size:19px">' +
                (isRace ? '🏁 ТАРСИС · ГОНКИ' : '⚔ WAR WORLD · АРЕНА') + '</div>' +
                '<div style="opacity:.75;font-size:12px">' + w.event + ' · заполнение по часу суток</div></div>' +
                '<div style="text-align:right;font-size:12px;opacity:.8">' +
                (w.next ? ('следующий заезд через ' + Math.round(w.next.in_sec / 60) + ' мин<br>') : '') +
                'фокус игрока: <b>' + w.focus + '</b></div></div>' +
                '<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">' + rows + '</table>' +
                '<div style="margin-top:14px;display:flex;gap:10px;align-items:center">' +
                '<button id="we-run" style="padding:9px 16px;border-radius:9px;border:1px solid ' + color + ';' +
                'background:rgba(143,214,255,.12);color:#e8eef8;cursor:pointer;font:inherit">' +
                (isRace ? 'Провести заезд' : 'Провести бой') + '</button>' +
                '<span id="we-msg" style="font-size:12px;opacity:.85"></span></div>' +
                '<div style="margin-top:10px;font-size:11px;opacity:.55">Гости едят 0,3 кг и пьют 3 л в сутки; ' +
                '32 % покупают деликатесы ×10 к заводской еде.</div>';

            const btn = host.querySelector('#we-run');
            btn.onclick = function () {
                btn.disabled = true; btn.textContent = 'Идёт событие…';
                api('world_tick', { force: true }).then(function (res) {
                    const msg = host.querySelector('#we-msg');
                    if (res.ok && res.j && res.j.ok) {
                        const bb = res.j.balance;
                        msg.innerHTML = '<span style="color:#8fe3a8">+' + money(bb.profit) +
                            ' кр · кредиты ' + money(res.j.credits_before) + ' → ' + money(res.j.credits_after) + '</span>';
                        setTimeout(function () { panel(host); }, 900);
                    } else {
                        msg.innerHTML = '<span style="color:#ff9b9b">' +
                            ((res.j && res.j.error) || 'не удалось') + '</span>';
                        btn.disabled = false; btn.textContent = isRace ? 'Провести заезд' : 'Провести бой';
                    }
                }).catch(function () { btn.disabled = false; });
            };
        }).catch(function () {
            host.innerHTML = '<div style="color:#ff9b9b;padding:18px">Сеть недоступна</div>';
        });
    }

    function standalone(mode) {
        const host = document.createElement('div');
        host.id = 'world-event-panel';
        host.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);' +
            'width:min(760px,94vw);max-height:88vh;overflow:auto;z-index:100020;padding:18px;' +
            'border-radius:14px;background:#0b1526;border:1px solid #1e3350;color:#e8eef8;' +
            'font:13px/1.5 system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.6)';
        document.body.appendChild(host);
        panel(host);
    }

    // кнопка в игре
    function mountButton() {
        if (document.getElementById('world-event-btn')) return;
        const b = document.createElement('button');
        b.id = 'world-event-btn';
        b.textContent = '🏟 Зрелища';
        b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:100005;padding:7px 12px;border-radius:9px;' +
            'border:1px solid rgba(255,209,102,.45);background:rgba(8,14,24,.9);color:#ffd166;' +
            'font:12px ui-monospace,monospace;cursor:pointer';
        b.onclick = function () {
            const old = document.getElementById('world-event-panel');
            if (old) { old.remove(); return; }
            standalone(null);
        };
        document.body.appendChild(b);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            if (mode) standalone(mode); else setTimeout(mountButton, 2500);
        });
    } else {
        if (mode) { setTimeout(function () { standalone(mode); }, 800); }
        else setTimeout(mountButton, 2500);
    }

    global.WorldEventPanel = { panel: panel };
})(typeof window !== 'undefined' ? window : globalThis);
