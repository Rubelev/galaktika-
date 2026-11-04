// ============================================================================
//  SCENE-ADAPT.JS — мост между старым слоем solar.js и новым scene.js
//  ---------------------------------------------------------------------------
//  Задача этапа 2: перенести запись позиций маркеров в один писатель.
//
//  Старый код (solar.js) больше НЕ трогает style.left/top/transform у маркеров.
//  Вместо этого он вызывает SceneBridge.publish(id, pose), а позицию пишет
//  scene.js внутри applyPose() — единственное место во всём проекте.
//
//  Включается флагом ?scene=2 (по умолчанию выключен, чтобы не рисковать
//  визуалом игроков до приёмки).
//
//  Контракт:
//    SceneBridge.on()                    — включён ли новый слой
//    SceneBridge.watch(id, el, radius)   — зарегистрировать маркер
//    SceneBridge.publish(id, pose)       — отдать позу (x, y, ang, hidden)
//    SceneBridge.unwatch(id)             — снять с регистрации
//    SceneBridge.stats()                 — счётчики для отладки
// ============================================================================
(function (global) {
    'use strict';

    // Новый слой включён ПО УМОЛЧАНИЮ (после приёмки ядра).
    // Откат: ?scene=1 — тогда всё рисует старый путь solar.js.
    let enabled = true;
    try {
        const q = new URLSearchParams(location.search).get('scene');
        if (q === '1') enabled = false;
        if (q === '2') enabled = true;
    } catch (e) { enabled = true; }

    if (!enabled || !global.SceneKit) {
        // ---------- РОУТИНГ КЛИКОВ ----------
    // Приоритет: планета > луна > корабль. Считаем по экранной геометрии
    // (getBoundingClientRect), поэтому перекрытие слоями не мешает.
    function rectHit(el, cx, cy, pad) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        const dx = cx - (r.left + r.width / 2);
        const dy = cy - (r.top + r.height / 2);
        const rad = Math.max(r.width, r.height) / 2 + (pad || 0);
        const d = Math.hypot(dx, dy);
        return d <= rad ? { el: el, d: d } : null;
    }

    function hitAt(cx, cy) {
        const cands = [];
        document.querySelectorAll('.planet[data-planet-id]').forEach(function (el) {
            const h = rectHit(el, cx, cy, 6);
            if (h) cands.push({ kind: 'planet', id: el.getAttribute('data-planet-id'), d: h.d, el: el });
        });
        document.querySelectorAll('.moon[data-moon]').forEach(function (el) {
            const h = rectHit(el, cx, cy, 4);
            if (h) cands.push({ kind: 'moon', id: el.getAttribute('data-moon'), d: h.d, el: el });
        });
        document.querySelectorAll('.ship-marker').forEach(function (el) {
            const h = rectHit(el, cx, cy, 4);
            if (h) cands.push({ kind: 'ship', id: el.dataset.sid || '', d: h.d, el: el });
        });
        return scene.chooseHit(cands);
    }

    let tapPrev = null;
    function onPointerDown(ev) {
        window.__pdCount = (window.__pdCount || 0) + 1;
        if (ev.button !== 0) return;
        const hit = hitAt(ev.clientX, ev.clientY);
        const now = Date.now();
        const prev = tapPrev;
        tapPrev = hit ? { t: now, kind: hit.kind, id: hit.id, x: ev.clientX, y: ev.clientY } : null;
        if (!hit) return;

        const isDouble = prev && prev.id === hit.id && prev.kind === hit.kind &&
            now - prev.t <= 520 &&
            Math.hypot(ev.clientX - prev.x, ev.clientY - prev.y) <= 60;

        if (hit.kind === 'planet') {
            if (isDouble && typeof global.openGlobe === 'function') {
                global.openGlobe(hit.id);
            }
            return;
        }
        if (hit.kind === 'moon') {
            if (isDouble && global.PlanetView && typeof global.PlanetView.open === 'function') {
                global.PlanetView.open(hit.id);
            }
            return;
        }
        if (hit.kind === 'ship' && isDouble) {
            const el = hit.el;
            const ri = parseInt(el.getAttribute('data-route'), 10);
            if (!isNaN(ri) && typeof global.openTrafficCard === 'function') global.openTrafficCard(ri);
            else if (el._fleet && typeof global.openFleetCard === 'function') global.openFleetCard(el._fleet);
        }
    }

    document.addEventListener('pointerdown', onPointerDown, true);

    global.SceneBridge = {
        hitAt: hitAt,
            on: function () { return false; },
            watch: function () { },
            unwatch: function () { },
            publish: function () { },
            stats: function () { return { enabled: false }; }
        };
        return;
    }

    const root = document.querySelector('.solar-system');
    if (!root) {
        global.SceneBridge = {
            on: function () { return false; },
            watch: function () { }, unwatch: function () { }, publish: function () { },
            stats: function () { return { enabled: false, reason: 'нет .solar-system' }; }
        };
        return;
    }

    const scene = global.SceneKit.createScene({
        root: root,
        clock: function () { return performance.now(); }
    });

    const watched = new Set();
    const poses = new Map();
    let started = false;

    function watch(id, el, radiusPx) {
        if (!id || !el) return;
        if (watched.has(id)) return;
        watched.add(id);
        // Не перетираем sid, выданный при сборке маркера: он должен совпадать
        // в старом и новом путях, иначе замеры «новый ↔ старый» невозможны.
        try { if (!el.dataset.sid) el.dataset.sid = id; } catch (e) { }
        scene.addShip({
            id: id,
            kind: 'ship',
            el: el,
            radiusPx: radiusPx || 10,
            pose: function () { return poses.get(id) || null; }
        });
    }

    function unwatch(id) {
        watched.delete(id);
        poses.delete(id);
        scene.removeShip(id);
    }

    function publish(id, pose) {
        if (!id) return;
        if (!watched.has(id)) return;      // маркер не зарегистрирован — старый слой сам нарисует
        poses.set(id, pose);
    }

    function start() {
        if (started) return;
        started = true;
        scene.start(null);                 // один RAF на всю сцену
    }

    // камера: берём реальные значения старого слоя, чтобы картинка не «прыгнула»
    function syncCamera() {
        const src = document.querySelector('.solar-system');
        if (!src) return;
        const st = getComputedStyle(src).transform;
        const m = st && st.match(/matrix3d\(([^)]+)\)/);
        // matrix3d сложно разобрать надёжно — берём переменные из CSS
        const cs = getComputedStyle(src);
        const scale = parseFloat(cs.getPropertyValue('--planet-scale')) || 1;
        scene.setCamera({
            x: 0, y: 0,
            scale: 1,
            rotX: parseFloat(cs.getPropertyValue('--rot-x')) || 0,
            rotZ: parseFloat(cs.getPropertyValue('--rot-z')) || 0
        });
        if (!isFinite(scale)) return;
    }

    global.SceneBridge = {
        on: function () { return true; },
        watch: watch,
        unwatch: unwatch,
        publish: publish,
        scene: scene,
        start: start,
        syncCamera: syncCamera,
        stats: function () {
            return {
                enabled: true,
                watched: watched.size,
                published: poses.size,
                scene: scene.stats()
            };
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})(typeof window !== 'undefined' ? window : globalThis);
