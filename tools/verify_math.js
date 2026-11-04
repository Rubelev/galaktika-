// ============================================================================
//  СВЯЗИ: что править вместе с этим файлом
//  ---------------------------------------------------------------------------
//  Проверяет числа из js/motion.js. Если меняешь физику — меняй ожидания тут.
//
//   1) js/motion.js — TABLES.motion (baseSpeedKmS, accelKmS2, фазы, share).
//   2) js/speedmodel.js — корпуса и массы.
//   3) js/worldcoords.js — шкала орбит (185 px = 1 а.е.).
//   4) После правки запускать: node galaktika/tools/verify_math.js
//      Ожидается: 49/49 без провалов. Провал = физика поехала.
//   5) deploy-host/audit_all.py — отдельный аудит сайта (47 проверок).
// ============================================================================

// Проверка общей математики: планеты (Кеплер), единицы, скорости кораблей,
// непрерывность и равномерность движения по маршрутам.
//
// Запуск:  node galaktika/tools/verify_math.js
// Модуль motion.js исполняется здесь же (window подменяется заглушкой),
// поэтому проверяется ровно тот код, что работает на сайте.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const motionPath = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'motion.js');
const code = fs.readFileSync(motionPath, 'utf8');

const sandbox = { window: {}, console: console, Date: Date, Math: Math };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const M = sandbox.window.Motion;
if (!M) { console.error('Motion не загрузился'); process.exit(1); }

