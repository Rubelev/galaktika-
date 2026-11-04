// ============================================================================
//  GARAGE.JS — мастерская болидов: чертежи рам, слоты, артефакты, пересчёт
//  характеристик. Открывается по ?garage=1. Документ: docs/BOLIDES.md
//  Сборка хранится в localStorage (galaktika_bolid).
// ============================================================================
(function (global) {
    'use strict';

    const HULLS = [
        { id: 'arrow', name: '«Стрела»', mass: 620, slots: 3, accel: 2.1, vmax: 420, hp: 60, turn: 8, heat: 1.25,
          shape: [[20, 60], [150, 40], [210, 52], [212, 68], [150, 78], [30, 80]] },
        { id: 'blade', name: '«Клинок»', mass: 780, slots: 4, accel: 2.8, vmax: 380, hp: 100, turn: 9, heat: 1.0,
          shape: [[18, 58], [120, 38], [220, 46], [224, 66], [120, 80], [26, 76]] },
        { id: 'hammer', name: '«Молот»', mass: 1050, slots: 5, accel: 4.0, vmax: 330, hp: 160, turn: 6, heat: 0.8,
          shape: [[16, 52], [100, 34], [230, 40], [236, 68], [100, 84], [22, 78]] }
    ];

    const MODULES = {
        engine: [
            { id: 'spark', name: 'Искра', vmax: +20, accel: -0.1, heat: +0.1 },
            { id: 'flame', name: 'Пламя', vmax: +45, accel: +0.2, heat: +0.25 },
            { id: 'geyser', name: 'Гейзер', vmax: +70, accel: +0.5, heat: +0.5 }
        ],
        armor: [
            { id: 'plate', name: 'Плита', hp: +40, mass: +90 },
            { id: 'grid', name: 'Решётка', hp: +25, mass: +40 },
            { id: 'ceramic', name: 'Керамика', hp: +15, mass: +20, heat: -0.1 }
        ],
        cooling: [
            { id: 'radiator', name: 'Радиатор', heat: -0.25 },
            { id: 'cryo', name: 'Крио', heat: -0.45, mass: +30 },
            { id: 'film', name: 'Плёночный', heat: -0.15, mass: +5 }
        ],
        maneuvre: [
            { id: 'flaps', name: 'Закрылки', turn: +2, hp: -5 },
            { id: 'gyro', name: 'Гиро', turn: +3, mass: +25 }
        ]
    };

    const ARTIFACTS = [
        { id: 'var_core', name: 'Ядро Вармира', from: 'Вармир · литейная', effect: 'разгон без перегрева 8 с', vmax: +10, heat: -0.4 },
        { id: 'adrasteya', name: 'Кольцо Адрастеи', from: 'арена · пояс', effect: '+сцепление на кольцах', turn: +2, mass: -15 },
        { id: 'ice', name: 'Ледяная пломба', from: 'Европа', effect: 'охлаждение +30 %', heat: -0.35 },
        { id: 'clone_mark', name: 'Клеймо клона', from: 'клонарня', effect: 'возврат болида без потери узлов', hp: +10 },
        { id: 'shard', name: 'Осколок обломка', from: 'пояс', effect: 'прочность за счёт скорости', hp: +20, vmax: -10 }
    ];

    const STORE = 'galaktika_bolid_v1';

    function load() {
        try {
            const raw = localStorage.getItem(STORE);
            if (raw) return JSON.parse(raw);
        } catch (e) { }
        return { hull: 'blade', engine: 'flame', armor: 'grid', cooling: 'radiator', maneuvre: 'flaps', artifact: 'adrasteya' };
    }
    function save(b) {
        try { localStorage.setItem(STORE, JSON.stringify(b)); } catch (e) { }
        // на сервер — сборка должна ехать за игроком (build_save валидирует)
        if (window.BuildSync) {
            window.BuildSync.save('bolid', {
                hull: b.hull, modules: b.modules || [], artifacts: b.artifacts || []
            }).catch(function () { });
        }
    }

    function calc(b) {
        const h = HULLS.find(x => x.id === b.hull) || HULLS[1];
        let mass = h.mass, hp = h.hp, vmax = h.vmax, accel = h.accel, turn = h.turn, heat = h.heat;
        const mods = [];
        [['engine', 'engine'], ['armor', 'armor'], ['cooling', 'cooling'], ['maneuvre', 'maneuvre']].forEach(function (pair) {
            const list = MODULES[pair[1]];
            const m = list.find(x => x.id === b[pair[0]]);
            if (!m) return;
            mods.push(m.name);
            mass += m.mass || 0; hp += m.hp || 0; vmax += m.vmax || 0;
            accel += m.accel || 0; turn += m.turn || 0; heat += m.heat || 0;
        });
        const art = ARTIFACTS.find(x => x.id === b.artifact);
        if (art) {
            mods.push(art.name);
            mass += art.mass || 0; hp += art.hp || 0; vmax += art.vmax || 0;
            turn += art.turn || 0; heat += art.heat || 0; accel += art.accel || 0;
        }
        const massFactor = 620 / Math.max(300, mass);
        return {
            mass: Math.round(mass), hp: Math.round(hp),
            vmax: Math.round(vmax * (0.85 + 0.15 * massFactor)),
            accel: +(accel / massFactor).toFixed(2),
            turn: Math.round(turn), heat: +heat.toFixed(2), mods: mods
        };
    }

    function boot() {
        const params = new URLSearchParams(location.search);
        if (!params.has('garage')) return;

        document.body.innerHTML = '';
        document.body.classList.add('garage-mode');
        document.body.style.cssText = 'margin:0;background:#070b12;color:#dfe8f5;font:13px/1.6 Inter,system-ui,sans-serif;overflow:auto';

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;gap:24px;padding:24px 28px;align-items:flex-start;flex-wrap:wrap';
        document.body.appendChild(wrap);

        const left = document.createElement('div');
        left.style.cssText = 'flex:1 1 520px;min-width:420px';
        left.innerHTML = '<div style="font-weight:700;letter-spacing:1px;color:#ffd166;font-size:16px">МАСТЕРСКАЯ БОЛИДОВ</div>' +
            '<div style="opacity:.7;font-size:12px;margin-top:2px">чертёж · слоты · артефакты · пересчёт характеристик</div>';
        const cv = document.createElement('canvas');
        cv.width = 560; cv.height = 300;
        cv.style.cssText = 'margin-top:14px;border-radius:14px;background:#0b1322;border:1px solid rgba(143,214,255,.18)';
        left.appendChild(cv);
        wrap.appendChild(left);

        const right = document.createElement('div');
        right.style.cssText = 'flex:0 0 380px;display:flex;flex-direction:column;gap:10px';
        wrap.appendChild(right);

        const state = load();

        function drawHull(h, c) {
            const ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, cv.width, cv.height);
            // сетка
            ctx.strokeStyle = 'rgba(80,110,150,.18)';
            for (let x = 0; x < cv.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
            for (let y = 0; y < cv.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); }
            // корпус
            ctx.save();
            ctx.translate(60, 70);
            ctx.beginPath();
            h.shape.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
            ctx.closePath();
            ctx.fillStyle = 'rgba(143,214,255,.12)';
            ctx.fill();
            ctx.strokeStyle = c;
            ctx.lineWidth = 2;
            ctx.stroke();
            // оси и колёса
            ctx.strokeStyle = 'rgba(200,220,240,.45)';
            ctx.beginPath(); ctx.moveTo(40, 90); ctx.lineTo(190, 90); ctx.stroke();
            [[55, 96, 18], [170, 96, 22]].forEach(function (w) {
                ctx.beginPath(); ctx.arc(w[0], w[1], w[2], 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(200,220,240,.5)'; ctx.stroke();
            });
            // слоты
            for (let i = 0; i < h.slots; i++) {
                ctx.fillStyle = 'rgba(143,227,168,.25)';
                ctx.fillRect(30 + i * 34, 150, 26, 16);
                ctx.strokeStyle = 'rgba(143,227,168,.55)';
                ctx.strokeRect(30 + i * 34, 150, 26, 16);
            }
            ctx.fillStyle = 'rgba(223,232,245,.55)';
            ctx.font = '11px Inter,system-ui,sans-serif';
            ctx.fillText('слоты: ' + h.slots + ' · масса ' + h.mass + ' кг', 30, 190);
            ctx.restore();
        }

        function bar(label, value, max, color) {
            const pct = Math.max(0, Math.min(100, value / max * 100));
            return '<div style="margin-top:6px">' +
                '<div style="display:flex;justify-content:space-between;font-size:11px;opacity:.8">' +
                '<span>' + label + '</span><span>' + value + '</span></div>' +
                '<div style="height:6px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:3px">' +
                '<div style="height:6px;border-radius:3px;width:' + pct + '%;background:' + color + '"></div></div></div>';
        }

        function render() {
            const h = HULLS.find(x => x.id === state.hull) || HULLS[1];
            const st = calc(state);
            drawHull(h, '#ffd166');

            function sel(name, list, key) {
                return '<label style="display:block;margin-top:8px"><span style="font-size:11px;opacity:.7">' + name + '</span>' +
                    '<select data-key="' + key + '" style="width:100%;margin-top:3px;padding:6px;border-radius:8px;background:#101a2b;color:#dfe8f5;border:1px solid rgba(143,214,255,.3)">' +
                    list.map(function (m) { return '<option value="' + m.id + '"' + (state[key] === m.id ? ' selected' : '') + '>' + m.name + '</option>'; }).join('') +
                    '</select></label>';
            }

            right.innerHTML =
                sel('рама', HULLS, 'hull') +
                sel('двигатель', MODULES.engine, 'engine') +
                sel('броня', MODULES.armor, 'armor') +
                sel('охлаждение', MODULES.cooling, 'cooling') +
                sel('маневр', MODULES.maneuvre, 'maneuvre') +
                sel('артефакт (свободный слот)', ARTIFACTS, 'artifact') +
                '<div style="margin-top:12px;padding:10px;border-radius:10px;background:rgba(255,209,102,.07);border:1px solid rgba(255,209,102,.25)">' +
                bar('макс. скорость', st.vmax, 520, '#ffd166') +
                bar('разгон (меньше — лучше)', +(st.accel * 100).toFixed(0), 500, '#8fd6ff') +
                bar('прочность', st.hp, 220, '#8fe3a8') +
                bar('поворот', st.turn, 14, '#c9a3ff') +
                bar('перегрев (меньше — лучше)', Math.round(st.heat * 100), 250, '#ff8a8a') +
                '<div style="margin-top:8px;font-size:11px;opacity:.8">масса: ' + st.mass + ' кг · узлы: ' + st.mods.join(', ') + '</div>' +
                '</div>' +
                '<button id="garage-test" style="margin-top:10px;padding:10px;border-radius:10px;border:none;background:#ffd166;color:#1a1408;font-weight:700;cursor:pointer">ПРОВЕРИТЬ В ПОЛИГОНЕ</button>';

            right.querySelectorAll('select').forEach(function (s) {
                s.onchange = function () {
                    state[s.dataset.key] = s.value;
                    save(state);
                    render();
                };
            });
            const btn = document.getElementById('garage-test');
            if (btn) btn.onclick = function () {
                document.title = 'GARAGE ' + h.name + ' vmax=' + st.vmax + ' accel=' + st.accel + ' hp=' + st.hp;
            };
            document.title = 'GARAGE ' + h.name + ' vmax=' + st.vmax + ' accel=' + st.accel + ' hp=' + st.hp;
        }

        // прячем обучающие оверлеи — в мастерской они мешают
        function hideOverlays() {
            document.querySelectorAll('[id],[class]').forEach(function (el) {
                const tag = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
                if (/mentor|tutor|onboard|legend|welcome/.test(tag) && el !== document.body) el.style.display = 'none';
            });
        }
        hideOverlays();
        setTimeout(hideOverlays, 900);
        setTimeout(hideOverlays, 2600);

        render();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(typeof window !== 'undefined' ? window : globalThis);
