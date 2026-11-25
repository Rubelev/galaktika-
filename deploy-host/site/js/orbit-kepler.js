// ============================================================================
//  ORBIT-KEPLER.JS — орбита планеты как ПАРАМЕТРИЧЕСКАЯ КРИВАЯ в 3D.
//
//  Задаёшь параметры орбиты — и планета с орбитой существуют ровно так:
//    a   — большая полуось (а.е.)
//    e   — эксцентриситет (0..0.9)
//    i   — наклонение к эклиптике (град)
//    om  — долгота восходящего узла Ω (град)
//    w   — аргумент перицентра ω (град)
//    M0  — средняя аномалия на эпоху (град)
//    P   — период обращения (сут)
//
//  Позиция считается по уравнению Кеплера, а не по кругу. Орбита рисуется
//  как та же кривая, сэмплированная по эксцентрической аномалии — поэтому
//  линия и планета совпадают по построению.
// ============================================================================
(function (global) {
    'use strict';
    const DEG = Math.PI / 180;

    // ЭПОХА: m0 в каталоге задан на J2000 (2000-01-01 12:00 UT), поэтому дни
    // считаются от неё, а не от 1970. Раньше `timeMs / 86400000` давало дни от
    // Unix-эпохи и фаза планеты уезжала от каталога (Меркурий — до 201°).
    const EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
    const DAY_MS = 86400000;

    // ГРАНИЦА: на вырожденный вход (нет тела, a<=0, NaN-время) отдаём нулевую
    // позицию, а не NaN — рендерер не должен получать NaN-координаты.
    function zeroPosition() {
        return { x: 0, y: 0, z: 0, r: 0, E: 0, M: 0, nu: 0, invalid: true };
    }

    // Решение уравнения Кеплера M = E - e·sin(E) методом Ньютона
    function solveKepler(M, e) {
        let E = M;
        for (let i = 0; i < 8; i++) {
            const f = E - e * Math.sin(E) - M;
            const fp = 1 - e * Math.cos(E);
            E -= f / fp;
            if (Math.abs(f) < 1e-10) break;
        }
        return E;
    }

    // Позиция в плоскости орбиты → затем поворот в 3D по Ω, i, ω
    function position(orbit, timeMs) {
        const a = Number(orbit && orbit.a);
        const t = Number(timeMs);
        // ГРАНИЦЫ (C-05): a=0/NaN и NaN-время → безопасный ноль, а не NaN/1 а.е.
        if (!isFinite(a) || a <= 0 || !isFinite(t)) return zeroPosition();
        const e = Math.min(0.9, Math.max(0, Number(orbit.e) || 0));
        const P = Math.max(0.001, Number(orbit.P) || 365.25);
        const M0 = (Number(orbit.M0) || 0) * DEG;
        const days = (t - EPOCH_MS) / DAY_MS;
        const M = M0 + (days / P) * Math.PI * 2;
        const E = solveKepler(M, e);

        // в плоскости орбиты
        const xv = a * (Math.cos(E) - e);
        const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);

        const w = (Number(orbit.w) || 0) * DEG;
        const om = (Number(orbit.om) || 0) * DEG;
        const inc = (Number(orbit.i) || 0) * DEG;

        // аргумент перицентра
        const x1 = xv * Math.cos(w) - yv * Math.sin(w);
        const y1 = xv * Math.sin(w) + yv * Math.cos(w);

        // наклонение
        const z2 = y1 * Math.sin(inc);
        const y2 = y1 * Math.cos(inc);

        // узел
        const x = x1 * Math.cos(om) - y2 * Math.sin(om);
        const y = x1 * Math.sin(om) + y2 * Math.cos(om);
        const z = z2;

        return {
            x: x, y: y, z: z,
            r: Math.hypot(x, y, z),
            E: E, M: M,
            // радиус-вектор для проверки: r = a(1-e²)/(1+e·cosν)
            nu: Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e)
        };
    }

    // Сэмплы орбиты для отрисовки (замкнутая кривая)
    function path(orbit, samples) {
        const n = Math.max(16, samples || 96);
        const a = Number(orbit && orbit.a);
        // ГРАНИЦА: у вырожденной орбиты линия — точка в центре (не NaN-полилиния)
        if (!isFinite(a) || a <= 0) return [{ x: 0, y: 0, z: 0 }];
        const e = Math.min(0.9, Math.max(0, Number(orbit.e) || 0));
        const w = (Number(orbit.w) || 0) * DEG;
        const om = (Number(orbit.om) || 0) * DEG;
        const inc = (Number(orbit.i) || 0) * DEG;
        const pts = [];
        for (let k = 0; k <= n; k++) {
            const E = (k / n) * Math.PI * 2;
            const xv = a * (Math.cos(E) - e);
            const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
            const x1 = xv * Math.cos(w) - yv * Math.sin(w);
            const y1 = xv * Math.sin(w) + yv * Math.cos(w);
            const z2 = y1 * Math.sin(inc);
            const y2 = y1 * Math.cos(inc);
            pts.push({
                x: x1 * Math.cos(om) - y2 * Math.sin(om),
                y: x1 * Math.sin(om) + y2 * Math.cos(om),
                z: z2
            });
        }
        return pts;
    }

    global.OrbitKepler = {
        solveKepler: solveKepler,
        position: position,
        path: path,
        EPOCH_MS: EPOCH_MS,
        DAY_MS: DAY_MS,
        defaults: { a: 1, e: 0, i: 0, om: 0, w: 0, M0: 0, P: 365.25 }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.OrbitKepler;
})(typeof window !== 'undefined' ? window : globalThis);
