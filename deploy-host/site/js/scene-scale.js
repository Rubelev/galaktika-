// ============================================================================
//  SCENE-SCALE.JS — ЕДИНАЯ шкала сцены (а.е. → px).
//  Раньше таблица и функция дублировались в solar.js и worldcoords.js:
//  правка в одном месте не доходила до карты (так «потерялся» Плутон).
//  Теперь обе стороны берут значение отсюда.
// ============================================================================
(function (global) {
    'use strict';

    const TABLE = [
        [0.387, 118], [0.723, 150], [1, 185], [1.524, 228], [2.1, 245], [3.3, 300],
        [5.203, 330], [9.537, 400], [19.191, 480], [30.069, 560], [39.482, 620]
    ];

    function orbitPx(au) {
        const a = Number(au);
        if (!isFinite(a) || a <= 0) return 0;
        const t = TABLE;
        if (a <= t[0][0]) return t[0][1] * (a / t[0][0]);
        for (let i = 1; i < t.length; i++) {
            if (a <= t[i][0]) {
                const a0 = t[i - 1][0], r0 = t[i - 1][1], a1 = t[i][0], r1 = t[i][1];
                return r0 + (r1 - r0) * (a - a0) / (a1 - a0);
            }
        }
        // за последней точкой — логарифм (линейная экстраполяция выбрасывала
        // Плутон и Седну за кадр)
        const n = t.length;
        const aLast = t[n - 1][0], rLast = t[n - 1][1];
        return rLast + rLast * 0.16 * Math.log(a / aLast);
    }

    global.SceneScale = { TABLE: TABLE, orbitPx: orbitPx };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.SceneScale;
})(typeof window !== 'undefined' ? window : globalThis);