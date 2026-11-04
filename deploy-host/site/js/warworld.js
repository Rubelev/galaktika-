// ============================================================================
//  WARWORLD.JS — «Вармир»: карта войны, клонарня, кабина героя, улучшение клона
//  и супер-оружие из других миров. Легенда: docs/LORE-WARWORLD.md
//  Открывается по ?war=1
// ============================================================================
(function (global) {
    'use strict';

    const NODES = [
        { id: 'prime', name: 'Вармир-Прайм', kind: 'жилая', x: 0.46, y: 0.44, r: 34, color: '#5fd08a' },
        { id: 'forge', name: 'Литейная луна', kind: 'оружие', x: 0.24, y: 0.30, r: 16, color: '#ffb4a2' },
        { id: 'clon', name: 'Клонарня', kind: 'клоны', x: 0.62, y: 0.22, r: 16, color: '#8fd6ff' },
        { id: 'hosp', name: 'Госпиталь', kind: 'лечение', x: 0.20, y: 0.68, r: 14, color: '#8fe3a8' },
        { id: 'range', name: 'Полигон', kind: 'опыт', x: 0.38, y: 0.80, r: 13, color: '#c9a3ff' },
        { id: 'ars', name: 'Арсенал', kind: 'боеприпасы', x: 0.60, y: 0.80, r: 13, color: '#ffd166' },
        { id: 'front', name: 'ФРОНТ', kind: 'бой', x: 0.80, y: 0.60, r: 20, color: '#ff6b6b' }
    ];

    const SETS = [
        { id: 'assault', name: 'Штурмовик', str: 9, rea: 6, arm: 8, acc: 5, end: 7, psi: 2 },
        { id: 'sniper', name: 'Снайпер', str: 4, rea: 9, arm: 3, acc: 10, end: 5, psi: 4 },
        { id: 'tank', name: 'Танк', str: 7, rea: 3, arm: 10, acc: 4, end: 9, psi: 3 },
        { id: 'psi', name: 'Псионик', str: 3, rea: 7, arm: 4, acc: 6, end: 6, psi: 10 }
    ];

    const WEAPONS = [
        { id: 'none', name: '— пусто —', from: '', dmg: 0, rate: 0, crit: 0 },
        { id: 'adrasteya_lance', name: 'Копьё Адрастеи', from: 'арена · пояс', dmg: 14, rate: 1.1, crit: 12 },
        { id: 'var_core', name: 'Ядро Вармира', from: 'литейная', dmg: 10, rate: 1.25, crit: 6 },
        { id: 'ice_shard', name: 'Ледяная пломба', from: 'Европа', dmg: 6, rate: 1.4, crit: 4 },
        { id: 'clone_mark', name: 'Клеймо клона', from: 'клонарня', dmg: 8, rate: 1.0, crit: 10 },
        { id: 'shard', name: 'Осколок обломка', from: 'пояс', dmg: 18, rate: 0.8, crit: 8 }
    ];

    const STORE = 'galaktika_clone_v1';

    function load() {
        try {
            const raw = localStorage.getItem(STORE);
            if (raw) return JSON.parse(raw);
        } catch (e) { }
        return { set: 'assault', points: 4, up: { str: 0, rea: 0, arm: 0, acc: 0, end: 0, psi: 0 }, w1: 'none', w2: 'none' };
    }
    function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { } }

    function stats(s) {
        const base = SETS.find(x => x.id === s.set) || SETS[0];
        const out = {};
        ['str', 'rea', 'arm', 'acc', 'end', 'psi'].forEach(function (k) {
            out[k] = base[k] + (s.up[k] || 0);
        });
        return out;
    }
    function weapons(s) {
        return [s.w1, s.w2].map(id => WEAPONS.find(w => w.id === id) || WEAPONS[0]);
    }
    function combat(s) {
        const st = stats(s), ws = weapons(s);
        const dmg = 6 + st.str * 1.4 + st.acc * 0.8 + ws.reduce((a, w) => a + w.dmg, 0);
        const rate = 1 + st.rea * 0.03 + ws.reduce((a, w) => a + (w.rate - 1), 0);
        const hp = 60 + st.arm * 4 + st.end * 3;
        const crit = 0.05 + st.acc * 0.01 + ws.reduce((a, w) => a + w.crit / 100, 0);
        return { dmg: +dmg.toFixed(1), rate: +rate.toFixed(2), hp: Math.round(hp), crit: +crit.toFixed(2),
                 dps: +(dmg * rate).toFixed(1) };
    }

    function boot() {
        if (!new URLSearchParams(location.search).has('war')) return;
        document.body.classList.add('war-mode');
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;background:#070b12;color:#dfe8f5;font:13px/1.6 Inter,system-ui,sans-serif;overflow:hidden';

        const cv = document.createElement('canvas');
        cv.width = innerWidth; cv.height = innerHeight;
        cv.style.cssText = 'position:absolute;inset:0';
        document.body.appendChild(cv);
        const ctx = cv.getContext('2d');

        const top = document.createElement('div');
        top.style.cssText = 'position:absolute;left:20px;top:14px;display:flex;gap:18px;font-size:13px';
        top.innerHTML = '<span style="font-weight:700;letter-spacing:1px;color:#ff8a8a">ВАРМИР · ВЕЧНАЯ ВОЙНА</span>' +
            '<span id="war-phase" style="color:#ffd166"></span>';
        document.body.appendChild(top);

        const panel = document.createElement('div');
        panel.style.cssText = 'position:absolute;right:18px;top:50px;width:330px;max-height:82vh;overflow:auto;padding:14px;border-radius:14px;' +
            'background:rgba(12,20,34,0.92);border:1px solid rgba(255,138,138,0.35)';
        document.body.appendChild(panel);

        const state = load();
        let capsule = false, tickNo = 0, enemyHp = 0, enemyMax = 0, logLines = [];

        function nextEnemy() {
            enemyMax = 120 + Math.round(Math.random() * 80);
            enemyHp = enemyMax;
        }
        nextEnemy();

        function battleText() {
            const cb = combat(state);
            return 'враг: ' + Math.max(0, Math.round(enemyHp)) + ' / ' + enemyMax + ' HP<br>' +
                'аватар: DPS ' + cb.dps + ' · HP ' + cb.hp + '<br>' +
                (logLines.slice(-3).join('<br>') || 'залпы…');
        }

        function renderPanel() {
            const st = stats(state);
            const cb = combat(state);
            const ws = weapons(state);
            const upRow = function (key, label) {
                return '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:3px">' +
                    '<span style="font-size:11px;opacity:.8">' + label + ' ' + st[key] + '</span>' +
                    '<button data-up="' + key + '" style="width:26px;height:22px;border-radius:6px;border:1px solid rgba(143,214,255,.4);' +
                    'background:rgba(143,214,255,.12);color:#dfe8f5;cursor:pointer">+</button></div>';
            };
            const wsel = function (key, label) {
                return '<label style="display:block;margin-top:6px;font-size:11px;opacity:.85">' + label +
                    '<select data-w="' + key + '" style="width:100%;margin-top:3px;padding:5px;border-radius:8px;background:#101a2b;color:#dfe8f5;border:1px solid rgba(143,214,255,.3)">' +
                    WEAPONS.map(w => '<option value="' + w.id + '"' + (state[key] === w.id ? ' selected' : '') + '>' +
                        w.name + (w.from ? ' · ' + w.from : '') + '</option>').join('') + '</select></label>';
            };
            panel.innerHTML =
                '<div style="color:#ff8a8a;font-weight:700;letter-spacing:.5px">КЛОН · ' + (SETS.find(x => x.id === state.set) || SETS[0]).name + '</div>' +
                '<div style="font-size:11px;opacity:.7;margin-top:2px">очков улучшения: <b>' + state.points + '</b></div>' +
                '<div style="margin-top:8px">' +
                upRow('str', 'сила') + upRow('rea', 'реакция') + upRow('arm', 'броня') +
                upRow('acc', 'точность') + upRow('end', 'выносливость') + upRow('psi', 'пси') + '</div>' +
                '<div style="margin-top:10px;padding:8px;border-radius:10px;background:rgba(255,209,102,.07);border:1px solid rgba(255,209,102,.2);font-size:11px">' +
                'урон ' + cb.dmg + ' · темп ' + cb.rate + ' · HP ' + cb.hp + ' · крит ' + Math.round(cb.crit * 100) + '%<br>' +
                '<b style="color:#ffd166">DPS ' + cb.dps + '</b></div>' +
                wsel('w1', 'оружие 1 (из других миров)') + wsel('w2', 'оружие 2') +
                '<div style="margin-top:8px;font-size:11px;opacity:.75">' +
                ws.filter(w => w.id !== 'none').map(w => '• ' + w.name + ' — ' + w.from).join('<br>') + '</div>' +
                '<div id="war-battle" style="margin-top:10px;font-size:11px;line-height:1.5;min-height:64px">' +
                (capsule ? battleText() : 'герой вне кабины · клон ждёт в клонарне') + '</div>';

            panel.querySelectorAll('[data-up]').forEach(function (b) {
                b.onclick = function () {
                    if (state.points <= 0) return;
                    state.up[b.dataset.up] = (state.up[b.dataset.up] || 0) + 1;
                    state.points--;
                    save(state);
                    renderPanel();
                };
            });
            panel.querySelectorAll('[data-w]').forEach(function (sel) {
                sel.onchange = function () { state[sel.dataset.w] = sel.value; save(state); renderPanel(); };
            });
        }

        const btn = document.createElement('button');
        btn.textContent = 'ЛЕЧЬ В КАБИНУ';
        btn.style.cssText = 'position:absolute;left:20px;bottom:24px;padding:12px 20px;border-radius:12px;border:none;' +
            'background:#ff8a8a;color:#1a0b0b;font-weight:700;cursor:pointer;font:inherit';
        btn.onclick = function () {
            capsule = !capsule;
            btn.textContent = capsule ? 'ВЫЙТИ ИЗ КАБИНЫ' : 'ЛЕЧЬ В КАБИНУ';
            if (capsule) { tickNo = 0; logLines = []; nextEnemy(); }
            renderPanel();
            document.title = 'WAR ' + (capsule ? 'в бою' : 'в кабине') + ' dps=' + combat(state).dps;
        };
        document.body.appendChild(btn);

        function draw() {
            const W = cv.width, H = cv.height;
            ctx.fillStyle = '#070b12';
            ctx.fillRect(0, 0, W, H);
            for (let i = 0; i < 160; i++) {
                ctx.fillStyle = 'rgba(180,205,240,' + (0.12 + (i % 5) * 0.07) + ')';
                ctx.fillRect((i * 97) % W, (i * 53) % H, 1, 1);
            }
            const t = Date.now() / 1000;
            NODES.forEach(function (n) {
                const x = n.x * W, y = n.y * H;
                if (n.id === 'front') {
                    const pulse = 0.55 + 0.45 * Math.sin(t * 3);
                    ctx.beginPath(); ctx.arc(x, y, n.r + 8 * pulse, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255,107,107,' + (0.5 * pulse) + ')'; ctx.lineWidth = 2; ctx.stroke();
                }
                ctx.beginPath(); ctx.arc(x, y, n.r, 0, Math.PI * 2);
                ctx.fillStyle = n.color + '33'; ctx.fill();
                ctx.strokeStyle = n.color; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = 'rgba(223,232,245,.9)'; ctx.font = '11px Inter,system-ui,sans-serif';
                ctx.fillText(n.name, x + n.r + 6, y + 4);
                ctx.fillStyle = 'rgba(150,170,195,.75)'; ctx.font = '10px Inter,system-ui,sans-serif';
                ctx.fillText(n.kind, x + n.r + 6, y + 18);
            });
            const p = NODES[0], f = NODES[6];
            ctx.beginPath(); ctx.moveTo(p.x * W, p.y * H); ctx.lineTo(f.x * W, f.y * H);
            ctx.strokeStyle = 'rgba(255,180,160,.25)'; ctx.setLineDash([6, 8]); ctx.stroke(); ctx.setLineDash([]);
        }

        function tick() {
            draw();
            const ph = document.getElementById('war-phase');
            if (ph) { ph.textContent = capsule ? 'АВАТАР В БОЮ' : 'ОЖИДАНИЕ В КАБИНЕ'; ph.style.color = capsule ? '#ff8a8a' : '#8ab4f8'; }

            if (capsule) {
                tickNo++;
                const cb = combat(state);
                if (tickNo % 3 === 0 && enemyHp > 0) {
                    enemyHp -= cb.dmg * cb.rate * (Math.random() < cb.crit ? 2 : 1);
                    if (enemyHp <= 0) {
                        logLines.push('враг уничтожен · +1 очко улучшения');
                        state.points += 1;
                        save(state);
                        nextEnemy();
                        renderPanel();
                    }
                }
                const b = document.getElementById('war-battle');
                if (b) b.innerHTML = battleText();
            }
        }

        function hideOverlays() {
            document.querySelectorAll('[id],[class]').forEach(function (el) {
                const tag = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
                if (/mentor|tutor|onboard|legend|welcome/.test(tag) && el !== document.body) el.style.display = 'none';
            });
        }
        hideOverlays(); setTimeout(hideOverlays, 900); setTimeout(hideOverlays, 2600);

        renderPanel();
        setInterval(tick, 120);
        document.title = 'WAR кабина dps=' + combat(state).dps;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(typeof window !== 'undefined' ? window : globalThis);
