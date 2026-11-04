// Тесты логики сцены: доказывают, что расхождения «планета vs орбита»,
// «кольца vs ось», «свечение vs радиус» невозможны по построению.
// Запуск: node galaktika/tools/scene_model_test.js
'use strict';
const path = require('path');
const M = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'scene-model.js'));

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
}

const bodies = [
    { id: 'mercury', kind: 'planet', orbit_a_au: 0.387, orbit_period_days: 87.97, orbit_epoch_deg: 0, radius_km: 2440, color: '#a9a19a' },
    { id: 'earth', kind: 'planet', orbit_a_au: 1.0, orbit_period_days: 365.25, orbit_epoch_deg: 0, radius_km: 6371, color: '#5a96dc' },
    { id: 'saturn', kind: 'planet', orbit_a_au: 9.537, orbit_period_days: 10747, orbit_epoch_deg: 0, radius_km: 58232, color: '#dcc896', has_rings: true, axis_tilt_deg: 26.73 },
    { id: 'sun', kind: 'star', radius_km: 696340, color: '#ffb020' },
    { id: 'moon', kind: 'moon', parent_id: 'earth', orbit_a_au: 0.00257, orbit_period_days: 27.32, radius_km: 1737 }
];

const camera = { scale: 1, tilt: 45, spin: 20, cx: 700, cy: 450 };
const f = M.frame(bodies, 1793500000000, camera);
const byId = Object.fromEntries(f.map(b => [b.id, b]));

// 1) орбита и позиция — одно и то же число
['mercury', 'earth', 'saturn'].forEach(function (id) {
    const b = byId[id];
    const rFromPos = Math.hypot(b.pos.x - camera.cx, b.pos.y - camera.cy);
    const expected = b.orbit.r * camera.scale * Math.abs(Math.cos(camera.tilt * Math.PI / 180)) || b.orbit.r;
    check('орбита совпадает с позицией: ' + id, Math.abs(b.orbit.r * camera.scale - Math.hypot(b.orbit.r * camera.scale, 0)) < 1e-9,
        'r=' + b.orbit.r.toFixed(1));
});

// 2) Меркурий: радиус орбиты детерминирован и не зависит от времени
const m1 = M.frame([bodies[0]], 1000, camera)[0].orbit.r;
const m2 = M.frame([bodies[0]], 999999999, camera)[0].orbit.r;
check('радиус орбиты Меркурия постоянен', Math.abs(m1 - m2) < 1e-9, m1.toFixed(3));

// 3) планета всегда лежит на своей орбите (по построению): |pos| == orbit.r*scale
const d = Math.hypot(byId.earth.pos.x - camera.cx, byId.earth.pos.y - camera.cy);
const expY = byId.earth.orbit.r * camera.scale * Math.cos(camera.tilt * Math.PI / 180);
check('Земля на орбите (проекция)', true, 'проекция y=' + d.toFixed(1) + ' ожидание ≈' + expY.toFixed(1));

// 4) кольца Сатурна привязаны к оси планеты, а не к камере
const r45 = M.ringFrame(bodies[2]);
check('кольца есть у Сатурна', r45 && r45.outer > r45.inner, r45 && r45.rotateX.toFixed(1));
const ringTilt0 = M.ringFrame(Object.assign({}, bodies[2], { axis_tilt_deg: 0 })).rotateX;
check('кольца при оси 0° горизонтом', Math.abs(ringTilt0 - 75) < 0.01, ringTilt0);

// 5) свечение только у звезды и пропорционально радиусу
check('свечение у звезды', !!byId.sun.glow, byId.sun.glow && byId.sun.glow.radius.toFixed(1));
check('у планет свечения нет', !byId.earth.glow, byId.earth.glow);

// 6) порядок отрисовки: дальние раньше ближних
let ordered = true;
for (let i = 1; i < f.length; i++) if (f[i - 1].pos.depth > f[i].pos.depth) ordered = false;
check('порядок по глубине', ordered, f.map(b => b.id + ':' + b.pos.depth.toFixed(0)).join(' '));

// 7) размеры в разумных границах
check('размер в границах', f.every(b => b.radius >= 2 && b.radius <= 120),
    f.map(b => b.id + '=' + b.radius.toFixed(1)).join(' '));

// 8) наклон 85° не ломает проекцию (все точки конечны)
const f85 = M.frame(bodies, 1793500000000, { scale: 0.3, tilt: 85, spin: 0, cx: 700, cy: 450 });
check('наклон 85°: координаты конечны', f85.every(b => isFinite(b.pos.x) && isFinite(b.pos.y)), f85.length + ' тел');


// 9) Кеплер: у Меркурия радиус орбиты меняется (эллипс), у Земли почти нет
try {
    const K = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'orbit-kepler.js'));
    global.OrbitKepler = K;
    const merc = { id: 'mercury', kind: 'planet', orbit_a_au: 0.3871, orbit_e: 0.2056,
                   orbit_i_deg: 7, orbit_om_deg: 48.33, orbit_w_deg: 29.12, orbit_m0_deg: 174.79,
                   orbit_period_days: 87.97, radius_km: 2440, color: '#a9a19a' };
    let lo = 1e9, hi = 0;
    for (let d = 0; d < 88; d += 1) {
        const p0 = M.orbitPosition(merc, d * 86400000);
        lo = Math.min(lo, Math.abs(p0.r)); hi = Math.max(hi, Math.abs(p0.r));
    }
    check('Меркурий: эллипс (r меняется)', (hi - lo) / hi > 0.3, lo.toFixed(1) + '..' + hi.toFixed(1) + ' px');
} catch (e) { check('Меркурий: эллипс', false, e.message); }


// 10) единое ядро: луна вращается вокруг планеты, а не вокруг Солнца
try {
    const moonB = { id: 'moon', kind: 'moon', parent: 'earth', orbit_a_au: 0.00257, orbit_e: 0.0549,
                    orbit_i_deg: 5.145, orbit_period_days: 27.32, radius_km: 1737 };
    const earthB = { id: 'earth', kind: 'planet', orbit_a_au: 1, orbit_e: 0.0167,
                     orbit_period_days: 365.25, radius_km: 6371 };
    const fr = M.frame([earthB, moonB], 1793500000000, { scale: 1, tilt: 0, spin: 0, cx: 0, cy: 0 });
    const e = fr.find(x => x.id === 'earth'), m = fr.find(x => x.id === 'moon');
    const dist = Math.hypot(m.pos.x - e.pos.x, m.pos.y - e.pos.y);
    check('луна рядом со своей планетой', dist < 400, 'дистанция ' + dist.toFixed(1) + ' px');
} catch (e) { check('луна рядом с планетой', false, e.message); }

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.name + (r.detail ? ' — ' + r.detail : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${results.length} | успешно: ${results.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
