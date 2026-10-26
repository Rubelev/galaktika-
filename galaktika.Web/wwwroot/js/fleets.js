// Флоты в полёте: позиция борта вычисляется из часов, а не из состояния игры.
// Поэтому корабли «летают» всегда — при старте, после паузы, при ускорении.

const ROUTES = [
    // Земля → Луна: подъём по лифту и перелёт до орбитального узла
    { id: 'earth-moon', hours: 4, pts: [[0.00, 0.00], [0.06, -0.02], [0.13, -0.03]] },
    { id: 'moon-phobos',  hours: 38, pts: [[0.18, -0.05], [0.34, -0.02], [0.47, 0.02]] },
    { id: 'phobos-ceres', hours: 46, pts: [[0.47, 0.02], [0.60, 0.14], [0.72, 0.20]] },
    { id: 'ceres-ganymede', hours: 30, pts: [[0.72, 0.20], [0.80, 0.34], [0.86, 0.44]] },
    { id: 'ganymede-titan', hours: 34, pts: [[0.86, 0.44], [0.70, 0.62], [0.55, 0.72]] },
    { id: 'titan-gate', hours: 30, pts: [[0.55, 0.72], [0.30, 0.68], [0.10, 0.55]] }
];

// Пираты работают и в Солнечной системе, и за Вратами: часть флота
// уходит через портал и промышляет у колоний.
const PIRATE_LOOPS = [
    { id: 'jupiter-shadow', zone: 'sol', pts: [[0.86, 0.44], [0.92, 0.36], [0.90, 0.28], [0.82, 0.32], [0.86, 0.44]] },
    { id: 'saturn-rings', zone: 'sol', pts: [[0.55, 0.72], [0.62, 0.80], [0.50, 0.84], [0.46, 0.76], [0.55, 0.72]] },
    { id: 'gate-ambush', zone: 'sol', pts: [[0.10, 0.55], [0.06, 0.46], [0.14, 0.40], [0.18, 0.48], [0.10, 0.55]] },
    { id: 'colonies-raid', zone: 'beyond', pts: [[0.22, 0.20], [0.34, 0.14], [0.40, 0.24], [0.30, 0.30], [0.22, 0.20]] },
    { id: 'kepler-run', zone: 'beyond', pts: [[0.44, 0.10], [0.56, 0.06], [0.60, 0.16], [0.50, 0.20], [0.44, 0.10]] }
];

const TRADER_SHIPS = 109;
const PIRATE_SHIPS = 16;

let built = false;
const traders = [];
const pirates = [];

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// Длина полилинии и функция точки по доле пути
function prep(route) {
    const pts = route.pts;
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        const len = Math.hypot(dx, dy);
        segs.push({ a: pts[i - 1], b: pts[i], len: len, start: total });
        total += len;
    }
    return { id: route.id, hours: route.hours, segs: segs, total: total };
}

function pointAt(prepRoute, t) {
    const target = ((t % 1) + 1) % 1 * prepRoute.total;
    for (const s of prepRoute.segs) {
        if (target <= s.start + s.len) {
            const k = s.len === 0 ? 0 : (target - s.start) / s.len;
            return {
                x: s.a[0] + (s.b[0] - s.a[0]) * k,
                y: s.a[1] + (s.b[1] - s.a[1]) * k
            };
        }
    }
    const last = prepRoute.segs[prepRoute.segs.length - 1];
    return { x: last.b[0], y: last.b[1] };
}

export function init() {
    if (built) return;
    built = true;

    const routes = ROUTES.map(r => ({ route: prep(r), hours: r.hours }));
    const loops = PIRATE_LOOPS.map(r => prep(r));

    // торговые борта: равномерно по маршрутам, фаза из хеша имени
    for (let i = 0; i < TRADER_SHIPS; i++) {
        const h = hash('trader-' + i);
        // маршрут и направление — из хеша: соседние борта идут в разные стороны
        const r = routes[h % routes.length];
        const dir = ((h >> 8) & 1) === 0 ? 1 : -1;
        const phase = (h % 100000) / 100000;
        traders.push({
            idx: i, route: r.route, hours: r.hours, phase: phase, dir: dir,
            kind: ['грузовик', 'цистерна', 'транспорт'][h % 3],
            color: '#7fe3a8'
        });
    }
    // 5 из 8 петель — в Солнечной системе, 3 — за Вратами
    const solLoops = loops.filter((l, i) => PIRATE_LOOPS[i].zone === 'sol');
    const beyondLoops = loops.filter((l, i) => PIRATE_LOOPS[i].zone === 'beyond');
    for (let i = 0; i < PIRATE_SHIPS; i++) {
        // 10 бортов держатся дома, 6 ушли через портал
        const pool = i < 10 ? solLoops : beyondLoops;
        const loop = pool[i % pool.length];
        pirates.push({
            idx: i, route: loop, hours: 6, phase: hash('pirate-' + i) / 4294967296,
            kind: i < 10 ? 'рейдер' : 'рейдер за Вратами',
            color: i < 10 ? '#ff6b6b' : '#ff9d6b',
            zone: i < 10 ? 'sol' : 'beyond'
        });
    }
}

