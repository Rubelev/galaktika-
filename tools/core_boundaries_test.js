// ГРАНИЦЫ ЯДРА (C-05): 6 вырожденных входов должны давать безопасное число,
// а не NaN / TypeError. Запуск: node galaktika/tools/core_boundaries_test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js');

const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

function boot(files, extra) {
    const noop = () => 0;
    const sb = {
        window: {}, console, Math, Date, JSON, isFinite, isNaN, parseFloat, parseInt,
        Number, Object, Array, String, setTimeout: noop, setInterval: noop,
        clearTimeout: noop, clearInterval: noop, requestAnimationFrame: noop,
        performance: { now: () => Date.now() },
        document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] },
        location: { search: '' }
    };
    sb.window = Object.assign(sb, { window: null });
    sb.window.window = sb.window;
    if (extra) Object.assign(sb.window, extra);
    vm.createContext(sb);
    files.forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sb, { filename: f }));
    return sb.window;
}

const allFinite = o => ['x', 'y', 'z', 'r'].every(k => o[k] === undefined || isFinite(o[k]));
const T = 1793500000000;

// --- пуск 1: полный набор, каталог с P=0 ---
const w = boot(['scene-scale.js', 'orbit-kepler.js', 'scene-model.js', 'worldcoords.js'], {
    CATALOG: { bodies: [
        { id: 'pluto', legacy_planet: 1, a: 39.48212, e: 0.2488, i: 17.16, om: 110.3, w: 113.76, m0: 238.92881, P: 0 },
        { id: 'zeroth', legacy_planet: 1, a: 0, e: 0.07, i: 0, om: 0, w: 0, m0: 0, P: 1681 }
    ] }
});
const K = w.OrbitKepler, SM = w.SceneModel, WC = w.WorldCoords;

// 1) a=0
{
    const orbit = { a: 0, e: 0.2, i: 7, om: 48, w: 29, M0: 252, P: 365 };
    const p = K.position(orbit, T);
    const pts = K.path(orbit, 64);
    check('1. a=0 → нулевая позиция, не NaN/1 а.е.',
        allFinite(p) && p.r === 0 && p.x === 0 && p.y === 0 && p.z === 0 &&
        pts.length === 1 && allFinite(pts[0]),
        'r=' + p.r + ' path=' + pts.length + ' точек');
}

// 2) timeMs = NaN
{
    const p = K.position({ a: 1, e: 0.0167, i: 0, om: 0, w: 0, M0: 100, P: 365.25 }, NaN);
    check('2. timeMs=NaN → нулевая позиция', allFinite(p) && p.r === 0,
        'x=' + p.x + ' r=' + p.r);
}

// 3) каталог P=0 / a=0
{
    const p = WC.planetAt('pluto', T);          // P=0 в каталоге
    const z = WC.planetAt('zeroth', T);         // a=0 в каталоге
    const all = WC.planetsAt(T);
    const nan = Object.keys(all).filter(k => !all[k] || !isFinite(all[k].x) || !isFinite(all[k].y));
    check('3. каталог P=0 / a=0 → безопасная позиция', p && z &&
        isFinite(p.x) && isFinite(p.y) && p.invalid && isFinite(z.x) && isFinite(z.y) && nan.length === 0,
        'pluto invalid=' + !!(p && p.invalid) + ' x=' + (p && p.x) + ' | NaN в planetsAt: ' + nan.length);
}

// 5) frame([null])
{
    let threw = null, fr = null, fr2 = null;
    try {
        fr = SM.frame([null], T, { scale: 1, tilt: 0, spin: 0, cx: 0, cy: 0 });
        fr2 = SM.frame([null, { id: 'earth', kind: 'planet', orbit_a_au: 1, orbit_e: 0.0167, orbit_period_days: 365.25 }], T, {});
    } catch (e) { threw = e.constructor.name + ': ' + e.message; }
    const okBodies = fr2 && fr2.length === 1 && fr2.every(b => isFinite(b.pos.x) && isFinite(b.pos.y));
    check('5. frame([null]) → кадр не падает', !threw && fr && fr.length === 0 && okBodies,
        threw ? threw : ('пустой кадр=' + fr.length + ', с телом=' + (fr2 && fr2.length)));
}

// 6) луна без родителя в byId
{
    let threw = null, of = null;
    try {
        of = SM.orbitFrame({ id: 'io', parent: 'jupiter', a: 0.00282, e: 0.0041, i: 0.036, om: 43, w: 84, M0: 10, P: 1.769 },
            T, { io: { id: 'io', parent: 'jupiter' } });
    } catch (e) { threw = e.constructor.name + ': ' + e.message; }
    const ok = of && isFinite(of.pos.x) && isFinite(of.pos.y) && isFinite(of.r) &&
        of.path === null && of.parentMissing === true;
    check('6. луна без родителя в byId → своя точка, не кольцо у центра', !threw && ok,
        threw ? threw : ('x=' + of.pos.x.toFixed(2) + ' y=' + of.pos.y.toFixed(2) + ' path=' + of.path + ' parentMissing=' + of.parentMissing));
}

// --- пуск 2: без scene-scale (раньше — TypeError на пустой таблице) ---
{
    const w2 = boot(['orbit-kepler.js', 'scene-model.js', 'worldcoords.js']);
    let threw = null, rad = null, p = null;
    try {
        rad = w2.WorldCoords.orbitRadius(39.482);
        p = w2.WorldCoords.planetAt('earth', T);
    } catch (e) { threw = e.constructor.name + ': ' + e.message; }
    check('4. нет SceneScale → резервная шкала, не TypeError', !threw &&
        isFinite(rad) && rad > 0 && p && isFinite(p.x) && isFinite(p.y),
        threw ? threw : ('orbitRadius(39.482)=' + (rad && rad.toFixed(1)) + ' px, earth x=' + (p && p.x.toFixed(1))));
}

const failed = res.filter(r => !r.ok);
res.sort((a, b) => a.n.localeCompare(b.n));
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
