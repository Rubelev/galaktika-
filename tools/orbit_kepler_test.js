// Тесты параметрической орбиты (Кеплер): планета и линия — одна кривая.
// Запуск: node galaktika/tools/orbit_kepler_test.js
'use strict';
const path = require('path');
const K = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'orbit-kepler.js'));

const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

// 1) круговая орбита: |r| постоянен
const circ = { a: 1, e: 0, i: 0, om: 0, w: 0, M0: 0, P: 365.25 };
let rmin = 1e9, rmax = 0;
for (let d = 0; d < 365; d += 7) {
    const p = K.position(circ, d * 86400000);
    const r = Math.hypot(p.x, p.y, p.z);
    rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
}
check('круговая: радиус постоянен', rmax - rmin < 1e-9, `${rmin.toFixed(6)}..${rmax.toFixed(6)}`);

// 2) эллипс: r = a(1-e²)/(1+e·cos ν)
const ell = { a: 1.524, e: 0.0934, i: 1.85, om: 49.6, w: 286.5, M0: 355, P: 687 };
let worst = 0;
for (let d = 0; d < 687; d += 11) {
    const p = K.position(ell, d * 86400000);
    const expected = ell.a * (1 - ell.e * ell.e) / (1 + ell.e * Math.cos(p.nu));
    worst = Math.max(worst, Math.abs(p.r - expected));
}
check('эллипс: r по формуле коники', worst < 1e-9, 'макс Δ ' + worst.toExponential(2));

// 3) перицентр и апоцентр
let rp = 1e9, ra = 0;
for (let d = 0; d < 687; d += 3) {
    const p = K.position(ell, d * 86400000);
    rp = Math.min(rp, p.r); ra = Math.max(ra, p.r);
}
check('перицентр ≈ a(1-e)', Math.abs(rp - ell.a * (1 - ell.e)) < 1e-3, rp.toFixed(6));
check('апоцентр ≈ a(1+e)', Math.abs(ra - ell.a * (1 + ell.e)) < 1e-3, ra.toFixed(6));

// 4) период: через P суток та же точка
const p0 = K.position(ell, 0);
const p1 = K.position(ell, 687 * 86400000);
check('периодичность', Math.hypot(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z) < 1e-9,
    'Δ ' + Math.hypot(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z).toExponential(2));

// 5) наклонение даёт z
const inc = Object.assign({}, circ, { i: 60 });
const pi = K.position(inc, 90 * 86400000);
check('наклонение создаёт z', Math.abs(pi.z) > 0.1, 'z=' + pi.z.toFixed(3));

// 6) путь замкнут и точки лежат на орбите
const pts = K.path(ell, 96);
check('путь замкнут', pts.length === 97 &&
    Math.hypot(pts[0].x - pts[96].x, pts[0].y - pts[96].y, pts[0].z - pts[96].z) < 1e-9,
    pts.length + ' точек');
// проверяем через E: для каждой точки путь строится по E, r должен совпасть
let maxDev = 0;
for (let k = 0; k <= 96; k++) {
    const E = (k / 96) * Math.PI * 2;
    const nu = Math.atan2(Math.sqrt(1 - ell.e * ell.e) * Math.sin(E), Math.cos(E) - ell.e);
    const expected = ell.a * (1 - ell.e * ell.e) / (1 + ell.e * Math.cos(nu));
    const q = pts[k];
    maxDev = Math.max(maxDev, Math.abs(Math.hypot(q.x, q.y, q.z) - expected));
}
check('точки пути на орбите', maxDev < 1e-6, 'Δ ' + maxDev.toExponential(2));

// 7) Меркурий из каталога: a=0.387, e=0.2056
const merc = { a: 0.387, e: 0.2056, i: 7.0, om: 48.3, w: 29.1, M0: 0, P: 87.97 };
let mr = 1e9, mR = 0;
for (let d = 0; d < 88; d += 2) { const p = K.position(merc, d * 86400000); mr = Math.min(mr, p.r); mR = Math.max(mR, p.r); }
check('Меркурий: r 0.31..0.47 а.е.', mr > 0.30 && mR < 0.47, mr.toFixed(3) + '..' + mR.toFixed(3));

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
