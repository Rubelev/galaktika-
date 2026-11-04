// ============================================================================
//  SCENE.JS — новый слой сцены «Галактики» (пересборка)
//  ---------------------------------------------------------------------------
//  Задача: убрать «девять писателей» позиций из solar.js. Здесь ровно один
//  писатель — applyPose(), один цикл — Scene.tick(), один роутер кликов —
//  Scene.on('click').
//
//  Сцена НЕ считает физику и время: позы приходят из motion.js через
//  poseProvider(t), координаты тел — из worldcoords.js через bodyProvider(t).
//
//  Публичный контракт:
//    const scene = createScene({ root, layers, clock });
//    scene.addBody({ id, kind, el, radiusPx, pos: (t) => ({x,y}) });
//    scene.addShip({ id, kind, el, radiusPx, pose: (t) => ({x,y,ang,phase}) });
//    scene.setCamera({ x, y, scale, rotX, rotZ });
//    scene.tick(nowMs);              // один раз на кадр
//    scene.hitTest(cx, cy);          // экранные координаты -> объект
//    scene.on('click', ({hit, event}) => {});
//    scene.on('dblclick', ({hit, event}) => {});
// ============================================================================
(function (global) {
    'use strict';

    const PRIORITY = { planet: 1, moon: 2, ship: 3 };
    const DOUBLE_MS = 520;
    const DOUBLE_PX = 60;

    function createScene(opts) {
        const options = opts || {};
        const root = options.root;
        const layers = options.layers || {};
        const clock = options.clock || function () { return Date.now(); };

        const bodies = new Map();     // id -> body record
        const ships = new Map();      // id -> ship record
        const cam = { x: 0, y: 0, scale: 1, rotX: 0, rotZ: 0 };

        const handlers = { click: [], dblclick: [] };
        let tapPrev = null;
        let lastTickMs = 0;
        let frames = 0;
        let tickMsAvg = 0;

        // ---------- ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ ПОЗИЦИИ ----------
        // Никакой другой код не должен писать transform/left/top маркерам.
        function applyPose(rec, pose, visible) {
            const el = rec.el;
            if (!el || !el.style) return;
            if (!visible) {
                if (rec.hidden !== true) { el.style.display = 'none'; rec.hidden = true; }
                return;
            }
            if (rec.hidden) { el.style.display = ''; rec.hidden = false; }

            const depth = 1 + Math.max(-0.12, Math.min(0.12, pose.y / 2600));
            const rotate = pose.ang === undefined ? 0 : pose.ang;
            const s = (rec.scale || 1) * depth;
            const shiftY = pose.shiftY ? ' translate(0,' + pose.shiftY + 'px)' : '';
            el.style.transform =
                'translate(' + pose.x.toFixed(1) + 'px,' + pose.y.toFixed(1) + 'px)' +
                ' translate(-50%,-50%)' + shiftY +
                (rotate ? ' rotate(' + rotate.toFixed(1) + 'deg)' : '') +
                (Math.abs(s - 1) > 0.001 ? ' scale(' + s.toFixed(2) + ')' : '');
            if (pose.opacity !== undefined) el.style.opacity = String(pose.opacity);

            // кэш экранных координат для hitTest
            rec.sx = pose.x; rec.sy = pose.y;
            rec.sr = rec.radiusPx || 8;
            rec.visible = true;
        }

        // ---------- ВЫБОР ПОПАДАНИЯ ----------
        // Чистая функция: планета > луна > корабль; при равном приоритете — ближе.
        function chooseHit(list) {
            if (!list || !list.length) return null;
            const sorted = list.slice().sort(function (a, b) {
                const pa = PRIORITY[a.kind] || 9, pb = PRIORITY[b.kind] || 9;
                if (pa !== pb) return pa - pb;
                return a.d - b.d;
            });
            return sorted[0];
        }

        // ---------- РЕГИСТРАЦИЯ ----------
        function addBody(rec) {
            if (!rec || !rec.id) throw new Error('addBody: нужен id');
            bodies.set(rec.id, rec);
            return rec;
        }

        function addShip(rec) {
            if (!rec || !rec.id) throw new Error('addShip: нужен id');
            ships.set(rec.id, rec);
            return rec;
        }

        function removeShip(id) { ships.delete(id); }

        function setCamera(next) {
            if (!next) return cam;
            if (typeof next.x === 'number') cam.x = next.x;
            if (typeof next.y === 'number') cam.y = next.y;
            if (typeof next.scale === 'number') cam.scale = next.scale;
            if (typeof next.rotX === 'number') cam.rotX = next.rotX;
            if (typeof next.rotZ === 'number') cam.rotZ = next.rotZ;
            applyCamera();
            return cam;
        }

        function applyCamera() {
            if (!root || !root.style) return;
            root.style.transform =
                'translate(' + cam.x.toFixed(1) + 'px,' + cam.y.toFixed(1) + 'px)' +
                ' scale(' + cam.scale.toFixed(4) + ')' +
                ' rotateX(' + cam.rotX.toFixed(2) + 'deg)' +
                ' rotateZ(' + cam.rotZ.toFixed(2) + 'deg)';
        }

        // ---------- ОДИН КАДР ----------
        function tick(nowMs) {
            const t0 = clock();
            const t = typeof nowMs === 'number' ? nowMs : clock();

            bodies.forEach(function (rec) {
                if (typeof rec.pos !== 'function') return;
                let p;
                try { p = rec.pos(t); } catch (e) { p = null; }
                applyPose(rec, p || { x: 0, y: 0 }, !!p);
            });

            ships.forEach(function (rec) {
                if (typeof rec.pose !== 'function') return;
                let p;
                try { p = rec.pose(t); } catch (e) { p = null; }
                applyPose(rec, p || { x: 0, y: 0 }, !!p);
            });

            const dt = clock() - t0;
            tickMsAvg = tickMsAvg ? tickMsAvg * 0.9 + dt * 0.1 : dt;
            frames++;
            lastTickMs = t;
            return tickMsAvg;
        }

        // ---------- ПОПАДАНИЕ ----------
        // Экранные координаты: центр сцены = root, плюс сдвиг камеры.
        function toSceneCoords(cx, cy) {
            const rect = root && root.getBoundingClientRect
                ? root.getBoundingClientRect()
                : { left: 0, top: 0, width: 0, height: 0 };
            const ox = rect.left + rect.width / 2;
            const oy = rect.top + rect.height / 2;
            // упрощённая обратная матрица: без поворотов, только масштаб и сдвиг
            return {
                x: (cx - ox - cam.x) / (cam.scale || 1),
                y: (cy - oy - cam.y) / (cam.scale || 1)
            };
        }

        function hitTest(cx, cy) {
            const pt = toSceneCoords(cx, cy);
            const found = [];
            bodies.forEach(function (rec) {
                if (!rec.visible) return;
                const d = Math.hypot(pt.x - rec.sx, pt.y - rec.sy);
                const r = (rec.sr || 8) + (rec.kind === 'planet' ? 6 : 3);
                if (d <= r) found.push({ rec: rec, d: d, kind: rec.kind || 'body' });
            });
            ships.forEach(function (rec) {
                if (!rec.visible) return;
                const d = Math.hypot(pt.x - rec.sx, pt.y - rec.sy);
                const r = (rec.sr || 10) + 4;
                if (d <= r) found.push({ rec: rec, d: d, kind: 'ship' });
            });
            if (!found.length) return null;
            const top = chooseHit(found);
            return {
                kind: top.kind,
                id: top.rec.id,
                ref: top.rec,
                distance: top.d,
                // список всех попаданий — для отладки и «нижних» обработчиков
                all: found.map(function (f) { return { kind: f.kind, id: f.rec.id }; })
            };
        }

        // ---------- СОБЫТИЯ ----------
        function on(type, cb) {
            if (!handlers[type]) handlers[type] = [];
            handlers[type].push(cb);
            return function () {
                const i = handlers[type].indexOf(cb);
                if (i >= 0) handlers[type].splice(i, 1);
            };
        }

        function emit(type, payload) {
            (handlers[type] || []).forEach(function (cb) {
                try { cb(payload); } catch (e) { console.error('scene handler:', e); }
            });
        }

        function handlePointer(x, y, event) {
            const hit = hitTest(x, y);
            const now = clock();
            const prev = tapPrev;
            tapPrev = hit ? { t: now, kind: hit.kind, id: hit.id, x: x, y: y } : null;

            if (prev && hit && prev.id === hit.id && prev.kind === hit.kind &&
                now - prev.t <= DOUBLE_MS &&
                Math.hypot(x - prev.x, y - prev.y) <= DOUBLE_PX) {
                tapPrev = null;
                emit('dblclick', { hit: hit, event: event, x: x, y: y });
                return;
            }
            emit('click', { hit: hit, event: event, x: x, y: y });
        }

        // ---------- ЕДИНСТВЕННЫЙ ЦИКЛ ----------
        // Модуль сам владеет requestAnimationFrame: сцена не должна зависеть
        // от чужого animate(). onFrame(ms) вызывается до tick.
        let rafId = null;
        function start(onFrame) {
            if (rafId !== null) return rafId;
            const step = function (ms) {
                if (typeof onFrame === 'function') onFrame(ms);
                tick(ms);
                rafId = global.requestAnimationFrame
                    ? global.requestAnimationFrame(step)
                    : setTimeout(function () { step(Date.now()); }, 16);
            };
            rafId = global.requestAnimationFrame
                ? global.requestAnimationFrame(step)
                : setTimeout(function () { step(Date.now()); }, 16);
            return rafId;
        }

        function stop() {
            if (rafId === null) return;
            if (global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
            else clearTimeout(rafId);
            rafId = null;
        }

        function stats() {
            return {
                bodies: bodies.size,
                ships: ships.size,
                frames: frames,
                tickMs: Number(tickMsAvg.toFixed(2)),
                camera: Object.assign({}, cam)
            };
        }

        return {
            addBody: addBody,
            addShip: addShip,
            removeShip: removeShip,
            setCamera: setCamera,
            getCamera: function () { return Object.assign({}, cam); },
            tick: tick,
            start: start,
            stop: stop,
            hitTest: hitTest,
            handlePointer: handlePointer,
            on: on,
            stats: stats,
            applyPose: applyPose,     // экспортируем для тестов «один писатель»
            chooseHit: chooseHit,
            PRIORITY: PRIORITY
        };
    }

    const api = { createScene: createScene };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.SceneKit = api;
})(typeof window !== 'undefined' ? window : globalThis);
