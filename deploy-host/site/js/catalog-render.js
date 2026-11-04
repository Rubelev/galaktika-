// ============================================================================
//  CATALOG-RENDER.JS — этап 1 плана: сцена рисуется из Runtime.frame().
//  Шаг 1.2: орбиты-полилинии Кеплера, размеры из каталога, только активная
//  система (без чужих тел, которые «толпились у Солнца»).
//  Флаг ?render=catalog. Откат — без флага.
// ============================================================================
(function (global) {
    'use strict';

    const params = new URLSearchParams(location.search);
    if ((params.get('off') || '').split(',').indexOf('catalog') >= 0) return;
    if (params.get('render') !== 'catalog') return;

    const NS = 'http://www.w3.org/2000/svg';
    const nodes = new Map();
    let container = null, svg = null;
    let stats = { bodies: 0, orbits: 0, maxDev: 0, system: 'sol' };

    function camera() {
        const tr = (document.querySelector('.solar-system') || {}).style || {};
        const t = tr.transform || '';
        const m = t.match(/scale\(([\d.]+)\)/), rx = t.match(/rotateX\((-?[\d.]+)deg\)/), rz = t.match(/rotateZ\((-?[\d.]+)deg\)/);
        return { scale: m ? +m[1] : 1, tilt: rx ? +rx[1] : 0, spin: rz ? +rz[1] : 0, cx: 0, cy: 0 };
    }

    function activeSystem() {
        const q = new URLSearchParams(location.search).get('system');
        try {
            if (q && global.SystemRuntime && global.SystemRuntime.activate(q)) return q;
            if (global.SystemRuntime && global.SystemRuntime.currentId()) return global.SystemRuntime.currentId();
        } catch (e) { }
        return q || 'sol';
    }

    function bodiesOf(systemId) {
        const c = global.CATALOG;
        const list = (c && (c.bodies || c)) || [];
        return list.filter(function (b) { return (b.system || 'sol') === systemId; });
    }

    function ensureLayer() {
        if (container) return true;
        const scene = document.querySelector('.solar-system');
        if (!scene) return false;
        svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '1');
        svg.setAttribute('height', '1');
        svg.setAttribute('overflow', 'visible');
        svg.style.cssText = 'position:absolute;left:50%;top:50%;overflow:visible;pointer-events:none;z-index:5';
        scene.appendChild(svg);
        container = document.createElement('div');
        container.id = 'catalog-layer';
        container.style.cssText = 'position:absolute;left:50%;top:50%;width:0;height:0;z-index:6';
        scene.appendChild(container);
        return true;
    }

    function orbitPath(b, byId, timeMs) {
        if (!global.SceneModel || !global.SceneModel.orbitFrame) return null;
        const f = global.SceneModel.orbitFrame(b, timeMs, byId);
        return f.path;
    }

    function addOrbit(b, byId, timeMs) {
        const pts = orbitPath(b, byId, timeMs);
        if (!pts || !svg) return null;
        const d = pts.map(function (q, i) { return (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); }).join(' ');
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', (b.color || '#8fd6ff') + '66');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('stroke-dasharray', '4 8');
        svg.appendChild(path);
        stats.orbits++;
        return { pts: pts, el: path };
    }

    function addBody(b) {
        const isMoon = b.class === 'moon';
        const el = document.createElement('div');
        // КЛАСС ДОЛЖЕН ОТЛИЧАТЬСЯ от .planet/.moon: на них висит старый
        // делегат клика, который открывал глобус и накрывал слой каталога
        // (из-за этого было «кликов 1/42»).
        el.className = 'cat-body';
        el.setAttribute(isMoon ? 'data-moon' : 'data-planet-id', b.id);
        el.title = b.name || b.id;
        // РАЗМЕР ИЗ РАДИУСА, но логарифмически и с потолком: линейный масштаб
        // давал Юпитер размером с Солнце и наложения у центра
        const R = Number(b.radius_km) || 100;
        let size;
        if (b.class === 'star') size = 44;
        else if (isMoon) size = 4 + 2.5 * Math.log10(Math.max(50, R) / 50);
        else size = 9 + 7 * Math.log10(Math.max(300, R) / 300);
        size = b.class === 'star' ? 44 : Math.max(isMoon ? 4 : 9, Math.min(isMoon ? 11 : 30, size));
        // видимый шарик маленький, но зона клика — не меньше 22 px
        const hit = isMoon ? Math.max(8, size + 2) : Math.max(12, size + 4);
        el.style.cssText =
            'position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;' +
            'width:' + hit + 'px;height:' + hit + 'px;cursor:pointer;z-index:' + (
            b.class === 'star' ? 70 :
            isMoon ? Math.max(1, 30 - Math.round(size)) :
            b.class === 'planet' ? 60 :
            b.class === 'dwarf' ? 50 : 45) + ';';
        const dot = document.createElement('div');
        dot.style.cssText = 'border-radius:50%;width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) + 'px;' +
            'background:' + (b.color || '#9aa') + ';box-shadow:0 0 ' + Math.max(4, size) + 'px ' + (b.color || '#9aa') + '77';
        el.appendChild(dot);
        el.setAttribute('data-planet-id', b.id);
        // ОДИН клик — глобус (с задержкой), ДВА клика — планетарный вид.
        // Раньше dblclick не срабатывал: первый клик открывал глобус и цель уезжала.
        // ВАЖНО: одиночный клик НЕ открывает глобус — иначе первый же клик
        // накрывает слой каталога, и остальные клики бьют по глобусу
        // (наблюдали «кликов 1/42» при пяти кликах).
        el.addEventListener('click', function (ev) {
            ev.stopPropagation();
            window.__catalogClicks = (window.__catalogClicks || 0) + 1;
            stats.clicks = window.__catalogClicks;
            window.__lastClickId = b.id;
            try { global.__selectedBody = b.id; } catch (e) { }
        });
        el.addEventListener('dblclick', function (ev) {
            ev.stopPropagation();
            window.__lastDblId = b.id;
            if (typeof global.openPlanetView === 'function') {
                try { global.openPlanetView(b.id); return; } catch (e) { }
            }
            window.location.href = window.location.pathname + '?pv=' + encodeURIComponent(b.id);
        });
        container.appendChild(el);
        nodes.set(b.id, { el: el, body: b, size: size });
        stats.bodies++;
    }

    function deviationOf(f) {
        const n = nodes.get(f.id);
        if (!n || !n.path) return 0;
        // расстояние от позиции до ближайшей точки своей линии орбиты
        // расстояние до БЛИЖАЙШЕГО ОТРЕЗКА линии, а не до вершины:
        // у вытянутых орбит между сэмплами тысячи px, и метрика «до точки»
        // показывала 223 px там, где тело лежит ровно на линии
        function distToSeg(px, py, ax, ay, bx, by) {
            const dx = bx - ax, dy = by - ay;
            const l2 = dx * dx + dy * dy;
            if (!l2) return Math.hypot(px - ax, py - ay);
            let t = ((px - ax) * dx + (py - ay) * dy) / l2;
            t = Math.max(0, Math.min(1, t));
            return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
        }
        let best = 1e9;
        for (let i = 0; i + 1 < n.path.length; i++) {
            const a = n.path[i], b = n.path[i + 1];
            const d = distToSeg(f.pos.x, f.pos.y, a.x, a.y, b.x, b.y);
            if (d < best) best = d;
        }
        return best;
    }

    function build() {
        if (!ensureLayer()) return false;
        const sys = activeSystem();
        stats.system = sys;
        const list = bodiesOf(sys);
        if (!list.length) return false;
        const byId = {};
        list.forEach(function (b) { byId[b.id] = b; });
        const t0 = typeof simulatedTime === 'number' ? simulatedTime : Date.now();
        // нумеруем луны внутри родителя: разные кольца, иначе все на планете
        const moonCount = {};
        list.forEach(function (b) {
            if (!b.parent) return;
            moonCount[b.parent] = (moonCount[b.parent] || 0);
            b.moonIndex = moonCount[b.parent]++;
            b.__ringR = 10 + 6 * b.moonIndex;   // видимое кольцо вокруг планеты
        });
        list.forEach(function (b) {
            if (nodes.has(b.id)) return;
            const orb = addOrbit(b, byId, t0);
            addBody(b);
            if (orb) {
                const node = nodes.get(b.id);
                node.path = orb.pts;
                node.pathEl = orb.el;
                // запоминаем смещение родителя на момент построения
                if (b.parent && byId[b.parent] && global.SceneModel) {
                    const pp = global.SceneModel.orbitPosition(byId[b.parent], t0);
                    node.parentId = b.parent;
                    node.off0 = { x: pp.x, y: pp.y };
                }
            }
        });
        return nodes.size > 0;
    }

    function stepOnce() {
        const cam = camera();
        let list = [];
        try {
            // ВАЖНО: камеру применяет CSS-трансформ контейнера, поэтому у рантайма
            // просим СЫРЫЕ координаты сцены (без проекции) — иначе позиция и линия
            // орбиты считаются в разных системах координат (отклонение 2486 px).
            list = (global.SystemRuntime && global.SystemRuntime.frame)
                ? global.SystemRuntime.frame(typeof simulatedTime === 'number' ? simulatedTime : Date.now(),
                      { scale: 1, tilt: 0, spin: 0, cx: 0, cy: 0 })
                : [];
        } catch (e) { }
        if (!list.length) {
            list = bodiesOf(stats.system).map(function (b) {
                const p = global.SceneModel ? global.SceneModel.orbitPosition(b, simulatedTime) : { x: 0, y: 0 };
                return { id: b.id, pos: { x: p.x, y: p.y } };
            });
        }
        let maxDev = 0, worstId = '', worstKind = '';
        const byId = {};
        bodiesOf(stats.system).forEach(function (b) { byId[b.id] = b; });
        list.forEach(function (f) {
            const n = nodes.get(f.id);
            if (!n) return;
            // позиция из ТОЙ ЖЕ функции, что построила линию
            try {
                const of = global.SceneModel.orbitFrame(n.body, typeof simulatedTime === 'number' ? simulatedTime : Date.now(), byId);
                f.pos = of.pos;
            } catch (e) { }
            if (!isFinite(f.pos.x) || !isFinite(f.pos.y)) return;
            if (n.parentId && n.pathEl && global.SceneModel) {
                const pp = global.SceneModel.orbitPosition(byId[n.parentId],
                    typeof simulatedTime === 'number' ? simulatedTime : Date.now());
                const dx = pp.x - n.off0.x, dy = pp.y - n.off0.y;
                n.pathEl.setAttribute('transform', 'translate(' + dx.toFixed(1) + ',' + dy.toFixed(1) + ')');
            }
            n.el.style.transform = 'translate(' + f.pos.x.toFixed(1) + 'px,' + f.pos.y.toFixed(1) + 'px)';
            const d = deviationOf(f);
            if (d > maxDev) { maxDev = d; worstId = f.id; worstKind = n.body.class; }
        });
        stats.maxDev = +maxDev.toFixed(2);
        stats.worst = worstId + '/' + worstKind;
        updateStats();
    }

    function loop() {
        try { stepOnce(); } catch (e) { }
        if (params.has('clicktest')) {
            setTimeout(function () {
                window.__noGlobe = true;   // тест не должен открывать 5 глобусов подряд
                const arr = Array.from(nodes.values()).slice(0, 5);
                window.__clickTarget = arr.length;
                arr.forEach(function (n) { n.el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
                document.title = 'CLICKS ' + (window.__catalogClicks || 0) + '/' + arr.length +
                    ' · bodies=' + stats.bodies + ' · orbits=' + stats.orbits + ' · dev=' + stats.maxDev;
            }, 600);
        }
        requestAnimationFrame(loop);
    }

    function updateStats() {
        const box = document.getElementById('catalog-stats');
        if (!box) return;
        box.textContent = 'CATALOG · ' + stats.system + ' · тел ' + stats.bodies +
            ' · орбит ' + stats.orbits + ' · откл ' + stats.maxDev + ' px' +
            ' · кликов ' + (stats.clicks || 0) + '/' + (window.__clickTarget || stats.bodies);
        document.title = 'CATALOG ' + stats.system + ' bodies=' + stats.bodies +
            ' orbits=' + stats.orbits + ' dev=' + stats.maxDev + ' worst=' + (stats.worst || '');
    }

    function start() {
        if (!build()) { setTimeout(start, 800); return; }
        // В РЕЖИМЕ КАТАЛОГА ПРЯЧЕМ СТАРЫЙ РЕНДЕР ЦЕЛИКОМ: иначе поверх каталога
        // остаются canvas-тела и узлы старой сцены — два Солнца, дубли планет
        // и «планеты вне орбит» (старая сцена считает в другой проекции).
        function hideLegacy() {
            const sel = ['.orbit', '.planet', '.moon', '.ship-marker', '.sun', '.planet-wrapper',
                         '#solar-scene canvas', '#scene-canvas', '.solar-system > canvas'];
            sel.forEach(function (q) {
                document.querySelectorAll(q).forEach(function (el) {
                    if (el.closest && el.closest('#catalog-layer')) return;
                    el.style.display = 'none';
                });
            });
            document.querySelectorAll('canvas').forEach(function (cv) {
                if (cv.closest && cv.closest('#catalog-layer')) return;
                cv.style.visibility = 'hidden';
            });
        }
        hideLegacy();
        setInterval(hideLegacy, 1200);
        // панели интерфейса не должны перехватывать клики по телам
        setInterval(function () {
            ['#race-legend', '#race-panel', '.race-legend'].forEach(function (q) {
                document.querySelectorAll(q).forEach(function (el) { el.style.pointerEvents = 'none'; });
            });
        }, 800);
        const box = document.createElement('div');
        box.id = 'catalog-stats';
        box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100003;padding:6px 9px;border-radius:8px;' +
            'background:rgba(8,14,24,.9);border:1px solid rgba(143,214,255,.35);color:#dfe8f5;font:10px ui-monospace,monospace';
        document.body.appendChild(box);
        // первый расчёт делаем СРАЗУ, не дожидаясь rAF (в headless rAF не тикает)
        try { stepOnce(); } catch (e) { }
        requestAnimationFrame(loop);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1500); });
    else setTimeout(start, 1500);
})(typeof window !== 'undefined' ? window : globalThis);
