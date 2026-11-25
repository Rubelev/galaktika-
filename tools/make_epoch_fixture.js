// Эталон позиций Кеплера для сверки JS↔PHP после перевода эпохи на J2000.
// 12 значений a × 5 моментов времени + вырожденные случаи (C-05).
// Запуск: node galaktika/tools/make_epoch_fixture.js
'use strict';
const fs = require('fs');
const path = require('path');
const K = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'orbit-kepler.js'));

// 12 больших полуосей: от Меркурия до Седны и дальше
const AUS = [0.387, 0.723, 1.0, 1.524, 2.767, 5.203, 9.537, 19.191, 30.069, 39.482, 100.0, 506.0];
// 5 моментов: J2000, 2001, 2026, 2226, 1900 — фиксированные, чтобы фикстура была воспроизводимой
const TIMES = [946728000000, 978307200000, 1790000000000, 7000000000000, -2208988800000];

// P = 365.25·a^1.5 (третий закон Кеплера) — орбиты физически согласованы
const orbits = AUS.map(function (a, i) {
    return {
        id: 'a' + (i + 1),
        a: a,
        e: 0.2056,
        i: 7.0,
        om: 48.33,
        w: 29.12,
        M0: 252.25084,
        P: 365.25 * Math.pow(a, 1.5)
    };
});

const out = { orbits: orbits, times: TIMES, expected: {}, boundaries: [] };
orbits.forEach(function (o) {
    out.expected[o.id] = TIMES.map(function (t) {
        const p = K.position(o, t);
        return { x: p.x, y: p.y, z: p.z, r: p.r };
    });
});

// Вырожденные входы: JS обязан вернуть конечный ноль, PHP — то же самое.
out.boundaries = [
    { name: 'a=0', orbit: Object.assign({}, orbits[0], { a: 0 }), time: TIMES[0], expect: 'zero' },
    { name: 'a<0', orbit: Object.assign({}, orbits[0], { a: -1 }), time: TIMES[0], expect: 'zero' },
    { name: 'timeMs=NaN', orbit: orbits[0], time: 'NaN', expect: 'zero' },
    { name: 'timeMs=Infinity', orbit: orbits[0], time: 'Infinity', expect: 'zero' }
];
out.boundaries.forEach(function (b) {
    const t = (b.time === 'NaN') ? NaN : (b.time === 'Infinity' ? Infinity : b.time);
    const p = K.position(b.orbit, t);
    b.expected = { x: p.x, y: p.y, z: p.z, r: p.r, finite: isFinite(p.x) && isFinite(p.y) && isFinite(p.z) && isFinite(p.r) };
});

const outPath = path.join(__dirname, '..', 'reports', 'epoch_fixture.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('эталон эпохи:', orbits.length, 'орбит ×', TIMES.length, 'моментов +', out.boundaries.length, 'границы');
console.log('EPOCH_MS =', K.EPOCH_MS, '| DAY_MS =', K.DAY_MS);
