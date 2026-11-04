// Тесты единого контракта движения: детерминизм, лимиты скорости, расширяемость.
// Запуск: node galaktika/tools/motion_core_test.js
'use strict';

const path = require('path');
const MC = require(path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js', 'motion-core.js'));

const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
}

const world = {
    bodies: {
        earth: { x: 0, y: 0 },
        mars: { x: 102, y: 0 },
        jupiter: { x: 527, y: 60 },
        saturn: { x: 620, y: -40 },
        moon: { x: 18, y: 10 }
    }
};

const ship = {
    id: 't1', cls: 'hauler', at: 'earth', startedAt: 0,
    orders: [
        { op: 'MOVE_TO', to: 'mars' },
        { op: 'ORBIT', at: 'mars', radius: 26, turns: 1, sec: 240 },
        { op: 'LAND', at: 'mars' },
        { op: 'UNLOAD', sec: 120 },
        { op: 'MOVE_TO', to: 'earth' },
        { op: 'HOLD', at: 'earth', sec: 300 }
    ]
};

// 1) план строится и заканчивается
const plan = MC.buildPlan(ship, world);
check('план строится', plan.plan.length === 6, 'команд ' + plan.plan.length);
check('план конечен', isFinite(plan.end) && plan.end > 0, 'конец ' + Math.round(plan.end) + ' мс');

// 2) детерминизм: два вызова дают одно и то же
const a = MC.poseAt(ship, plan.end * 0.37, world);
const b = MC.poseAt(ship, plan.end * 0.37, world);
check('позиция детерминирована',
    Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && a.op === b.op,
    a.op + ' / ' + b.op);

// 3) скорость в пределах 0,95 c на всех перелётах
const val = MC.validate(ship, world);
check('валидация без нарушений', val.ok, JSON.stringify(val.problems));

// 4) физический лимит: длительность перелёта Земля–Юпитер
const legMs = MC.legDurationMs(world.bodies.earth, world.bodies.jupiter, 'light');
const lenPx = Math.hypot(world.bodies.jupiter.x, world.bodies.jupiter.y);
const vKmS = (lenPx * MC.KM_PER_PX) / (legMs / 1000);
check('Земля–Юпитер не быстрее света', vKmS < MC.C_KM_S, Math.round(vKmS) + ' км/с');
check('Земля–Марс по кинематике быстрее 0,1 c', (lenPx * MC.KM_PER_PX / (legMs / 1000)) / MC.C_KM_S > 0.1,
    ((lenPx * MC.KM_PER_PX / (legMs / 1000)) / MC.C_KM_S).toFixed(3) + ' c');

// 5) новая команда подключается без правок ядра
MC.defineCommand('JUMP', {
    duration: () => 60000,
    pose: (o, k, ctx) => ({
        x: ctx.from.x + (ctx.to.x - ctx.from.x) * k,
        y: ctx.from.y + (ctx.to.y - ctx.from.y) * k,
        ang: 0
    })
});
check('новая команда зарегистрирована', MC.listCommands().includes('JUMP'), MC.listCommands().join(','));

const ship2 = {
    id: 't2', cls: 'fighter', at: 'earth', startedAt: 0,
    orders: [{ op: 'JUMP', to: 'saturn' }]
};
const p2 = MC.poseAt(ship2, 30000, world);
check('новая команда исполняется', Math.abs(p2.x - 310) < 1 && p2.op === 'JUMP', p2.op + ' x=' + p2.x.toFixed(1));

// 6) очередь идёт по порядку
const first = MC.poseAt(ship, 1, world);
check('первая команда — перелёт', first.op === 'MOVE_TO', first.op);
const last = MC.poseAt(ship, plan.end + 1000, world);
check('после конца очереди — DONE', last.done === true && last.op === 'DONE', last.op);

// 7) неизвестная команда не ломает план
const ship3 = { id: 't3', cls: 'light', at: 'earth', startedAt: 0, orders: [{ op: 'NOPE' }, { op: 'HOLD', at: 'earth', sec: 10 }] };
const p3 = MC.poseAt(ship3, 5000, world);
check('неизвестная команда пропускается', p3.op === 'HOLD', p3.op);

const failed = results.filter(r => !r.ok);
results.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.name + (r.detail ? ' — ' + r.detail : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${results.length} | успешно: ${results.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