// nowMs — абсолютное время; speed — множитель игрового времени
export function positions(nowMs, speed) {
    init();
    const k = (typeof speed === 'number' && speed > 0) ? speed : 1;
    const out = [];

    traders.forEach(ship => {
        // полный цикл = рейс + сутки на погрузку и разгрузку
        const DOCK_HOURS = 24;
        const fullHours = ship.hours + DOCK_HOURS;
        const cycle = fullHours * 3600 * 1000;
        const t = (nowMs * k / cycle + ship.phase) % 1;
        const flightShare = ship.hours / fullHours;      // доля времени в пути
        const inFlight = t < flightShare;
        const local = flightShare > 0 ? t / flightShare : 0;

        // Бой: раз в несколько рейсов борт встречает пирата и замирает на 6 часов.
        // Исход зависит от хеша — иногда достаётся и самим пиратам.
        const bHash = hash('battle-' + ship.idx);
        const battleSlot = (bHash % 100) / 100;           // где по пути завязывается бой
        const battleLen = 6 / fullHours / flightShare;    // 6 часов в долях рейса
        const inBattle = inFlight && local > battleSlot && local < battleSlot + battleLen;
        const battleSpot = inBattle ? battleSlot : local;
        const traderWins = ((bHash >> 12) & 1) === 1;     // половина боёв — победа торговца
        const along = inBattle ? battleSpot : local;
        const pos = ship.dir > 0 ? along : 1 - along;
        const p = inFlight ? pointAt(ship.route, pos) : pointAt(ship.route, ship.dir > 0 ? 1 : 0);
        out.push({
            x: p.x, y: p.y, color: inBattle ? '#ffd479' : ship.color, kind: ship.kind,
            inFlight: inFlight, inBattle: inBattle, side: 'trade', dir: ship.dir,
            battleResult: inBattle ? (traderWins ? 'отбился' : 'ограблен') : null
        });
    });

    pirates.forEach(ship => {
        const cycle = ship.hours * 3600 * 1000;
        const t = (nowMs * k / cycle + ship.phase) % 1;
        const p = pointAt(ship.route, t);
        // пират замирает, пока идёт бой
        const pIdx = ship.idx % TRADER_SHIPS;
        const pBattle = (hash('battle-' + pIdx) % 100) / 100;
        const pLen = 0.06;
        const onHit = t > pBattle && t < pBattle + pLen;
        out.push({
            x: p.x, y: p.y, color: onHit ? '#ffd479' : ship.color,
            kind: ship.kind, inFlight: true, inBattle: onHit, side: 'pirate'
        });
    });

    return out;
}

export function stats(nowMs, speed) {
    const all = positions(nowMs, speed);
    return {
        total: all.length,
        inFlight: all.filter(s => s.inFlight).length,
        traders: all.filter(s => s.side === 'trade').length,
        pirates: all.filter(s => s.side === 'pirate').length
    };
}

// Перехваты: пират рядом с торговцем — значит встреча. Считается из тех же
// позиций, поэтому детерминирована и не зависит от тиков игры.
const ENCOUNTER_RADIUS = 0.045;

export function encounters(nowMs, speed) {
    const all = positions(nowMs, speed);
    const traders = all.filter(s => s.side === 'trade' && s.inFlight);
    const pirates = all.filter(s => s.side === 'pirate');
    const out = [];
    pirates.forEach(p => {
        traders.forEach(t => {
            const d = Math.hypot(p.x - t.x, p.y - t.y);
            if (d <= ENCOUNTER_RADIUS) {
                out.push({ pirateZone: p.kind, trader: t.kind, dist: Math.round(d * 1000) / 1000 });
            }
        });
    });
    return out;
}

export function riskSummary(nowMs, speed) {
    const all = positions(nowMs, speed);
    const pirates = all.filter(s => s.side === 'pirate');
    const traders = all.filter(s => s.side === 'trade' && s.inFlight);
    let nearest = 1;
    traders.forEach(t => pirates.forEach(p => {
        const d = Math.hypot(p.x - t.x, p.y - t.y);
        if (d < nearest) nearest = d;
    }));
    return { tradersInFlight: traders.length, pirates: pirates.length, nearestEncounter: Math.round(nearest * 1000) / 1000 };
}
