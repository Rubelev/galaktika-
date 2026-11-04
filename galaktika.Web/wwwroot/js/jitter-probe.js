// ============================================================================
//  JITTER-PROBE.JS — измерение «дрожания» тел на карте (?jitter=1).
//  Каждый кадр снимаем позиции тел и считаем:
//    • шаг между кадрами (px) — средний и максимальный;
//    • сколько раз менялось направление (дрожание = частые реверсы);
//    • итоговый балл: 0 — ровно, > 1 — дёргается.
//  Результат пишется в #jitter-report (JSON) и в title — агенту достаточно
//  снять DOM-дамп, чтобы получить числа.
// ============================================================================
(function (global) {
    'use strict';
    const params = new URLSearchParams(location.search);
    if (!params.has('jitter')) return;

    const DURATION_MS = Number(params.get('jitter')) > 1000 ? Number(params.get('jitter')) : 6000;
    const samples = new Map();   // id → { prev: {x,y}, deltas: [], flips: number, max: number }

    // Позиция через getBoundingClientRect: не зависит от того, transform это,
    // left/top или CSS-матрица — раньше зонд ловил только транслейты и терял планеты
    function posOf(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function parseTranslate(el) {
        const t = el.style && el.style.transform || '';
        const m = t.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/);
        if (!m) {
            const m2 = t.match(/translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/);
            if (!m2) return null;
            return { x: Number(m2[1]), y: Number(m2[2]) };
        }
        return { x: Number(m[1]), y: Number(m[2]) };
    }

    function collect() {
        const onlyPlanets = (new URLSearchParams(location.search).get('bodies') || '') === 'planets';
        const sel = onlyPlanets
            ? '.planet[data-planet-id], .cat-body[data-planet-id], .moon'
            : '.planet[data-planet-id], .cat-body[data-planet-id], .moon, .ship-marker';
        const nodes = document.querySelectorAll(sel);
        nodes.forEach(function (el) {
            const id = el.getAttribute('data-planet-id') || el.getAttribute('data-ship') || el.getAttribute('data-moon') || 'ship';
            const p = posOf(el);
            if (!p) return;
            let s = samples.get(id);
            if (!s) { s = { prev: p, deltas: [], acc: [], flips: 0, max: 0, lastVec: null }; samples.set(id, s); return; }
            const dx = p.x - s.prev.x, dy = p.y - s.prev.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.2) {
                // вторая разность: у плавного движения она близка к нулю,
                // у дрожания — сравнима с самим шагом
                if (s.lastVec) {
                    const ax = dx - s.lastVec.x, ay = dy - s.lastVec.y;
                    s.acc.push(Math.hypot(ax, ay));
                }
                s.lastVec = { x: dx, y: dy };
                s.deltas.push(d);
                if (d > s.max) s.max = d;
            }
            s.prev = p;
        });
    }

    let t0 = performance.now();
    const timer = setInterval(collect, 16);

    setTimeout(function () {
        clearInterval(timer);
        const rows = [];
        const lowData = [];
        samples.forEach(function (s, id) {
            // МАЛО КАДРОВ — НЕ ОЦЕНИВАЕМ: при 1–2 кадрах score получается
            // ложным (headless даёт 1,3 кадра/с). Такие тела идут в «мало данных».
            if (s.deltas.length < 10) { lowData.push(id); return; }
            const avg = s.deltas.reduce(function (a, b) { return a + b; }, 0) / s.deltas.length;
            // балл: реверсы на кадр + скачки больше 3× среднего
            const accAvg = s.acc.length ? s.acc.reduce(function (a, b) { return a + b; }, 0) / s.acc.length : 0;
            // 0 — ровное движение; > 1 — тело «дёргается»
            const score = avg > 0 ? accAvg / avg : 0;
            rows.push({
                id: id, frames: s.deltas.length,
                avgPx: +avg.toFixed(3), maxPx: +s.max.toFixed(3),
                accPx: +accAvg.toFixed(3), score: +score.toFixed(2)
            });
        });
        rows.sort(function (a, b) { return b.score - a.score; });
        const worst = rows[0] || null;
        const report = {
            url: location.search,
            bodies: rows.length,
            worst: worst,
            wobbling: rows.filter(function (r) { return r.score > 1; }).length,
            lowData: lowData.length,
            rows: rows.slice(0, 12)
        };

        const box = document.createElement('div');
        box.id = 'jitter-report';
        box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100009;max-width:520px;' +
            'padding:8px 10px;border-radius:8px;background:rgba(8,14,24,.92);border:1px solid rgba(255,209,102,.4);' +
            'color:#e8eef8;font:10px/1.45 ui-monospace,monospace;white-space:pre-wrap';
        box.textContent = 'JITTER тел: ' + report.bodies + ' · дёргаются: ' + report.wobbling +
            ' · мало данных: ' + report.lowData +
            '\n' + (worst ? ('худший ' + worst.id + ' score=' + worst.score + ' avg=' + worst.avgPx +
            'px max=' + worst.maxPx + 'px acc=' + worst.accPx) : 'нет данных') +
            '\n' + JSON.stringify(report.rows.slice(0, 5));
        document.body.appendChild(box);
        document.title = 'JITTER worst=' + (worst ? worst.id + ':' + worst.score : '-') +
            ' wobble=' + report.wobbling + '/' + report.bodies + ' low=' + report.lowData;
        global.__jitterReport = report;
    }, DURATION_MS);

    global.JitterProbe = { samples: samples };
})(typeof window !== 'undefined' ? window : globalThis);
