// ============================================================================
//  BATTLE_STRESS.JS — виртуальная битва Земля vs Марс по 300 объектов.
//  Не в игре: чистый прогон математики на едином ядре движения.
//  Запуск: node galaktika/tools/battle_stress.js
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'src', 'galaktika.Web', 'wwwroot', 'js');

function loadWindow(file) {
    const sandbox = { window: {}, console, performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 }, Date, Math, isFinite, JSON };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), sandbox);
    return sandbox.window;
}
const WC = loadWindow('worldcoords.js');
const Core = require(path.join(JS, 'motion-core.js'));

const T0 = 100000 * 1000;
const pEarth = WC.WorldCoords.planetAt('earth', T0);
const pMars = WC.WorldCoords.planetAt('mars', T0);
const world = { bodies: { earth: { x: pEarth.x, y: pEarth.y }, mars: { x: pMars.x, y: pMars.y } } };

const CLASSES = { fighter: 40, light: 30, hauler: 20 };
const PIRATE_HP = 200;

function makeFleet(side, n, fromId, toId) {
    const out = [];
    const mix = { fighter: Math.round(n * 0.5), light: Math.round(n * 0.35), hauler: n };
    mix.hauler = n - mix.fighter - mix.light;
    let i = 0;
    Object.keys(mix).forEach(function (cls) {
        for (let k = 0; k < mix[cls]; k++, i++) {
            out.push({
                id: side + '-' + i, side: side, cls: cls,
                hp: CLASSES[cls], maxHp: CLASSES[cls], alive: true,
                x: world.bodies[fromId].x, y: world.bodies[fromId].y,
                at: fromId,
                orders: [{ op: 'MOVE_TO', to: toId }]
            });
        }
    });
    return out;
}

const sideA = makeFleet('earth', 300, 'earth', 'mars');
const sideB = makeFleet('mars', 300, 'mars', 'earth');
const all = sideA.concat(sideB);

// План: один перелёт на борт; длительность из ядра
const t0 = process.hrtime.bigint();
const plan = all.map(s => Core.buildPlan(s, world));
const planMs = Number(process.hrtime.bigint() - t0) / 1e6;

const legMs = plan[0].end;
const legC = (Math.hypot(pMath(pMars.x - pEarth.x), pMars.y - pEarth.y) * Core.KM_PER_PX) / (legMs / 1000) / Core.C_KM_S;
function pMath(v) { return v; }

// Бой: тики по 1 игровой секунде после сближения
let cStep = 0, cBatch = 0;
const N = 600;
const travelTicks = Math.min(600, Math.round(legMs / 1000));
const battleTicks = 600;
const tick = function (tMs) {
    const b0 = process.hrtime.bigint();
    let aliveA = 0, aliveB = 0, sumX = 0, sumY = 0;
    for (let i = 0; i < N; i++) {
        const s = all[i];
        if (!s.alive) continue;
        const p = Core.poseAt(s, tMs, world);
        s.x = p.x; s.y = p.y;
        sumX += p.x; sumY += p.y;
        if (s.side === 'earth') aliveA++; else aliveB++;
    }
    // урон: 0.05 hp на борт-противника за тик
    const dmgA = aliveB * 0.09, dmgB = aliveA * 0.075;
    if (tMs > legMs + 5000) {
        for (let i = 0; i < N; i++) {
            const s = all[i];
            if (!s.alive) continue;
            s.hp -= (s.side === 'earth' ? dmgA / Math.max(1, aliveA) : dmgB / Math.max(1, aliveB));
            if (s.hp <= 0) s.alive = false;
        }
    }
    const ms = Number(process.hrtime.bigint() - b0) / 1e6;
    cStep += ms; cBatch++;
    return { aliveA: aliveA, aliveB: aliveB, ms: ms };
};

const samples = [];
let last = null;
// перелёт считаем шагом 60 с (иначе 12 487 тиков на пустой полёт),
// бой — шагом 1 с, это и есть «максималки» по нагрузке
for (let t = 0; t <= legMs; t += 60000) {
    last = tick(t);
    if (t % 600000 === 0) samples.push({ t: t / 1000, phase: 'перелёт', aliveA: last.aliveA, aliveB: last.aliveB, ms: +last.ms.toFixed(3) });
}
for (let k = 0; k <= battleTicks; k++) {
    const t = Math.round(legMs) + k * 1000;
    last = tick(t);
    if (k % 30 === 0) samples.push({ t: t / 1000, phase: 'бой', aliveA: last.aliveA, aliveB: last.aliveB, ms: +last.ms.toFixed(3) });
}

const survivorsA = all.filter(s => s.side === 'earth' && s.alive).length;
const survivorsB = all.filter(s => s.side === 'mars' && s.alive).length;

const report = {
    ships: N, perSide: 300,
    legSeconds: +(legMs / 1000).toFixed(1),
    legC: +legC.toFixed(3),
    planMs: +planMs.toFixed(2),
    planPerShipMs: +(planMs / N).toFixed(3),
    tickAvgMs: +(cStep / cBatch).toFixed(3),
    tickMaxMs: +Math.max.apply(null, samples.map(s => s.ms)).toFixed(3),
    ticksMeasured: cBatch,
    survivorsA: survivorsA, survivorsB: survivorsB,
    samples: samples
};

fs.writeFileSync(path.join(ROOT, 'reports', 'battle-stress.json'), JSON.stringify(report, null, 1), 'utf8');
console.log(JSON.stringify({ ships: N, legSeconds: report.legSeconds, legC: report.legC,
    planMs: report.planMs, tickAvgMs: report.tickAvgMs, tickMaxMs: report.tickMaxMs,
    survivorsA: survivorsA, survivorsB: survivorsB }, null, 1));
console.log('отчёт: reports/battle-stress.json');