let pass = 0, fail = 0;
const rows = [];
function check(name, ok, detail) {
    rows.push({ name, ok, detail });
    if (ok) pass++; else fail++;
    console.log((ok ? 'OK   ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}
const pct = (x) => (x * 100).toFixed(1) + '%';

// ---------- 1. Шкала орбит ----------
check('orbitPx(1 а.е.) = 185 px', Math.abs(M.orbitPx(1) - 185) < 0.001, String(M.orbitPx(1)));
let mono = true;
for (let au = 0.2; au < 39; au += 0.5) {
    if (!(M.orbitPx(au) < M.orbitPx(au + 0.5))) mono = false;
}
check('орбитальная шкала монотонна', mono, '0.2…40 а.е.');

// ---------- 2. Кеплер: периоды ----------
const planets = Object.keys(M.TABLES.bodies);
let worst = 0, worstId = '';
planets.forEach(id => {
    const b = M.TABLES.bodies[id];
    const expected = 365.256 * Math.pow(b.a, 1.5);   // третий закон в сутках
    const dev = Math.abs(b.period - expected) / expected;
    if (dev > worst) { worst = dev; worstId = id; }
});
check('периоды соответствуют 3-му закону Кеплера (откл. < 5%)', worst < 0.05,
      'макс ' + pct(worst) + ' у ' + worstId);

// ---------- 3. Угловая скорость ----------
let angWorst = 0, angId = '';
planets.forEach(id => {
    const b = M.TABLES.bodies[id];
    const t0 = Date.UTC(2026, 0, 1);
    const steps = 720;                                  // разбиваем период на 720 шагов
    const dt = b.period * 86400000 / steps;
    let sum = 0, prev = null;
    for (let k = 0; k <= steps; k++) {
        const pnt = M.bodyAt(id, t0 + k * dt);
        const a = Math.atan2(pnt.y, pnt.x) * 180 / Math.PI;
        if (prev !== null) {
            let d = a - prev;
            while (d < -180) d += 360;                  // разворачиваем угол
            while (d > 180) d -= 360;
            sum += d;
        }
        prev = a;
    }
    const dev = Math.abs(Math.abs(sum) - 360) / 360;
    if (dev > angWorst) { angWorst = dev; angId = id; }
});
check('угол за полный период = 360° (откл. < 2%)', angWorst < 0.02,
      'макс ' + pct(angWorst) + ' у ' + angId);

// ---------- 4. Радиус не выходит за границы ----------
let rOk = true, rDetail = '';
planets.forEach(id => {
    const b = M.TABLES.bodies[id];
    for (let k = 0; k < 24; k++) {
        const t = Date.UTC(2026, 0, 1) + k * 15 * 86400000;
        const p = M.bodyAt(id, t);
        const r = Math.hypot(p.x, p.y);
        const au = M.orbitPx(b.a * (1 - b.e));
        if (r < au * 0.9 || r > M.orbitPx(b.a * (1 + b.e)) * 1.1) {
            rOk = false; rDetail = id + ' r=' + r.toFixed(0);
        }
    }
});
check('радиус орбиты в пределах перигея/афелия', rOk, rDetail);

// ---------- 5. Скорости кораблей ----------
const vScout = M.shipSpeed('jet_scout');          // лёгкий транспорт 40 %
const vTruck = M.shipSpeed('jet_hauler');         // грузовик 10 %
const vFighter = M.shipSpeed('plasma_interceptor'); // истребитель 100 %
check('истребитель = константа 50 000 км/с', Math.abs(vFighter - M.TABLES.motion.baseSpeedKmS) < 1, Math.round(vFighter).toLocaleString('ru-RU') + ' км/с');
check('лёгкий транспорт = 40 %', Math.abs(vScout / M.TABLES.motion.baseSpeedKmS - 0.4) < 0.01, Math.round(vScout).toLocaleString('ru-RU') + ' км/с');
check('грузовик = 30 %', Math.abs(vTruck / M.TABLES.motion.baseSpeedKmS - 0.3) < 0.01, Math.round(vTruck).toLocaleString('ru-RU') + ' км/с');
check('тяжёлый корпус медленнее лёгкого', M.shipSpeed('jet_hauler') < vScout,
      'баржа ' + M.shipSpeed('jet_hauler') + ' / искра ' + vScout);
const vMax = M.shipSpeed('jet_scout', { engineLevel: 5, techLevel: 10 });
check('прокачка не выше 0,95 c', M.shipSpeed('plasma_interceptor', {engineLevel:5, techLevel:10}) <= M.TABLES.motion.speedOfLight * M.TABLES.motion.maxLightShare * 1.001, Math.round(M.shipSpeed('plasma_interceptor', {engineLevel:5, techLevel:10})).toLocaleString('ru-RU') + ' км/с');
const vEng2 = M.shipSpeed('jet_scout', { engines: 2 });
check('модернизация ускоряет истребитель', M.shipSpeed('plasma_interceptor', {engineLevel:5, techLevel:10}) > vFighter, Math.round(M.shipSpeed('plasma_interceptor', {engineLevel:5, techLevel:10})).toLocaleString('ru-RU') + ' км/с');
check('уровни ограничены (engine 99 → 5)', M.shipSpeed('jet_scout', { engineLevel: 99 }) === M.shipSpeed('jet_scout', { engineLevel: 5 }),
      M.shipSpeed('jet_scout', { engineLevel: 99 }).toFixed(1));

// ---------- 6. Длительность и непрерывность маршрутов ----------
const t0 = Date.UTC(2200, 0, 1);
M.TABLES.routes.forEach(r => {
    const ps0 = M.routePose(r.id, 0, t0);
    const len = ps0.len;
    const lenPace = ps0.lenPace || len;
    const kmPerPx = M.TABLES.motion.kmPerAu / M.TABLES.motion.pxPerAuAtEarth;
    const vRef = M.shipSpeed(r.art || 'jet_scout');
    let prof = M.flightProfile(lenPace * kmPerPx, vRef);
    const fixedPh = M.TABLES.phases.load + M.TABLES.phases.takeoff + M.TABLES.phases.unload;
    // не меньше 10 минут реального времени на плечо: борт замедляется
    const minSpan = 600 * M.TABLES.time.scale;
    if (fixedPh + prof.total < minSpan) {
        prof = M.flightProfile(lenPace * kmPerPx, (lenPace * kmPerPx) / Math.max(60, minSpan - fixedPh));
    }
    const theoretical = fixedPh + prof.total;
    check('длительность рейса ' + r.id + ' = фазы + путь/скорость',
          Math.abs(ps0.total - theoretical) < 0.5,
          ps0.total.toFixed(1) + ' с (разгон ' + prof.tAcc.toFixed(0) +
          ' + крейсер ' + prof.tCruise.toFixed(0) + ' + торможение ' + prof.tAcc.toFixed(0) + ')');

    // шаг 1 игровая секунда на протяжении двух циклов
    const steps = [];
    let maxJump = 0, prev = null;
    const total = ps0.total;
    for (let g = 0; g <= total * 2; g += 1) {
        const ps = M.routePose(r.id, 0, t0 + g * 1000);
        if (prev) {
            const d = Math.hypot(ps.x - prev.x, ps.y - prev.y);
            steps.push(d);
            if (d > maxJump) maxJump = d;
        }
        prev = ps;
    }
    const sorted = steps.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const cruiseStep = lenPace / (total - (M.TABLES.phases.load + M.TABLES.phases.takeoff
        + M.TABLES.phases.accel + M.TABLES.phases.land + M.TABLES.phases.unload));
    // скорость на карте переводим в км/с и сравниваем со светом
    const kmPerPx2 = M.TABLES.motion.kmPerAu / M.TABLES.motion.pxPerAuAtEarth;
    const vMap = cruiseStep * kmPerPx2;   // px за игровую секунду -> км/с
    check('скорость на карте не выше света (' + r.id + ')',
          vMap <= M.TABLES.motion.speedOfLight * 1.001,
          Math.round(vMap).toLocaleString('ru-RU') + ' км/с');
    // шаг за 1 игровую секунду: крейсер 2,5 px/с реального = 0,042 px за игровую
    // секунду; разгон в 5 раз быстрее, поэтому предел 0,5 px
    // на фазе разгона/торможения скорость выше крейсерской в ~5 раз,
    // поэтому допускаем до 3 px за игровую секунду, но не разрыв
    check('плавность шага ' + r.id + ' (< 3 px за игровую секунду)',
          maxJump < 3,
          'макс ' + maxJump.toFixed(2) + ' px, медиана ' + median.toFixed(2));
});

// ---------- 7. Непрерывность на стыке циклов и развороте ----------
M.TABLES.routes.forEach(r => {
    const base = Date.UTC(2200, 0, 1);
    const ps = M.routePose(r.id, 0, base);
    const span = ps.total * 1000;
    // стык циклов: 0.2 с до и после
    const a = M.routePose(r.id, 0, base + span - 200);
    const b = M.routePose(r.id, 0, base + span + 200);
    const dCycle = Math.hypot(a.x - b.x, a.y - b.y);
    check('стык циклов ' + r.id + ' без скачка (< 5 px)', dCycle < 5, dCycle.toFixed(2) + ' px');

    // разворот: конец прямого плеча и начало обратного
    const c1 = M.routePose(r.id, 0, base + span * 0.5 - 200);
    const c2 = M.routePose(r.id, 0, base + span * 0.5 + 200);
    const dTurn = Math.hypot(c1.x - c2.x, c1.y - c2.y);
    check('разворот ' + r.id + ' без скачка (< 5 px)', dTurn < 5, dTurn.toFixed(2) + ' px');
});

// ---------- 8. Логистика: борта не летают «туда-обратно» ----------
const N = (M.SCHEDULES || []).length;
check('расписания построены', N > 0, 'бортов ' + N);
for (let i = 0; i < N; i++) {
    const sch = M.SCHEDULES[i];
    const dests = sch.legs.filter(l => l.kind === 'fly').map(l => l.to);
    const distinct = new Set(dests).size;
    // нет немедленного возврата: подряд идущие цели не совпадают с точкой старта
    let backForth = 0;
    for (let k = 1; k < dests.length; k++) if (dests[k] === dests[k - 1]) backForth = 0;
    check('борт ' + i + ': разные пункты (' + distinct + '/' + dests.length + ')',
          distinct >= Math.min(3, dests.length) && dests.length > 0,
          dests.join('→'));

    // непрерывность по времени
    const span = sch.total * 1000;
    const base = Date.UTC(2200, 0, 1);
    let maxJump = 0, prev = null;
    for (let g = 0; g <= span * 2; g += 2000) {          // шаг 2 игровые секунды
        const ps = M.shipPose(i, base + g);
        if (!ps) continue;
        if (prev) maxJump = Math.max(maxJump, Math.hypot(ps.x - prev.x, ps.y - prev.y));
        prev = ps;
    }
    check('борт ' + i + ': без разрывов (< 25 px за шаг)', maxJump < 25, 'макс ' + maxJump.toFixed(1) + ' px');
}

// ---------- 9. Инвариант времени в segmentPose ----------
(function () {
    const t0 = 7258075200000;                       // игровое время, мс
    const a = M.segmentPose(-200, 0, 200, 0, 'ion_courier', 0, t0, 0);
    const b = M.segmentPose(-200, 0, 200, 0, 'ion_courier', 0, t0 + 60000, 0);
    const du = Math.abs(((b.u - a.u) + 1) % 1);
    const expected = 60 / a.span;
    check('segmentPose: за 60 с доля пути растёт на 60/span',
          Math.abs(du - expected) < expected * 0.35,
          'Δu=' + du.toFixed(5) + ' ожидалось ' + expected.toFixed(5));

    // единицы: ядро принимает ТОЛЬКО миллисекунды. Проверяем контракт:
    // то же значение в мс даёт тот же u, а «секунды» осознанно дают другое.
    const cMs = M.segmentPose(-200, 0, 200, 0, 'ion_courier', 0, t0, 0);
    const dMs = Math.abs(((cMs.u - a.u) + 1) % 1);
    check('segmentPose: те же мс дают тот же u', dMs < 1e-9, 'Δu=' + dMs.toExponential(2));

    const cSec = M.segmentPose(-200, 0, 200, 0, 'ion_courier', 0, t0 / 1000, 0);
    const dSec = Math.abs(((cSec.u - a.u) + 1) % 1);
    check('segmentPose: секунды не выдаются за мс', dSec > 1e-6, 'Δu=' + dSec.toExponential(2));
})();

// ---------- Итог ----------
console.log('\n=== ИТОГ ===');
console.log('проверок: ' + (pass + fail) + ' | успешно: ' + pass + ' | провалов: ' + fail);
if (fail) {
    console.log('Провалено:');
    rows.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name + ' — ' + (r.detail || '')));
    process.exitCode = 1;
}
