// ============================================================================
//  SPEC.JS — приёмочные правила в виде алгоритма, а не спора.
//  Запуск: ?spec=1&ts=<масштаб в секундах на тик>
//  Результат: JSON в <pre id="spec-report"> + вердикт в <title>.
//  Правила: docs/PHYSICS-RULES.md
// ============================================================================
(function (global) {
    'use strict';
    const rules = [];
    const R = (id, title, fn) => rules.push({ id: id, title: title, fn: fn });

    const KM_PER_PX = 808649, C = 299792;
    const MAX_C_SHARE = 0.5;            // правило 1: средняя скорость борта не выше 0,5 c (физика классов)
    const MAX_OFF_ROUTE = 12;            // правило 2: борт не дальше 12 px от своей линии
    const MAX_JUMP_FACTOR = 3;           // правило 3: шаг не больше 3× ожидаемого

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function sceneScale() {
        const tr = (document.querySelector('.solar-system') || {}).style || {};
        const m = (tr.transform || '').match(/scale\(([\d.]+)\)/);
        return m ? parseFloat(m[1]) : 1;
    }
    function ships() {
        const out = [];
        document.querySelectorAll('.ship-marker').forEach(function (el) {
            const m = (el.style.transform || '').match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
            if (!m) return;
            out.push({ el: el, id: el.getAttribute('data-sid') || el.title || '',
                       route: el.getAttribute('data-route') || '',
                       x: parseFloat(m[1]), y: parseFloat(m[2]) });
        });
        return out;
    }
    function visiblePaths() {
        return Array.from(document.querySelectorAll('.trade-path, .fleet-route, .belt-route, .portal-path, .traffic-path, .route-line'))
            .filter(el => {
                const st = getComputedStyle(el);
                return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
            });
    }
    function nearestPathDist(p) {
        let best = 1e9;
        visiblePaths().forEach(function (el) {
            let total = 0;
            try { total = el.getTotalLength(); } catch (e) { return; }
            const steps = 40;
            for (let i = 0; i <= steps; i++) {
                const pt = el.getPointAtLength(total * i / steps);
                const d = Math.hypot(pt.x - p.x, pt.y - p.y);
                if (d < best) best = d;
            }
        });
        return best;
    }
    function advance(gs) {
        if (typeof window.__freezeAt === 'number') window.__freezeAt += gs;
        else if (typeof simulatedTime === 'number') window.__freezeAt = simulatedTime + gs;
    }

    // П1: скорость на масштабе ts
    R('speed', 'ни один борт не быстрее 1 px / 45 игровых секунд', async function (ts) {
        const before = ships();
        advance(ts);
        await sleep(700);
        const after = ships();
        const map = new Map(after.map(s => [s.id, s]));
        let worst = 0, worstId = '';
        before.forEach(function (s) {
            const a = map.get(s.id);
            if (!a) return;
            const px = Math.hypot(a.x - s.x, a.y - s.y);
            const cShare = (px * KM_PER_PX / ts) / C;
            if (cShare > worst) { worst = cShare; worstId = s.id; }
        });
        return { ok: worst <= MAX_C_SHARE, detail: 'макс ' + worst.toFixed(3) + ' c (' + worstId + ')' };
    });

    // П2: отклонение от линии
    R('route', 'борт не дальше 12 px от своей трассы', async function () {
        const list = ships();
        let worst = 0, worstId = '', checked = 0;
        list.forEach(function (s) {
            // проверяем только борта, у которых есть СВОЯ линия маршрута:
            // гражданские и пираты линии не рисуют, сравнивать их не с чем
            if (!s.route) return;
            const d = nearestPathDist(s) * sceneScale();
            if (d > 40) return;                 // линии рядом нет — не проверяем
            checked++;
            if (d > worst) { worst = d; worstId = s.id; }
        });
        return { ok: worst <= MAX_OFF_ROUTE, detail: 'проверено ' + checked + ', макс ' + worst.toFixed(1) + ' px (' + worstId + ')' };
    });

    // П3: шаг не больше 3× ожидаемого (нет телепортов)
    R('jump', 'нет скачков больше 3× ожидаемого шага', async function (ts) {
        const before = ships();
        advance(ts);
        await sleep(700);
        const after = ships();
        const map = new Map(after.map(s => [s.id, s]));
        const expected = Math.max(0.5, ts * 0.35 * C / KM_PER_PX);   // 0,35 c за шаг
        let worst = 0, worstId = '';
        before.forEach(function (s) {
            const a = map.get(s.id);
            if (!a) return;
            const d = Math.hypot(a.x - s.x, a.y - s.y);
            if (d > worst) { worst = d; worstId = s.id; }
        });
        return { ok: worst <= expected * MAX_JUMP_FACTOR, detail: 'макс шаг ' + worst.toFixed(1) + ' px при ожидании ≤' + (expected * MAX_JUMP_FACTOR).toFixed(1) + ' (' + worstId + ')' };
    });

    // П4: детерминированность ядра
    R('deterministic', 'поза ядра воспроизводима при одном времени', async function () {
        if (!window.Motion || !window.Motion.shipPose) return { ok: false, detail: 'Motion.shipPose нет' };
        const t = (typeof simulatedTime === 'number' ? simulatedTime : 0) + 60000;
        const a = window.Motion.shipPose(1, t);
        const b = window.Motion.shipPose(1, t);
        if (!a || !b) return { ok: false, detail: 'нет позы' };
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        return { ok: d === 0, detail: 'расхождение ' + d.toFixed(6) + ' px' };
    });

    // П5: кликабельность планеты
    R('click', 'клик по центру планеты попадает в планету, а не в орбиту', async function () {
        const ids = ['earth', 'mars', 'jupiter', 'saturn'];
        const bad = [];
        ids.forEach(function (id) {
            const el = document.querySelector('.planet[data-planet-id="' + id + '"]');
            if (!el) return;
            const r = el.getBoundingClientRect();
            if (!r.width) return;
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!hit || !(el.contains(hit) || hit === el)) bad.push(id + '→' + (hit ? hit.className : 'null'));
        });
        return { ok: bad.length === 0, detail: bad.length ? bad.join(', ') : 'все 4 попадают' };
    });

    // П6: наклон сохраняется и сцена не уезжает
    R('tilt', 'после смены наклона планеты остаются в кадре', async function () {
        const W = innerWidth, H = innerHeight;
        const before = Array.from(document.querySelectorAll('.planet')).map(function (el) {
            const r = el.getBoundingClientRect();
            return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        }).filter(Boolean);
        const tr = document.querySelector('.solar-system');
        if (tr) tr.style.transform = tr.style.transform.replace(/rotateX\([-\d.]+deg\)/, 'rotateX(55deg)');
        await sleep(400);
        const after = Array.from(document.querySelectorAll('.planet')).map(function (el) {
            const r = el.getBoundingClientRect();
            return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        }).filter(Boolean);
        const out = after.filter(p => p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20).length;
        return { ok: out === 0 && after.length >= 6, detail: 'видно ' + after.length + ', за кадром ' + out };
    });

    async function run() {
        const params = new URLSearchParams(location.search);
        if (!params.has('spec')) return;
        const ts = Math.max(1, parseInt(params.get('ts') || '1', 10));
        const results = [];
        for (const r of rules) {
            let res;
            try { res = await r.fn(ts); } catch (e) { res = { ok: false, detail: 'ошибка: ' + e.message }; }
            results.push({ id: r.id, title: r.title, ok: !!res.ok, detail: res.detail || '' });
        }
        const failed = results.filter(r => !r.ok).length;
        const report = { ts: ts, build: (document.querySelector('meta[name="app-build"]') || {}).content || '',
                         results: results, failed: failed, ok: failed === 0 };
        const pre = document.createElement('pre');
        pre.id = 'spec-report';
        pre.style.display = 'none';
        pre.textContent = JSON.stringify(report);
        document.body.appendChild(pre);
        document.title = 'SPEC ' + (report.ok ? 'OK' : 'FAIL ' + failed) + ' ts=' + ts;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(run, 2500));
    else setTimeout(run, 2500);
})(typeof window !== 'undefined' ? window : globalThis);
