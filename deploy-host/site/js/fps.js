// Кнопки от первого лица: вперёд/назад/влево/вправо, прыжок, действие.
// Действие зависит от того, что в руках: рука, инструмент, ведро, ящик.
// Работает поверх ходьбы из build3d (window.B3D_WALK).
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    var HANDS = {
        hand:   { icon: '✋', name: 'Рука',        hint: 'осмотреть' },
        tool:   { icon: '🔧', name: 'Инструмент', hint: 'починить' },
        bucket: { icon: '🪣', name: 'Ведро',       hint: 'набрать воды' },
        box:    { icon: '📦', name: 'Ящик',        hint: 'погрузить' }
    };

    // точки интереса: где что стоит (координаты сцен build3d)
    var POINTS = {
        city: [
            { x: -26, z: -6, name: 'Жилой модуль', kind: 'building' },
            { x: 8, z: -8, name: 'Термоядерная станция', kind: 'power' },
            { x: 22, z: 6, name: 'Космопорт', kind: 'spaceport' }
        ],
        moscow: [
            { x: -26, z: 10, name: 'Большой театр', kind: 'theatre' },
            { x: -2, z: -14, name: 'Спасская башня', kind: 'tower' },
            { x: 10, z: -6, name: 'Иван Великий', kind: 'tower' }
        ],
        beijing: [
            { x: 10, z: 34, name: 'Пекинская опера', kind: 'theatre' },
            { x: -12, z: -12, name: 'Пагода', kind: 'tower' }
        ],
        paris: [
            { x: 20, z: -20, name: 'Опера Гарнье', kind: 'theatre' },
            { x: -2, z: 4, name: 'Эйфелева башня', kind: 'tower' }
        ],
        gz: [
            { x: -6, z: 24, name: 'Кантонская башня', kind: 'tower' },
            { x: 14, z: 26, name: 'Оперный театр', kind: 'theatre' }
        ],
        ny: [
            { x: 9, z: 14, name: 'Статуя Свободы', kind: 'tower' }
        ]
    };

    var wrap = null, held = 'hand', nearest = null;

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    function currentTab() {
        var m = location.search.match(/[?&]tab=(paris|ny|moscow|beijing|gz|citymode|ships|city)/);
        return m ? m[1] : 'city';
    }

    function walk() { return window.B3D_WALK || null; }

    function walkOn() {
        var w = walk();
        return !!(w && w.on);
    }

    function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

    function findNearest() {
        var w = walk();
        if (!w) return null;
        var cam = window.B3D_CAMERA;
        var px = cam ? cam.position.x : w.startX;
        var pz = cam ? cam.position.z : w.startZ;
        var list = POINTS[currentTab()] || [];
        var best = null, bestD = 9;
        list.forEach(function (p) {
            var d = dist({ x: px, z: pz }, p);
            if (d < bestD) { bestD = d; best = { point: p, dist: d }; }
        });
        return best;
    }

    // ---------- интерфейс ----------
    function build() {
        if (wrap) wrap.remove();
        wrap = el('div');
        wrap.id = 'fps-controls';
        wrap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9700;' +
            'font:13px Inter,system-ui,sans-serif;color:#dce8f7';

        // статус: что рядом и что в руках
        var top = el('div');
        top.style.cssText = 'position:absolute;top:60px;left:50%;transform:translateX(-50%);' +
            'display:flex;gap:8px;align-items:center;pointer-events:none';
        top.innerHTML = '<span id="fps-near" style="padding:6px 12px;border:3px solid #0a0e12;' +
            'border-radius:8px;background:rgba(10,16,22,.85);font-weight:700;font-size:12.5px;' +
            'display:none">рядом: —</span>' +
            '<span id="fps-what" style="padding:6px 12px;border:3px solid #0a0e12;border-radius:8px;' +
            'background:rgba(16,24,34,.9);font-weight:700;font-size:12.5px;color:#ffd05a">✋ Рука</span>';
        wrap.appendChild(top);

        // крестовина
        var dpad = el('div');
        dpad.style.cssText = 'position:absolute;left:20px;bottom:22px;width:190px;height:190px;pointer-events:auto';
        var cells = [
            { k: 'w', t: '▲', x: 64, y: 0, w: 62, h: 62 },
            { k: 'a', t: '◀', x: 0, y: 64, w: 62, h: 62 },
            { k: 's', t: '▼', x: 64, y: 128, w: 62, h: 62 },
            { k: 'd', t: '▶', x: 128, y: 64, w: 62, h: 62 }
        ];
        cells.forEach(function (c) {
            var b = el('button', null, c.t);
            b.style.cssText = 'position:absolute;left:' + c.x + 'px;top:' + c.y + 'px;width:' + c.w +
                'px;height:' + c.h + 'px;border:3px solid #0a0e12;border-radius:12px;cursor:pointer;' +
                'background:linear-gradient(#3b4650,#232b33);color:#e6eaed;font-size:20px;font-weight:800;' +
                'box-shadow:0 4px 0 #0a0e12;touch-action:none;user-select:none';
            bindHold(b, c.k);
            dpad.appendChild(b);
        });
        wrap.appendChild(dpad);

        // прыжок и действие
        var right = el('div');
        right.style.cssText = 'position:absolute;right:20px;bottom:22px;display:flex;gap:12px;' +
            'align-items:flex-end;pointer-events:auto';

        var jump = el('button', null, '⤒');
        jump.style.cssText = 'width:74px;height:74px;border:3px solid #0a0e12;border-radius:50%;' +
            'cursor:pointer;background:linear-gradient(#8fd6ff,#2f9fe0);color:#04223a;font-size:26px;' +
            'font-weight:900;box-shadow:0 5px 0 #0a0e12;touch-action:none';
        jump.onclick = function () {
            if (typeof window.walkJump === 'function') window.walkJump();
        };
        right.appendChild(jump);

        var act = el('button', null, '⚡');
        act.id = 'fps-action';
        act.style.cssText = 'width:92px;height:92px;border:3px solid #0a0e12;border-radius:50%;' +
            'cursor:pointer;background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;font-size:26px;' +
            'font-weight:900;box-shadow:0 5px 0 #0a0e12;touch-action:none';
        act.onclick = doAction;
        right.appendChild(act);
        wrap.appendChild(right);

        // руки: 4 слота
        var hands = el('div');
        hands.style.cssText = 'position:absolute;left:50%;bottom:22px;transform:translateX(-50%);' +
            'display:flex;gap:8px;pointer-events:auto';
        Object.keys(HANDS).forEach(function (key) {
            var h = HANDS[key];
            var b = el('button', null, h.icon);
            b.setAttribute('data-hand', key);
            b.style.cssText = 'width:58px;height:58px;border:3px solid #0a0e12;border-radius:12px;' +
                'cursor:pointer;font-size:24px;background:' + (key === held ? 'linear-gradient(#ffe07a,#d8a41c)' : '#232b33') +
                ';box-shadow:0 4px 0 #0a0e12';
            b.title = h.name + ' — ' + h.hint;
            b.onclick = function () {
                held = key;
                if (walk()) walk().hands = key;
                build();
            };
            hands.appendChild(b);
        });
        wrap.appendChild(hands);
        document.body.appendChild(wrap);
    }

    // удержание кнопки = ходьба
    function bindHold(btn, key) {
        function down(e) {
            e.preventDefault();
            var w = walk();
            if (!w) return;
            w.keys[key] = true;
            btn.style.transform = 'translateY(3px)';
        }
        function up(e) {
            if (e) e.preventDefault();
            var w = walk();
            if (!w) return;
            w.keys[key] = false;
            btn.style.transform = '';
        }
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointerleave', up);
        btn.addEventListener('pointercancel', up);
    }

    // ---------- действие ----------
    function doAction() {
        var near = findNearest();
        var hand = HANDS[held];
        var msg = '';
        var name = near ? near.point.name : 'пустое место';
        var d = near ? near.dist : 99;

        if (held === 'hand') {
            if (near) msg = '👀 ' + name + ' — ' + (near.point.kind === 'theatre'
                ? 'сцена, зал, занавес' : near.point.kind === 'tower' ? 'смотровая площадка' :
                  near.point.kind === 'power' ? 'реактор, градирни' : 'жилые модули');
            else msg = '👀 вокруг ничего интересного';
        } else if (held === 'tool') {
            if (near && d < 6) {
                if (near.point.kind === 'power') {
                    msg = '🔧 пытаюсь запустить аварию на станции…';
                    if (window.Reactor && window.Reactor.open) setTimeout(function () { window.Reactor.open(); }, 300);
                } else {
                    msg = '🔧 ' + name + ': всё в порядке, ремонт не нужен';
                }
            } else msg = '🔧 подойди ближе к объекту';
        } else if (held === 'bucket') {
            msg = d < 8 ? '🪣 набрал воды у ' + name : '🪣 здесь нет воды';
        } else if (held === 'box') {
            if (near && d < 7) {
                msg = '📦 грузовой режим у ' + name;
                if (window.Cargo3D && window.Cargo3D.open) setTimeout(function () { window.Cargo3D.open('earth'); }, 300);
            } else msg = '📦 подойди к объекту, чтобы грузить';
        }
        float(msg);
    }

    function float(text) {
        var t = el('div', null, text);
        t.style.cssText = 'position:fixed;left:50%;bottom:210px;transform:translateX(-50%);z-index:9800;' +
            'padding:10px 18px;border:3px solid #0a0e12;border-radius:12px;background:rgba(10,16,22,.94);' +
            'color:#e6eaed;font:700 14px Inter,system-ui,sans-serif;pointer-events:none;' +
            'box-shadow:0 8px 24px rgba(0,0,0,.5);transition:opacity .4s';
        document.body.appendChild(t);
        setTimeout(function () { t.style.opacity = '0'; }, 1800);
        setTimeout(function () { t.remove(); }, 2400);
    }

    // обновление подсказок раз в кадр (через интервал, чтобы не грузить)
    function tick() {
        if (!walkOn()) {
            // в режиме показа кнопок не скрываем их, ждём включения ходьбы
            if (!/[?&]fps=1/.test(location.search)) {
                if (wrap && wrap.parentNode) wrap.style.display = 'none';
                return;
            }
        }
        if (!wrap || !wrap.parentNode) build();
        wrap.style.display = 'block';
        var near = findNearest();
        var nEl = document.getElementById('fps-near');
        var wEl = document.getElementById('fps-what');
        if (nEl) {
            if (near) {
                nEl.style.display = 'inline-block';
                nEl.textContent = 'рядом: ' + near.point.name + ' · ' + Math.round(near.dist) + ' м';
            } else nEl.style.display = 'none';
        }
        if (wEl) wEl.textContent = HANDS[held].icon + ' ' + HANDS[held].name + ' · ' + HANDS[held].hint;
    }
    setInterval(tick, 120);

    // клавиша E — действие, пробел — прыжок (если build3d не перехватил)
    document.addEventListener('keydown', function (e) {
        if (!walkOn()) return;
        var k = e.key.toLowerCase();
        if (k === 'e' || k === 'у') { doAction(); e.preventDefault(); }
        if (k === '1') { held = 'hand'; build(); }
        if (k === '2') { held = 'tool'; build(); }
        if (k === '3') { held = 'bucket'; build(); }
        if (k === '4') { held = 'box'; build(); }
    });

    // превью: ?fps=1 включает пешком и показывает кнопки
    if (/[?&]fps=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(function () {
            if (typeof window.B3D_ENABLE_WALK === 'function') {
                window.B3D_ENABLE_WALK(true);
            } else {
                var b = document.getElementById('walk-btn');
                if (b) b.click();
            }
        }, 2200);
    }

    window.FPS = { action: doAction, setHand: function (h) { held = h; build(); } };
})();
