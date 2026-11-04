// Тесты нового слоя сцены (без браузера): приоритет кликов, непрерывность,
// единый писатель позиций, один цикл.
// Запуск: node galaktika/tools/scene_test.js
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SCENE = path.join(ROOT, 'src', 'galaktika.Web', 'wwwroot', 'js', 'scene.js');
const MOTION = path.join(ROOT, 'src', 'galaktika.Web', 'wwwroot', 'js', 'motion.js');

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
}

// ---------- загрузка модулей ----------
const sandbox = { window: {}, console, performance: { now: () => Date.now() }, Date, Math, isFinite };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(SCENE, 'utf8'), sandbox);
const SceneKit = sandbox.window.SceneKit;
check('scene.js загружается', !!SceneKit && typeof SceneKit.createScene === 'function');

vm.runInContext(fs.readFileSync(MOTION, 'utf8'), sandbox);
const Motion = sandbox.window.Motion;
check('motion.js загружается', !!Motion);

// ---------- фейковый DOM ----------
function fakeEl() {
    return {
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}
    };
}
const rootEl = {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 })
};

// ---------- сцена ----------
const scene = SceneKit.createScene({ root: rootEl, layers: {} });
check('сцена создаётся', !!scene);

// планета и корабль в одной точке: планета должна победить
const planetEl = fakeEl();
const shipEl = fakeEl();
scene.addBody({
    id: 'earth', kind: 'planet', el: planetEl, radiusPx: 18,
    pos: () => ({ x: 100, y: 50 })
});
scene.addShip({
    id: 'ship-1', kind: 'ship', el: shipEl, radiusPx: 8,
    pose: () => ({ x: 100, y: 50, ang: 0, phase: 'fly' })
});
scene.setCamera({ x: 0, y: 0, scale: 1, rotX: 0, rotZ: 0 });
scene.tick(1000);

// центр сцены = (500, 350); объект в (100, 50) -> экран (600, 400)
const hitBoth = scene.hitTest(600, 400);
check('клик по центру планеты даёт планету', hitBoth && hitBoth.kind === 'planet', hitBoth && hitBoth.kind);
check('корабль тоже в списке попаданий',
    !!(hitBoth && hitBoth.all && hitBoth.all.some(h => h.kind === 'ship')),
    hitBoth && JSON.stringify(hitBoth.all));

// отдельный корабль в стороне от планеты: клик по нему даёт корабль
const loneShipEl = fakeEl();
scene.addShip({
    id: 'ship-2', kind: 'ship', el: loneShipEl, radiusPx: 8,
    pose: () => ({ x: 250, y: 120, ang: 0, phase: 'fly' })
});
scene.tick(1000);
// объект (250,120) -> экран (750, 470)
const hitLoneShip = scene.hitTest(750, 470);
check('клик по кораблю вне планеты даёт корабль',
    hitLoneShip && hitLoneShip.kind === 'ship' && hitLoneShip.id === 'ship-2',
    hitLoneShip && (hitLoneShip.kind + '/' + hitLoneShip.id));

// пустое место
const hitNone = scene.hitTest(300, 300);
check('клик по пустому месту ничего не даёт', hitNone === null);

// ---------- приоритет кликов (чистая функция) ----------
const ch = scene.chooseHit ? scene.chooseHit([
    { kind: 'ship', id: 's1', d: 1 },
    { kind: 'planet', id: 'earth', d: 40 },
    { kind: 'moon', id: 'moon', d: 10 }
]) : null;
check('планета важнее корабля и луны даже при большем расстоянии', ch && ch.kind === 'planet' && ch.id === 'earth', ch && ch.kind);

const ch2 = scene.chooseHit ? scene.chooseHit([
    { kind: 'ship', id: 's1', d: 2 },
    { kind: 'moon', id: 'm1', d: 30 }
]) : null;
check('луна важнее корабля', ch2 && ch2.kind === 'moon', ch2 && ch2.kind);

const ch3 = scene.chooseHit ? scene.chooseHit([
    { kind: 'ship', id: 'a', d: 30 },
    { kind: 'ship', id: 'b', d: 3 }
]) : null;
check('между кораблями — ближний', ch3 && ch3.id === 'b', ch3 && ch3.id);

check('пустой список попаданий даёт null', scene.chooseHit && scene.chooseHit([]) === null);

// ---------- единый писатель ----------
const sceneSrc = fs.readFileSync(SCENE, 'utf8');
const applyCount = (sceneSrc.match(/el\.style\.transform\s*=/g) || []).length;
check('в scene.js один писатель transform', applyCount === 1, 'найдено ' + applyCount);
const leftWrites = (sceneSrc.match(/style\.left\s*=/g) || []).length;
const topWrites = (sceneSrc.match(/style\.top\s*=/g) || []).length;
check('в scene.js нет записи left/top', leftWrites === 0 && topWrites === 0, leftWrites + '/' + topWrites);

// ---------- один цикл ----------
const rafCalls = (sceneSrc.match(/requestAnimationFrame/g) || []).length;
const hasStart = /function start\(/.test(sceneSrc);
check('цикл принадлежит сцене (start/stop)', hasStart && rafCalls <= 6,
    'start=' + hasStart + ', упоминаний RAF=' + rafCalls);

// ---------- один писатель в проекте ----------
const solarSrc = fs.readFileSync(path.join(ROOT, 'src', 'galaktika.Web', 'wwwroot', 'js', 'solar.js'), 'utf8');
const solarLeft = (solarSrc.match(/style\.left\s*=/g) || []).length;
check('в solar.js только аварийный писатель позиций', solarLeft <= 2, 'style.left=' + solarLeft);
check('аварийный писатель собран в legacyPose', /function legacyPose\(/.test(solarSrc));
const scenePublishCalls = (solarSrc.match(/scenePublish\(/g) || []).length;
check('позиции идут через scenePublish', scenePublishCalls >= 5, 'вызовов ' + scenePublishCalls);

// ---------- непрерывность и скорость через ядро ----------
if (Motion) {
    const STEP = 30;
    const cases = [
        ['earth-mars', 102, 'ion_courier'],
        ['mars-jupiter', 527, 'ion_courier'],
        ['earth-jupiter', 442, 'grav_frigate'],
        ['mars-saturn', 607, 'ion_prospector']
    ];
    for (const [name, len, art] of cases) {
        let prev = null, maxStep = 0;
        for (let t = 0; t <= 36000 * 1000; t += STEP * 1000) {
            const p = Motion.segmentPose(0, 0, len, 0, art, 0.31, t);
            if (prev) {
                const d = Math.hypot(p.x - prev.x, p.y - prev.y);
                if (d > maxStep) maxStep = d;
            }
            prev = p;
        }
        check('непрерывность ' + name, maxStep < 25, 'макс шаг ' + maxStep.toFixed(1) + ' px');
    }
}

// ---------- итог ----------
const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.name + (r.detail !== undefined ? ' — ' + r.detail : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${results.length} | успешно: ${results.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
