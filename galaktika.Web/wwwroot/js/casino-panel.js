// ============================================================================
//  CASINO-PANEL.JS — казино солнечной системы (?casino=1 или кнопка «🎰 Казино»).
//  Показывает игры с house edge, баланс, историю и даёт сделать ставку:
//    • рулетка — красное/чёрное/чёт/число;
//    • скачки — выбор «коня» из пяти.
//  Все расчёты — на сервере (casino_play), клиент только показывает.
// ============================================================================
(function (global) {
    'use strict';
    const params = new URLSearchParams(location.search);

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

    function build(host) {
        api('casino_status').then(function (r) {
            if (!r.ok || !r.j || !r.j.ok) {
                host.innerHTML = '<div style="color:#ff9b9b;padding:16px">Казино недоступно: ' +
                    ((r.j && r.j.error) || 'нет ответа') + '</div>';
                return;
            }
            const s = r.j;
            const games = s.games.map(g => '<tr style="border-top:1px solid rgba(143,214,255,.1)">' +
                '<td style="padding:5px 8px">' + esc(g.name) + '</td>' +
                '<td style="padding:5px 8px;text-align:right;color:#ffd166">' + (g.house_edge * 100).toFixed(2) + ' %</td>' +
                '<td style="padding:5px 8px;text-align:right;opacity:.75">' + money(g.min_bet) + '–' + money(g.max_bet) + '</td>' +
                '<td style="padding:5px 8px;opacity:.7;font-size:11px">' + esc(g.payout_note) + '</td></tr>').join('');

            const hist = (s.history || []).slice(-6).reverse().map(h =>
                '<div style="font-size:11px;opacity:.8">' + h.ts + ' · ' + h.game +
                ' · ставка ' + money(h.stake) + ' · итог <b style="color:' + (h.net >= 0 ? '#8fe3a8' : '#ff9b9b') + '">' +
                (h.net >= 0 ? '+' : '') + money(h.net) + '</b></div>').join('') || '<div style="opacity:.5;font-size:11px">ставок ещё не было</div>';

            host.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
                '<div><div style="color:#c39bff;font-weight:800;font-size:19px">🎰 КАЗИНО СОЛНЕЧНОЙ СИСТЕМЫ</div>' +
                '<div style="opacity:.7;font-size:12px">рулетка · скачки · спорт · карты</div></div>' +
                '<div style="text-align:right;font-size:12px">баланс: <b style="color:#ffd166">' + money(s.credits) + ' кр</b></div></div>' +
                '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px">' +
                '<tr style="opacity:.6"><th style="text-align:left;padding:4px 8px">Игра</th>' +
                '<th style="text-align:right;padding:4px 8px">преимущество казино</th>' +
                '<th style="text-align:right;padding:4px 8px">лимиты</th><th></th></tr>' + games + '</table>' +

                '<div style="margin-top:14px;padding:10px;border-radius:10px;background:rgba(143,214,255,.06)">' +
                '<div style="font-weight:700;color:#8fd6ff;margin-bottom:6px">Рулетка (европейская)</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
                '<input id="cas-stake" type="number" value="1000" min="10" step="100" style="width:110px;padding:6px;border-radius:8px;border:1px solid #29405f;background:#0a1220;color:#e8eef8">' +
                '<button data-cas="red" style="padding:7px 12px;border-radius:8px;border:1px solid #a33;background:#2a0f12;color:#ffb4b4;cursor:pointer">Красное</button>' +
                '<button data-cas="black" style="padding:7px 12px;border-radius:8px;border:1px solid #444;background:#0f1420;color:#dfe8f5;cursor:pointer">Чёрное</button>' +
                '<button data-cas="even" style="padding:7px 12px;border-radius:8px;border:1px solid #2a5;background:#0f2016;color:#bfe8c8;cursor:pointer">Чёт</button>' +
                '<input id="cas-num" type="number" placeholder="число 0–36" min="0" max="36" style="width:110px;padding:6px;border-radius:8px;border:1px solid #29405f;background:#0a1220;color:#e8eef8">' +
                '<button id="cas-num-btn" style="padding:7px 12px;border-radius:8px;border:1px solid #c39bff;background:#1a1230;color:#dcc7ff;cursor:pointer">На число (35:1)</button>' +
                '</div><div id="cas-result" style="margin-top:10px;font-size:13px;min-height:20px"></div></div>' +

                '<div style="margin-top:12px;padding:10px;border-radius:10px;background:rgba(255,209,102,.06)">' +
                '<div style="font-weight:700;color:#ffd166;margin-bottom:6px">Скачки · тотализатор (казино 15 % пула)</div>' +
                '<div id="cas-horses" style="display:flex;gap:6px;flex-wrap:wrap"></div>' +
                '<div id="cas-horses-result" style="margin-top:8px;font-size:13px;min-height:18px"></div></div>' +

                '<div style="margin-top:12px"><div style="opacity:.6;font-size:11px;margin-bottom:4px">Последние ставки</div>' + hist + '</div>';

            function play(body) {
                const out = host.querySelector('#cas-result');
                const stake = Number((host.querySelector('#cas-stake') || {}).value || 0);
                api('casino_play', Object.assign({ stake: stake }, body)).then(function (res) {
                    if (!res.ok || !res.j || !res.j.ok) {
                        out.innerHTML = '<span style="color:#ff9b9b">' + esc((res.j && res.j.error) || 'ошибка') + '</span>';
                        return;
                    }
                    const j = res.j;
                    const dd = j.result;
                    let text;
                    if (dd.spin !== undefined) {
                        const col = dd.color === 'red' ? '🔴' : dd.color === 'black' ? '⚫' : '🟢';
                        text = col + ' выпало <b>' + dd.spin + '</b> · ' + (dd.win ? '<span style="color:#8fe3a8">выигрыш ' + money(j.payout) + '</span>'
                            : '<span style="color:#ff9b9b">проигрыш</span>') + ' · баланс ' + money(j.credits);
                    } else {
                        text = 'победил конь №' + (dd.winner + 1) + (dd.win ? ' — <span style="color:#8fe3a8">выигрыш ' + money(j.payout) + '</span>'
                            : ' — <span style="color:#ff9b9b">не угадали</span>') + ' · баланс ' + money(j.credits);
                    }
                    out.innerHTML = text;
                });
            }

            host.querySelectorAll('[data-cas]').forEach(function (b) {
                b.onclick = function () { play({ game: 'roulette_eu', bet: { type: b.getAttribute('data-cas') } }); };
            });
            const numBtn = host.querySelector('#cas-num-btn');
            if (numBtn) numBtn.onclick = function () {
                const n = Number((host.querySelector('#cas-num') || {}).value);
                if (!isFinite(n) || n < 0 || n > 36) return;
                play({ game: 'roulette_eu', bet: { type: 'number', value: n } });
            };
            const horseBox = host.querySelector('#cas-horses');
            if (horseBox) {
                for (let i = 0; i < 5; i++) {
                    const b = document.createElement('button');
                    b.textContent = 'Конь ' + (i + 1);
                    b.style.cssText = 'padding:7px 12px;border-radius:8px;border:1px solid rgba(255,209,102,.5);' +
                        'background:rgba(255,209,102,.1);color:#ffd166;cursor:pointer';
                    b.onclick = function () { play({ game: 'horses', pick: i }); };
                    horseBox.appendChild(b);
                }
            }
        }).catch(function () {
            host.innerHTML = '<div style="color:#ff9b9b;padding:16px">Сеть недоступна</div>';
        });
    }

    function standalone() {
        const host = document.createElement('div');
        host.id = 'casino-panel';
        host.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(820px,95vw);' +
            'max-height:90vh;overflow:auto;z-index:100030;padding:18px;border-radius:14px;background:#0b0f1a;' +
            'border:1px solid #3a2a5a;color:#e8eef8;font:13px/1.5 system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.7)';
        document.body.appendChild(host);
        build(host);
    }

    function mountButton() {
        if (document.getElementById('casino-btn')) return;
        const b = document.createElement('button');
        b.id = 'casino-btn';
        b.textContent = '🎰 Казино';
        b.style.cssText = 'position:fixed;left:14px;bottom:52px;z-index:100005;padding:7px 12px;border-radius:9px;' +
            'border:1px solid rgba(195,155,255,.5);background:rgba(8,14,24,.9);color:#dcc7ff;' +
            'font:12px ui-monospace,monospace;cursor:pointer';
        b.onclick = function () {
            const old = document.getElementById('casino-panel');
            if (old) { old.remove(); return; }
            standalone();
        };
        document.body.appendChild(b);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            if (params.has('casino')) standalone(); else setTimeout(mountButton, 2600);
        });
    } else {
        if (params.has('casino')) setTimeout(standalone, 800);
        else setTimeout(mountButton, 2600);
    }

    global.CasinoPanel = { open: standalone };
})(typeof window !== 'undefined' ? window : globalThis);
