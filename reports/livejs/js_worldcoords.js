// ============================================================================
//  СВЯЗИ: что править вместе с этим файлом
//  ---------------------------------------------------------------------------
//  Координаты мира: эпоха J2000, орбитальная шкала, позиции планет.
//
//   1) js/motion.js — ТА ЖЕ орбитальная шкала (ORBIT_SCALE) и эпоха.
//      Меняешь шкалу здесь — меняй и там, иначе планеты и корабли разъедутся.
//   2) js/solar.js — берёт позиции планет только отсюда (planetAt);
//      не дублируй расчёт орбит на месте.
//   3) tools/verify_math.js — проверяет orbitPx(1 а.е.) === 185 px
//      и монотонность шкалы.
//   4) html-шаблоны — тег <script src="js/worldcoords.js?v=N">, поднимай N.
// ============================================================================

// Единая система координат «Галактики» (WORLD).
// Позиция любого объекта вычисляется из времени и орбитальных элементов.
// Подробности — galaktika/docs/coords-system.md
(function () {
    'use strict';

    // Шкала «а.е. -> пиксели». Одна на всю сцену: планеты, пояс, корабли.
    const ORBIT_SCALE = [
        [0.387, 118], [0.723, 150], [1.000, 185], [1.524, 228], [2.100, 245],
        [3.300, 300], [5.203, 330], [9.537, 400], [19.191, 480], [30.069, 560], [39.482, 620]
    ];

    const EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);   // J2000
    const DAY_MS = 86400000;

    // Орбитальные элементы: a (а.е.), e, период (сут), эпоха (град), размер (px)
    const PLANETS = {
        mercury: { a: 0.387, e: 0.2056, period: 87.97, epoch: 252.25, size: 8 },
        venus:   { a: 0.723, e: 0.0068, period: 224.70, epoch: 181.98, size: 12 },
        earth:   { a: 1.000, e: 0.0167, period: 365.26, epoch: 100.46, size: 14 },
        mars:    { a: 1.524, e: 0.0934, period: 686.98, epoch: 355.45, size: 11 },
        ceres:   { a: 2.767, e: 0.0758, period: 1681.6, epoch: 95.99, size: 7 },
        jupiter: { a: 5.203, e: 0.0484, period: 4332.6, epoch: 34.40, size: 26 },
        saturn:  { a: 9.537, e: 0.0542, period: 10759, epoch: 49.94, size: 22 },
        uranus:  { a: 19.191, e: 0.0472, period: 30689, epoch: 313.23, size: 16 },
        neptune: { a: 30.069, e: 0.0086, period: 60182, epoch: 304.88, size: 15 }
    };

    function orbitRadius(au) {
        const t = ORBIT_SCALE;
        if (au <= t[0][0]) return t[0][1] * (au / t[0][0]);
        for (let i = 1; i < t.length; i++) {
            if (au <= t[i][0]) {
                const a0 = t[i - 1][0], r0 = t[i - 1][1], a1 = t[i][0], r1 = t[i][1];
                return r0 + (r1 - r0) * (au - a0) / (a1 - a0);
            }
        }
        return t[t.length - 1][1];
    }

    // Позиция планеты в WORLD на момент времени timeMs
    function planetAt(id, timeMs) {
        const p = PLANETS[id];
        if (!p) return null;
        const days = (timeMs - EPOCH_MS) / DAY_MS;
        const M = ((p.epoch + (days / p.period) * 360) % 360) * Math.PI / 180;
        // уравнение центра (первое приближение) — эллипс, а не окружность
        const nu = M + (2 * p.e - 0.25 * p.e * p.e * p.e) * Math.sin(M)
                     + 1.25 * p.e * p.e * Math.sin(2 * M);
        const r = p.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(nu));
        const rPx = orbitRadius(r);
        return {
            id: id,
            x: Math.cos(nu) * rPx,
            y: Math.sin(nu) * rPx,
            size: p.size,
            au: r,
            angleDeg: ((nu * 180 / Math.PI) % 360 + 360) % 360
        };
    }

    function planetsAt(timeMs) {
        const out = {};
        for (const id in PLANETS) out[id] = planetAt(id, timeMs);
        return out;
    }

    // Позиция на трассе: t = 0 — старт, 1 — финиш (квадратичная кривая)
    function routeAt(timeMs, fromId, toId, t, departMs, durMs) {
        const A = planetAt(fromId, timeMs);
        const B = planetAt(toId, timeMs);
        if (!A || !B) return null;
        const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
        const nx = dy / len, ny = -dx / len;
        const midX = (A.x + B.x) / 2, midY = (A.y + B.y) / 2;
        const side = (nx * midX + ny * midY) >= 0 ? 1 : -1;
        let bulge = Math.min(46, Math.max(10, len * 0.12)) * side;
        const dLine = Math.abs(A.x * B.y - B.x * A.y) / len;
        if (dLine < 135) bulge = Math.min(70, Math.max(Math.abs(bulge), 135 - dLine + 25)) * side;
        const cp = { x: midX + nx * bulge, y: midY + ny * bulge };
        const u = 1 - t;
        return {
            x: u * u * A.x + 2 * u * t * cp.x + t * t * B.x,
            y: u * u * A.y + 2 * u * t * cp.y + t * t * B.y,
            from: A, to: B, cp: cp, len: len,
            t: t, startedAt: departMs, duration: durMs
        };
    }

    // Адрес астероида пояса — детерминированный
    function beltAddress(index, angleDeg) {
        const sector = Math.floor(((angleDeg % 360) + 360) % 360 / 15) + 1;
        return 'ПОЯС-' + String(sector).padStart(2, '0') + '-' + String((index % 997) + 1).padStart(3, '0');
    }

    // Преобразование камеры WORLD -> SCREEN (порядок: scale, tilt, spin, pan)
    function toScreen(p, cam, viewport) {
        const s = cam.scale || 1;
        const tilt = (cam.tiltDeg || 0) * Math.PI / 180;
        const spin = (cam.spinDeg || 0) * Math.PI / 180;
        let x = p.x * s, y = p.y * s;
        let y1 = y * Math.cos(tilt);
        let x2 = x * Math.cos(spin) - y1 * Math.sin(spin);
        let y2 = x * Math.sin(spin) + y1 * Math.cos(spin);
        return {
            x: viewport.width / 2 + x2 + (cam.panX || 0),
            y: viewport.height / 2 + y2 + (cam.panY || 0)
        };
    }

    // Обратное преобразование: клик -> WORLD
    function fromScreen(pt, cam, viewport) {
        const s = cam.scale || 1;
        const tilt = (cam.tiltDeg || 0) * Math.PI / 180;
        const spin = (cam.spinDeg || 0) * Math.PI / 180;
        let x2 = pt.x - viewport.width / 2 - (cam.panX || 0);
        let y2 = pt.y - viewport.height / 2 - (cam.panY || 0);
        let x1 = x2 * Math.cos(-spin) - y2 * Math.sin(-spin);
        let y1 = x2 * Math.sin(-spin) + y2 * Math.cos(-spin);
        const y = y1 / Math.max(0.05, Math.cos(tilt));
        return { x: x1 / s, y: y / s };
    }

    window.WorldCoords = {
        ORBIT_SCALE: ORBIT_SCALE,
        PLANETS: PLANETS,
        EPOCH_MS: EPOCH_MS,
        DAY_MS: DAY_MS,
        orbitRadius: orbitRadius,
        at: function (timeMs) {
            return {
                planet: function (id) { return planetAt(id, timeMs); },
                planets: function () { return planetsAt(timeMs); },
                route: function (from, to, t, departMs, durMs) {
                    return routeAt(timeMs, from, to, t, departMs, durMs);
                }
            };
        },
        planetAt: planetAt,
        planetsAt: planetsAt,
        routeAt: routeAt,
        beltAddress: beltAddress,
        toScreen: toScreen,
        fromScreen: fromScreen,
        selfTest: function () {
            const now = Date.now();
            const rows = [];
            for (const id in PLANETS) {
                const p = planetAt(id, now);
                rows.push(id + ': ' + p.x.toFixed(0) + ',' + p.y.toFixed(0) +
                          ' (' + p.au.toFixed(2) + ' а.е., ' + p.angleDeg.toFixed(0) + '°)');
            }
            return rows.join(' | ');
        }
    };
})();
