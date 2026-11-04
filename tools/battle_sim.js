// БОЕВОЙ ТЕСТ: 150 кораблей с Земли к Сатурну — модель на едином ядре движения.
// Считает кадры с шагом 1 минута и сохраняет JSON для отрисовки.
// Запуск: node galaktika/tools/battle_sim.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'src', 'galaktika.Web', 'wwwroot', 'js');

function load(file) {
    const sandbox = { window: {}, console, performance: { now: () => Date.now() }, Date, Math, isFinite, JSON };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), sandbox);
    return sandbox.window;
}

const WC = load('worldcoords.js');
const Core = require(path.join(JS, 'motion-core.js'));

const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const T0 = 100000 * 1000;             // игровые мс, как freeze=100000
const MINUTE = 60 * 1000;

// тела на карте (пиксели)
const bodies = {};
PLANETS.forEach(function (id) {
    const p = WC.WorldCoords.planetAt(id, T0);
    if (p) bodies[id] = { x: p.x, y: p.y };
});
const world = { bodies: bodies };

// ---- флот: 150 бортов разных классов ----
const FLEET = [];
const mix = { fighter: 90, light: 40, hauler: 20 };
let n = 0;
Object.keys(mix).forEach(function (cls) {
    for (let i = 0; i < mix[cls]; i++) {
        const a = (n / 150) * Math.PI * 2;
        const r = 14 + (n % 7);
        FLEET.push({
            id: 'F' + n, cls: cls,
            at: 'earth',
            offsetX: Math.cos(a) * r, offsetY: Math.sin(a) * r,
            startedAt: 0,
            orders: [
                { op: 'MOVE_TO', to: 'saturn' },
                { op: 'ORBIT', at: 'saturn', radius: 34 + (n % 12), turns: 1, sec: 600 },
                { op: 'PATROL', points: ['saturn', 'jupiter', 'saturn'], loops: 1 }
            ]
        });
        n++;
    }
});

// ---- пираты: 12 бортов в кольцах Сатурна ----
const PIRATES = [];
for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    PIRATES.push({
        id: 'P' + i,
        x: bodies.saturn.x + Math.cos(a) * (28 + (i % 4) * 6),
        y: bodies.saturn.y + Math.sin(a) * (28 + (i % 4) * 6),
        alive: true
    });
}

// ---- расчёт по минутам ----
const plan = Core.buildPlan(FLEET[0], world);
const legMs = Core.legDurationMs(bodies.earth, bodies.saturn, 'light');
const arrivalMin = Math.round(legMs / MINUTE);

const REAL_ARRIVAL = Math.ceil(legMs / MINUTE / 5);
// ---- БОЕВАЯ МОДЕЛЬ: hp, попадания, гибель конкретных бортов ----
const HP = { fighter: 40, light: 30, hauler: 20 };
const PIRATE_HP = 200;        // бой длиннее: пираты прочнее
const SCAN_MIN = 4;            // минут сканирования колец после прибытия
const FLEET_DPS = 1.6;         // урон флота за минуту на живой борт
const PIRATE_DPS = 22;         // ответный урон пиратов (за минуту на живой пират)

const ships = FLEET.map(function (s2) {
    return { id: s2.id, cls: s2.cls, hp: HP[s2.cls] || 30, maxHp: HP[s2.cls] || 30,
             alive: true, killedAt: null, def: s2 };
});
const pirates = PIRATES.map(function (p2, i) {
    return { id: p2.id, x: p2.x, y: p2.y, hp: PIRATE_HP, maxHp: PIRATE_HP, alive: true, idx: i };
});

const FRAMES = 75;
const frames = [];
let fleetHpPool = ships.reduce(function (a, s2) { return a + s2.hp; }, 0);
let pirateHpPool = pirates.reduce(function (a, p2) { return a + p2.hp; }, 0);
const combatStart = REAL_ARRIVAL + SCAN_MIN;
const events = [];

for (let m = 0; m <= FRAMES; m++) {
    const t = m * MINUTE * 5;
    const arrived = m >= REAL_ARRIVAL;
    const scanning = arrived && m < combatStart;
    const combat = m >= combatStart;

    if (combat && (pirates.some(p2 => p2.alive) && ships.some(s2 => s2.alive))) {
        const aliveFleet = ships.filter(s2 => s2.alive).length;
        const alivePirates = pirates.filter(p2 => p2.alive).length;
        const dmgToPirates = aliveFleet * FLEET_DPS;
        const dmgToFleet = alivePirates * PIRATE_DPS;
        pirateHpPool -= dmgToPirates;
        fleetHpPool -= dmgToFleet;
        // распределяем урон: гибнут борта по одному, пока пул hp не станет <= 0
        // урон распределяется по каждому живому борту: гибнут те, у кого hp <= 0
        const aliveNow = ships.filter(s2 => s2.alive);
        const perShip = aliveNow.length ? dmgToFleet / aliveNow.length : 0;
        aliveNow.forEach(function (s3) {
            s3.hp -= perShip;
            if (s3.hp <= 0) {
                s3.alive = false; s3.killedAt = m;
                events.push({ t: m, what: 'флот потерял ' + s3.cls + ' ' + s3.id });
            }
        });
        let guard = 0;
        while (pirateHpPool <= 0 && guard++ < 500) {
            const victim = pirates.filter(p2 => p2.alive)
                .sort((a, b) => a.hp - b.hp)[0];
            if (!victim) break;
            victim.alive = false; victim.killedAt = m;
            pirateHpPool += victim.maxHp;
            events.push({ t: m, what: 'уничтожен пират ' + victim.id });
        }
    }

    const byClass = { fighter: 0, light: 0, hauler: 0 };
    ships.forEach(function (s2) { if (s2.alive) byClass[s2.cls]++; });

    const shipsPose = ships.map(function (s2) {
        const p3 = Core.poseAt(s2.def, t, world);
        return { id: s2.id, cls: s2.cls, x: p3.x + s2.def.offsetX * 0.15, y: p3.y + s2.def.offsetY * 0.15,
                 alive: s2.alive, op: p3.op };
    });

    const alivePirates = pirates.filter(p2 => p2.alive).map(p2 => ({ id: p2.id, x: p2.x, y: p2.y, alive: true }));

    frames.push({
        minute: m,
        arrived: arrived,
        scanning: scanning,
        combat: combat,
        ships: shipsPose,
        pirates: alivePirates,
        byClass: byClass,
        fire: combat && alivePirates.length ? alivePirates.map(p2 => ({ x: p2.x, y: p2.y })) : [],
        stats: {
            fleet: ships.filter(s2 => s2.alive).length,
            fleetLost: ships.filter(s2 => !s2.alive).length,
            byClass: byClass,
            pirates: alivePirates.length,
            killed: pirates.filter(p2 => !p2.alive).length,
            phase: !arrived ? 'перелёт' : (scanning ? 'сканирование' :
                   (alivePirates.length ? 'бой' : 'уничтожены'))
        }
    });
}

const out = {
    t0: T0,
    planets: bodies,
    planetsOrder: PLANETS,
    arrivalMin: REAL_ARRIVAL, gameArrivalMin: arrivalMin,
    legMs: legMs,
    frames: frames,
    events: events
};
const file = path.join(ROOT, 'reports', 'battle_sim.json');
fs.writeFileSync(file, JSON.stringify(out), 'utf8');
console.log('файл:', file);
console.log('перелёт Земля–Сатурн:', Math.round(legMs / 60000), 'мин игровых =', Math.round(legMs / 60000), 'мин реального при 1×');
console.log('кадров:', frames.length, '| бой начинается с минуты', arrivalMin);
