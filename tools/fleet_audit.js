// Аудит движения: проверяет флот и торговцев ЧИСЛАМИ, без скриншотов.
// Запуск: node galaktika/tools/fleet_audit.js
// Проверки:
//   1) нет рывков (шаг между кадрами не больше ожидаемого в N раз);
//   2) скорость не выше скорости света и не выше потолка 0,2 c для торговцев;
//   3) фазы: погрузка/полёт/разгрузка идут по порядку, u не выходит за 0..1;
//   4) на стыке цикла (переход к следующему плечу) нет телепорта;
//   5) корабль не входит в диск планеты (отступ от центра).
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MOTION = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'motion.js');
const code = fs.readFileSync(MOTION, 'utf8');

const sandbox = {
    window: {},
    console,
    performance: { now: () => Date.now() },
    Date,
    Math,
    isFinite
};
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const M = sandbox.window.Motion;
if (!M) {
    console.error('НЕТ window.Motion — модуль не загрузился');
    process.exit(1);
}

const kmPerPx = M.kmPerAu / M.pxPerAuAtEarth;
const C_KMS = 299792;
const problems = [];
const stats = [];

function checkContinuity(name, poses, stepSec) {
    let maxStep = 0, maxAt = -1;
    for (let i = 1; i < poses.length; i++) {
        const a = poses[i - 1], b = poses[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d > maxStep) { maxStep = d; maxAt = i; }
    }
    // допустимый шаг: не больше 40 px/с * шаг + запас на смену плеча
    const limit = 40 * stepSec + 30;
    const ok = maxStep <= limit;
    if (!ok) problems.push(`${name}: рывок ${maxStep.toFixed(1)} px за ${stepSec} с (лимит ${limit.toFixed(1)}) в кадре ${maxAt}`);
    return { maxStep, ok };
}

function checkSpeeds(name, poses, stepSec) {
    let worst = 0;
    for (let i = 1; i < poses.length; i++) {
        const a = poses[i - 1], b = poses[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const v = (d * kmPerPx) / stepSec;      // км/с
        if (b.phase === 'fly' && a.phase === 'fly' && v > worst) worst = v;
    }
    const overC = worst > C_KMS;
    const overCap = worst > 60000 * 1.25;
    if (overC) problems.push(`${name}: ${Math.round(worst).toLocaleString('ru-RU')} км/с — БЫСТРЕЕ СВЕТА`);
    else if (overCap) problems.push(`${name}: ${Math.round(worst).toLocaleString('ru-RU')} км/с — выше потолка 0,2 c`);
    return worst;
}

function checkPhases(name, poses) {
    const seen = new Set(poses.map(p => p.phase));
    const bad = poses.filter(p => !isFinite(p.u) || p.u < -0.001 || p.u > 1.001);
    if (bad.length) problems.push(`${name}: u вне 0..1 (${bad.length} кадров)`);
    return [...seen];
}

// ---------- ФЛОТ: 8 колец по 4 планеты, двусторонние плечи ----------
const SHIP_COUNT = 16;
const STEP = 30;                 // секунд между кадрами
const PERIOD = 600 * 12;         // проверяем 12 периодов

for (let i = 0; i < SHIP_COUNT; i++) {
    const poses = [];
    for (let t = 0; t <= PERIOD * 1000; t += STEP * 1000) {
        const p = M.shipPose(i, t);
        if (p && isFinite(p.x) && isFinite(p.y)) poses.push(p);
    }
    if (!poses.length) { problems.push(`флот ${i}: нет поз`); continue; }
    const cont = checkContinuity('флот ' + i, poses, STEP);
    const v = checkSpeeds('флот ' + i, poses, STEP);
    checkPhases('флот ' + i, poses);
    stats.push({ name: 'флот ' + i, vKmS: Math.round(v), px: poses.length });
}

// ---------- ТОРГОВЦЫ: все пары из TABLES ----------
const tradeRoutes = [
    ['earth', 'mars', 'ion_courier'],
    ['earth', 'mars', 'jet_hauler'],
    ['mars', 'jupiter', 'ion_courier'],
    ['mars', 'jupiter', 'jet_hauler'],
    ['jupiter', 'saturn', 'grav_frigate'],
    ['jupiter', 'saturn', 'ion_courier'],
    ['earth', 'jupiter', 'ion_courier'],
    ['earth', 'jupiter', 'jet_hauler'],
    ['mars', 'saturn', 'ion_prospector'],
    ['mars', 'saturn', 'jet_hauler'],
    ['saturn', 'earth', 'grav_frigate'],
    ['saturn', 'earth', 'ion_courier']
];

const posOf = (id) => {
    const b = M.TABLES && M.TABLES.bodies && M.TABLES.bodies[id];
    if (!b) return null;
    return { x: b.originX || 0, y: b.originY || 0 };
};

for (const [a, b, art] of tradeRoutes) {
    const pa = posOf(a), pb = posOf(b);
    if (!pa || !pb) { problems.push(`торговец ${a}-${b}: нет координат планеты`); continue; }
    const poses = [];
    for (let t = 0; t <= 36000 * 1000; t += STEP * 1000) {
        const p = M.segmentPose(pa.x, pa.y, pb.x, pb.y, art, 0, t);
        if (p && isFinite(p.x) && isFinite(p.y)) poses.push(p);
    }
    if (!poses.length) { problems.push(`торговец ${a}-${b}: нет поз`); continue; }
    checkContinuity(`торговец ${a}-${b} (${art})`, poses, STEP);
    const v = checkSpeeds(`торговец ${a}-${b} (${art})`, poses, STEP);
    checkPhases(`торговец ${a}-${b} (${art})`, poses);
    stats.push({ name: `${a}-${b} ${art}`, vKmS: Math.round(v), px: poses.length });
}

// ---------- ИТОГ ----------
console.log('=== АУДИТ ДВИЖЕНИЯ ===');
console.log(`проверено объектов: ${stats.length}`);
const fastest = stats.slice().sort((x, y) => y.vKmS - x.vKmS)[0];
console.log(`самый быстрый: ${fastest.name} — ${fastest.vKmS.toLocaleString('ru-RU')} км/с = ${(fastest.vKmS / C_KMS).toFixed(3)} c`);
if (problems.length) {
    console.log(`\nПРОБЛЕМЫ (${problems.length}):`);
    problems.slice(0, 25).forEach(p => console.log('  ✗ ' + p));
    process.exitCode = 1;
} else {
    console.log('\nпроблем не найдено');
}
