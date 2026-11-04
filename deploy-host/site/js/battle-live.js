// ============================================================================
//  BATTLE-LIVE.JS — живой бой: состояние приходит с сервера, рисуем на canvas.
//  Адрес: /?battle=1&advance=N  (advance — на сколько минут продвинуть бой)
//  Сервер: POST /api/battle_start, /api/battle_tick, /api/battle_state
// ============================================================================
(function (global) {
    'use strict';

    const CLASS_COLOR = { fighter: '#ffd166', light: '#8fd6ff', hauler: '#8fe3a8' };

    function token() {
        // токен может прийти ссылкой (?token=) — сохраняем и используем
        try {
            const fromUrl = new URLSearchParams(location.search).get('token');
            if (fromUrl) { localStorage.setItem('galaktika_token', fromUrl); return fromUrl; }
        } catch (e) { }
        try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; }
    }

    async function api(action, body) {
        const headers = { 'Content-Type': 'application/json', 'X-Auth-Token': token() };
        const res = await fetch('/api.php?action=' + action, {
            method: 'POST', headers: headers, body: JSON.stringify(body || {})
        });
        try { return await res.json(); } catch (e) { return {}; }
    }

    function makeCanvas() {
        const c = document.createElement('canvas');
        c.id = 'battle-canvas';
        c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;background:#05080f;z-index:99990;';
        document.body.appendChild(c);
        return c;
    }

    function draw(ctx, w, h, state, meta) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#05080f';
        ctx.fillRect(0, 0, w, h);

        // Солнце и планеты — условные позиции
        const cx = w * 0.42, cy = h * 0.5;
        ctx.fillStyle = '#ff9f1c';
        ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(200,220,255,.65)';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.fillText('Солнце', cx + 32, cy + 4);

        const sat = { x: w * 0.82, y: h * 0.62 };
        ctx.strokeStyle = '#7f8ba3';
        ctx.beginPath(); ctx.arc(sat.x, sat.y, 16, 0, Math.PI * 2); ctx.stroke();
        // кольца
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(sat.x, sat.y, 34 + i * 8, 12 + i * 3, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(140,120,90,.35)'; ctx.stroke();
        }
        ctx.fillStyle = 'rgba(200,220,255,.65)';
        ctx.fillText('Сатурн · кольца', sat.x - 46, sat.y + 62);

        const ships = state.ships || [];
        const pirates = state.pirates || [];
        const inCombat = state.battle && (state.battle.phase === 'бой');

        // флот: кольцо вокруг Сатурна
        const alive = ships.filter(s => s.alive);
        alive.forEach(function (s, i) {
            const a = (i / Math.max(1, alive.length)) * Math.PI * 2;
            const r = 60 + (i % 6) * 7;
            const px = sat.x + Math.cos(a) * r;
            const py = sat.y + Math.sin(a) * r * 0.55;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = CLASS_COLOR[s.cls] || '#9fd0ff';
            ctx.fill();
            // HP-полоса над бортом
            const hp = s.maxHp ? Math.max(0, s.hp / s.maxHp) : 1;
            if (hp < 0.999) {
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(px - 5, py - 9, 10, 2.4);
                ctx.fillStyle = hp > 0.5 ? '#8fe3a8' : (hp > 0.25 ? '#ffd166' : '#ff6b6b');
                ctx.fillRect(px - 5, py - 9, 10 * hp, 2.4);
            }
            if (inCombat) {
                ctx.strokeStyle = 'rgba(255,120,90,.25)';
                ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sat.x + (Math.random() - 0.5) * 30,
                    sat.y + (Math.random() - 0.5) * 20); ctx.stroke();
            }
        });

        // трассеры флота по пиратам (во время боя)
        const alivePirates = pirates.filter(p => p.alive);
        if (inCombat && alivePirates.length) {
            alivePirates.forEach(function (p, i) {
                const a = (i / Math.max(1, alivePirates.length)) * Math.PI * 2;
                const px = sat.x + Math.cos(a) * 44;
                const py = sat.y + Math.sin(a) * 24;
                const from = sat.x + Math.cos(a + 0.6) * 60;
                const fromY = sat.y + Math.sin(a + 0.6) * 34;
                ctx.strokeStyle = 'rgba(255,140,90,0.55)';
                ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(from, fromY); ctx.lineTo(px, py); ctx.stroke();
                ctx.fillStyle = 'rgba(255,220,150,0.85)';
                ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
            });
        }

        // пираты
        pirates.filter(p => p.alive).forEach(function (p, i) {
            const a = (i / Math.max(1, pirates.length)) * Math.PI * 2;
            const px = sat.x + Math.cos(a) * 44;
            const py = sat.y + Math.sin(a) * 24;
            ctx.fillStyle = '#ff5a5a';
            ctx.beginPath();
            ctx.moveTo(px, py - 5); ctx.lineTo(px + 5, py + 4); ctx.lineTo(px - 5, py + 4);
            ctx.closePath(); ctx.fill();
        });

        // HUD
        const st = state.battle || {};
        ctx.fillStyle = '#dbe6f5';
        ctx.font = 'bold 16px Inter, system-ui, sans-serif';
        ctx.fillText('МИНУТА ' + (st.minute || 0) + ' / 74', 20, 32);
        ctx.font = '13px Inter, system-ui, sans-serif';
        ctx.fillStyle = st.phase === 'бой' ? '#ffd166' : (st.phase === 'уничтожены' ? '#2ecc71' : '#8ab4f8');
        ctx.fillText('фаза: ' + (st.phase || '—'), 190, 32);
        ctx.fillStyle = '#8fe3a8';
        ctx.fillText('флот: ' + (st.fleet || 0) + '  (и' + ((st.byClass || {}).fighter || 0) +
            '/л' + ((st.byClass || {}).light || 0) + '/г' + ((st.byClass || {}).hauler || 0) + ')', 330, 32);
        ctx.fillStyle = '#ff8a8a';
        ctx.fillText('пиратов: ' + (st.pirates || 0), 570, 32);
        ctx.fillStyle = '#dbe6f5';
        ctx.fillText('уничтожено: ' + (st.killed || 0) + ' · потери: ' + (st.fleetLost || 0), 700, 32);

        // легенда
        const legend = [['#ffd166', 'истребитель'], ['#8fd6ff', 'лёгкий'], ['#8fe3a8', 'грузовой'], ['#ff5a5a', 'пират']];
        legend.forEach(function (item, i) {
            ctx.fillStyle = item[0];
            ctx.beginPath(); ctx.arc(26 + i * 96, h - 44, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(200,215,235,0.8)';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.fillText(item[1], 34 + i * 96, h - 40);
        });
        if (st.phase === 'уничтожены') {
            ctx.fillStyle = 'rgba(46,204,113,0.92)';
            ctx.font = 'bold 15px Inter, system-ui, sans-serif';
            ctx.fillText('ВСЕ ПИРАТЫ УНИЧТОЖЕНЫ · флот ' + st.fleet + ', потери ' + st.fleetLost, 20, h - 70);
        }

        if (meta && meta.server) {
            ctx.fillStyle = 'rgba(150,170,200,.7)';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.fillText('состояние с сервера · ' + meta.server, 20, h - 16);
        }
    }

    async function boot() {
        const params = new URLSearchParams(location.search);
        if (!params.has('battle')) return;
        const advance = parseInt(params.get('advance') || '0', 10) || 0;

        const canvas = makeCanvas();
        canvas.width = global.innerWidth;
        canvas.height = global.innerHeight;
        const ctx = canvas.getContext('2d');

        await api('battle_start', {});
        let state = await api('battle_tick', { minutes: advance });
        if (!state || !state.battle) {
            ctx.fillStyle = '#ff8a8a';
            ctx.font = '16px Inter, system-ui, sans-serif';
            ctx.fillText('Бой не создан: нужен вход в игру', 20, 60);
            return;
        }
        draw(ctx, canvas.width, canvas.height, state, { server: 'ok' });
        document.title = 'BATTLE ' + state.battle.phase + ' мин=' + state.battle.minute +
            ' флот=' + state.battle.fleet + ' пираты=' + state.battle.pirates +
            ' уничт=' + state.battle.killed;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(typeof window !== 'undefined' ? window : globalThis);
