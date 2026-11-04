// Флоты в полёте: позиция борта вычисляется из часов, а не из состояния игры.
// Поэтому корабли «летают» всегда — при старте, после паузы, при ускорении.

// Маршруты привязаны к реальным расстояниям: время рейса считается как
// путь / скорость борта, а не берётся «с потолка». Скорость — из паспорта
// корабля (рейтинг скорости в SHIPS), пересчитанная в км/с.
const ROUTES = [
    // Земля → Луна: подъём по лифту и перелёт до орбитального узла
    { id: 'earth-moon', from: 'Земля', to: 'Луна', distKm: 384400,
      pts: [[0.00, 0.00], [0.06, -0.02], [0.13, -0.03]], assists: [] },
    // у Земли — разгон по её орбитальному движению
    { id: 'moon-phobos', from: 'Луна', to: 'Фобос', distKm: 253000000,
      fromBody: 'earth', toBody: 'mars',
      pts: [[0.13, -0.03], [0.26, -0.04], [0.40, 0.00], [0.47, 0.02]],
      assists: [{ body: 'Земля', at: 0.12, gain: 1.12 }] },
    // торможение у Марса при подлёте к Фобосу
    { id: 'phobos-ceres', from: 'Фобос', to: 'Церера', distKm: 250000000,
      fromBody: 'mars', toBody: 'ceres',
      pts: [[0.47, 0.02], [0.55, 0.10], [0.66, 0.17], [0.72, 0.20]],
      assists: [{ body: 'Марс', at: 0.08, gain: 1.08 }] },
    // главный манёвр: гравитационный разгон у Юпитера
    { id: 'ceres-ganymede', from: 'Церера', to: 'Ганимед', distKm: 480000000,
      fromBody: 'ceres', toBody: 'jupiter',
      pts: [[0.72, 0.20], [0.75, 0.33], [0.80, 0.40], [0.86, 0.44]],
      assists: [{ body: 'Юпитер', at: 0.78, gain: 1.26 }] },
    // Юпитер на выходе + Сатурн на подлёте
    { id: 'ganymede-titan', from: 'Ганимед', to: 'Титан', distKm: 650000000,
      fromBody: 'jupiter', toBody: 'saturn',
      pts: [[0.86, 0.44], [0.82, 0.52], [0.74, 0.60], [0.64, 0.66], [0.55, 0.72]],
      assists: [{ body: 'Юпитер', at: 0.10, gain: 1.22 }, { body: 'Сатурн', at: 0.88, gain: 1.18 }] },
    // разгон у Сатурна перед Вратами
    { id: 'titan-gate', from: 'Титан', to: 'Врата', distKm: 200000000,
      pts: [[0.55, 0.72], [0.46, 0.74], [0.32, 0.68], [0.20, 0.61], [0.10, 0.55]],
      assists: [{ body: 'Сатурн', at: 0.10, gain: 1.16 }] }
];

// Рейтинг скорости борта (как в паспорте SHIPS) → МАКСИМАЛЬНАЯ скорость, км/с.
// 1 единица рейтинга ≈ 25 км/с: разведчик 3.0 → 75 км/с, тягач 1.2 → 30 км/с.
// Это не средняя скорость: до неё ещё нужно разогнаться.
const SPEED_RATING_TO_KM_S = 25;
const G0 = 9.80665;

function cruiseKmS(rating) {
    const r = (typeof rating === 'number' && rating > 0) ? rating : 2.0;
    return r * SPEED_RATING_TO_KM_S;
}

// Разгон борта, м/с². Тягач тянет медленно, курьер — резко.
// 0.25 g при рейтинге 2.0; разведчик 3.0 → 0.37 g; тягач 1.2 → 0.15 g.
function accelMs(rating) {
    const r = (typeof rating === 'number' && rating > 0) ? rating : 2.0;
    return 0.25 * G0 * (r / 2.0);
}
// Гравитационный манёвр — это прирост скорости, поэтому он СОКРАЩАЕТ время
// в пути: полный эффект складывается как произведение выигрышей.
// 1.26 означает «после облёта Юпитера борт идёт на 26 % быстрее».
function assistsGain(assists) {
    if (!assists || !assists.length) return 1;
    return assists.reduce((k, a) => k * (a.gain || 1), 1);
}

// Время перелёта по брахистохроне: борт разгоняется, идёт на марше,
// затем тормозит. Гравитационный манёвр поднимает допустимую скорость.
//   если разгон и торможение занимают весь путь:  t = 2·√(d/a)
//   если есть маршевый участок:                  t = 2·(v/a) + (d − v²/a)/v
function flightSeconds(distKm, rating, assists) {
    const d = Math.max(1, distKm * 1000);
    const a = accelMs(rating);
    const vmax = cruiseKmS(rating) * 1000 * assistsGain(assists);
    const dRamp = (vmax * vmax) / a;          // путь на разгон + торможение
    if (d <= dRamp) return 2 * Math.sqrt(d / a);
    return 2 * (vmax / a) + (d - dRamp) / vmax;
}

// пиковая скорость рейса, км/с — для подписи
function peakKmS(distKm, rating, assists) {
    const d = Math.max(1, distKm * 1000);
    const a = accelMs(rating);
    const vmax = cruiseKmS(rating) * 1000 * assistsGain(assists);
    return Math.min(vmax, Math.sqrt(d * a)) / 1000;
}

// часы в пути с поправкой на манёвры, но не меньше получаса
function travelHours(distKm, rating, assists) {
    return Math.max(0.5, flightSeconds(distKm, rating, assists) / 3600);
}

// Живое расстояние по НАСТОЯЩИМ эллипсам.
// Элементы орбит (J2000): большая полуось, эксцентриситет, долгота перигелия,
// средняя аномалия на эпоху и период. Земля–Марс даёт 55–400 млн км —
// ровно как в справочнике (54,6 и 401).
const AU_KM = 149597870.7;
const ORBITAL = {
    earth:   { a: 1.00000011, e: 0.0167086, peri: 102.93768193, M0: 357.52911, period: 365.256 },
    mars:    { a: 1.523679,   e: 0.0934,    peri: 336.04084,    M0: 19.41248,  period: 686.980 },
    ceres:   { a: 2.7675,     e: 0.0758,    peri: 73.6,          M0: 95.0,      period: 1681.6 },
    jupiter: { a: 5.20260,    e: 0.0489,    peri: 14.75385,      M0: 20.0202,   period: 4332.589 },
    saturn:  { a: 9.55491,    e: 0.05551,   peri: 92.43194,      M0: 317.0207,  period: 10759.22 },
    venus:   { a: 0.72333566, e: 0.00677672, peri: 131.60246718, M0: 181.97909950, period: 224.701 },
    mercury: { a: 0.38709927, e: 0.20563593, peri: 77.45779628,  M0: 174.79252722, period: 87.969 },
    uranus:  { a: 19.2184461, e: 0.04629590, peri: 170.96424,    M0: 142.2386,  period: 30685.4 },
    neptune: { a: 30.1103869, e: 0.00898809, peri: 44.97135,     M0: 256.228,   period: 60189.0 }
};

// Положение на орбите в плоскости эклиптики (а.е.).
function keplerPosition(body, days) {
    const el = ORBITAL[body];
    if (!el) return { x: 0, y: 0 };
    const M = (el.M0 + 360.0 * days / el.period) * Math.PI / 180;
    // уравнение Кеплера решаем итерациями Ньютона
    let E = M;
    for (let i = 0; i < 8; i++) {
        E = E - (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
    }
    const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2),
                              Math.sqrt(1 - el.e) * Math.cos(E / 2));
    const r = el.a * (1 - el.e * Math.cos(E));
    const lam = el.peri * Math.PI / 180 + nu;
    return { x: r * Math.cos(lam), y: r * Math.sin(lam) };
}

// Позиция планеты для карты: радиус в а.е. и угол в радианах.
// Карта и расчёт расстояний теперь из одного источника.
export function planetPosition(body, days) {
    const el = ORBITAL[body];
    if (!el) return null;
    const M = (el.M0 + 360.0 * days / el.period) * Math.PI / 180;
    let E = M;
    for (let i = 0; i < 8; i++) {
        E = E - (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
    }
    const nu = 2 * Math.atan2(Math.sqrt(1 + el.e) * Math.sin(E / 2),
                              Math.sqrt(1 - el.e) * Math.cos(E / 2));
    const r = el.a * (1 - el.e * Math.cos(E));
    return { r: r, lam: el.peri * Math.PI / 180 + nu };
}

function routeDistanceKm(def, nowMs) {
    if (!def || !def.fromBody || !def.toBody) return def ? def.distKm : 1e8;
    const days = nowMs / 86400000;
    const p1 = keplerPosition(def.fromBody, days);
    const p2 = keplerPosition(def.toBody, days);
    const dAu = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return Math.max(1e6, dAu * AU_KM);
}

// ---- что видно на карте ----
// Физическое время рейса от 7 часов до 105 суток — это 360-кратный разброс.
// Если показывать его как есть, ближние борта «висят», а дальние «летят как
// сумасшедшие». Поэтому для АНИМАЦИИ берём сжатое время в узком коридоре:
// любой рейс проходится за 20–100 реальных секунд при масштабе 1 с = 1 мин.
// Темп показа: время цикла пропорционально километражу, поэтому дальний борт
// идёт по карте не медленнее ближнего. 2,5 млн км ≈ 1 игровая секунда.
const DISPLAY_MIN_GAME_S = 600;    // 10 реальных секунд при 60×
const DISPLAY_MAX_GAME_S = 12000;  // 200 реальных секунд при 60×
const KM_PER_GAME_SECOND = 7500;   // 7 500 км за игровую секунду (вдвое медленнее)

// Темп борта: время = путь / скорость показа, но не выходя за коридор.
// Проверка: Земля–Марс 55 млн км → 3700 игровых секунд ≈ 62 реальных.
function displaySeconds(distKm, rating, assists) {
    return Math.max(DISPLAY_MIN_GAME_S,
                   Math.min(DISPLAY_MAX_GAME_S, distKm / KM_PER_GAME_SECOND));
}

// Длительности фаз: разгон, марш, торможение (в секундах).
function flightPhases(distKm, rating, assists) {
    const d = Math.max(1, distKm * 1000);
    const a = accelMs(rating);
    const vmax = cruiseKmS(rating) * 1000 * assistsGain(assists);
    const dRamp = (vmax * vmax) / a;
    const tRamp = vmax / a;
    if (d <= dRamp) {
        const half = Math.sqrt(d / a);
        return { accel: half, coast: 0, brake: half };
    }
    return { accel: tRamp, coast: (d - dRamp) / vmax, brake: tRamp };
}

// Расход топлива: работа на разгон и торможение пропорциональна массе и Δv.
// Берём простую модель: 1 т топлива на каждые 120 км/с прироста скорости
// и на каждые 100 млн км маршевого участка.
function fuelTons(distKm, rating, assists) {
    const vmax = cruiseKmS(rating) * assistsGain(assists);
    const coastMkm = Math.max(0, (distKm - 3_000_000) / 1e8);
    return Math.max(2, Math.round(vmax * 2.2 + coastMkm * 6));
}

// Пираты работают и в Солнечной системе, и за Вратами: часть флота
// уходит через портал и промышляет у колоний.
const PIRATE_LOOPS = [
    { id: 'jupiter-shadow', zone: 'sol', pts: [[0.86, 0.44], [0.92, 0.36], [0.90, 0.28], [0.82, 0.32], [0.86, 0.44]] },
    { id: 'saturn-rings', zone: 'sol', pts: [[0.55, 0.72], [0.62, 0.80], [0.50, 0.84], [0.46, 0.76], [0.55, 0.72]] },
    { id: 'gate-ambush', zone: 'sol', pts: [[0.10, 0.55], [0.06, 0.46], [0.14, 0.40], [0.18, 0.48], [0.10, 0.55]] },
    { id: 'colonies-raid', zone: 'beyond', pts: [[0.22, 0.20], [0.34, 0.14], [0.40, 0.24], [0.30, 0.30], [0.22, 0.20]] },
    { id: 'kepler-run', zone: 'beyond', pts: [[0.44, 0.10], [0.56, 0.06], [0.60, 0.16], [0.50, 0.20], [0.44, 0.10]] }
];

// Единая скорость для всех торговых бортов: 2.0 → 50 км/с.
// Если менять, время на всех маршрутах пересчитается одинаково.
const SHIP_RATING = 2.0;

// Было 109 торговцев и 16 пиратов — на карте это превращалось в «зелёную кашу»,
// где невозможно понять, кто есть кто. Теперь флот небольшой и читаемый.
const TRADER_SHIPS = 28;
const PIRATE_SHIPS = 10;

let built = false;
const traders = [];
const pirates = [];

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

// Длина полилинии и функция точки по доле пути
// Сплайн Catmull-Rom: превращаем редкие опорные точки в плавную дугу.
// Прямые отрезки не годятся — облёт планеты должен быть кривой.
function splinePoints(pts, samplesPerSegment) {
    const out = [];
    const n = pts.length;
    if (n < 2) return pts.slice();
    const get = (i) => pts[Math.max(0, Math.min(n - 1, i))];
    for (let i = 0; i < n - 1; i++) {
        const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
        for (let s = 0; s < samplesPerSegment; s++) {
            const t = s / samplesPerSegment;
            const t2 = t * t, t3 = t2 * t;
            out.push([
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
                       (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                       (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
                       (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                       (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            ]);
        }
    }
    out.push(pts[n - 1]);
    return out;
}

// Модель корабля из каталога: чем длиннее рейс, тем тяжелее борт.
function pickShipArt(def, index) {
    const km = def && def.distKm ? def.distKm : 0;
    if (km > 4e8) return ['grav_frigate', 'ion_prospector'][index % 2];
    if (km > 2e8) return ['jet_hauler', 'ion_prospector'][index % 2];
    if (km > 5e7)  return ['jet_hauler', 'ion_courier'][index % 2];
    return ['jet_scout', 'ion_courier'][index % 2];
}

function prep(route) {
    const pts = splinePoints(route.pts, 24);
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        const len = Math.hypot(dx, dy);
        segs.push({ a: pts[i - 1], b: pts[i], len: len, start: total });
        total += len;
    }
    return { id: route.id, segs: segs, total: total };
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

    const routes = ROUTES.map(r => ({ route: prep(r), def: r }));
    const loops = PIRATE_LOOPS.map(r => prep(r));

    // торговые борта: равномерно по маршрутам, фаза из хеша имени
    for (let i = 0; i < TRADER_SHIPS; i++) {
        const h = hash('trader-' + i);
        // маршрут и направление — из хеша: соседние борта идут в разные стороны
        const r = routes[h % routes.length];
        const dir = ((h >> 8) & 1) === 0 ? 1 : -1;
        const phase = (h % 100000) / 100000;
        // Один тип борта на всех: одинаковая схема и одинаковое время в пути.
        // Разные рейтинги давали разброс сроков на одном и том же маршруте.
        const rating = SHIP_RATING;
        const assists = r.def.assists || [];
        // расстояние пересчитывается на каждый кадр: планеты едут по орбитам
        const distKm = routeDistanceKm(r.def, nowMs);
        const hours = travelHours(distKm, rating, assists);
        traders.push({
            idx: i, route: r.route, def: r.def, hours: hours, rating: rating,
            phase: phase, dir: dir,
            kind: ['грузовик', 'цистерна', 'транспорт'][h % 3],
            // модель из каталога кораблей: тяжёлые — на длинные маршруты,
            // лёгкие — на короткие
            art: pickShipArt(r.def, i),
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
        const ph = hash('pirate-' + i) / 4294967296;
        pirates.push({
            idx: i, route: loop, hours: 12 + ph * 16, phase: ph,
            kind: i < 10 ? 'рейдер' : 'рейдер за Вратами',
            art: i % 2 === 0 ? 'plasma_interceptor' : 'grav_frigate',
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
        // для отображения — сжатое время, чтобы все борта двигались заметно
        const dispSeconds = displaySeconds(distKm, ship.rating, (ship.def && ship.def.assists) || []);
        const cycle = dispSeconds * 1000;
        const dockShare = 0.18;                          // стоянка — 18 % цикла
        const flightShare = 1 - dockShare;
        const t = (nowMs * k / cycle + ship.phase) % 1;
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
        const def = ship.def || {};
        const days = ship.hours / 24;
        const eta = days >= 1 ? days.toFixed(0) + ' сут' : ship.hours.toFixed(1) + ' ч';
        out.push({
            x: p.x, y: p.y, color: inBattle ? '#ffd479' : ship.color, kind: ship.kind,
            art: ship.art,
            label: ship.kind + ' · ' + (def.from || '?') + ' → ' + (def.to || '?') +
                   ' · ' + eta +
                   ' · ' + (distKm / 1e6).toFixed(0) + ' млн км' +
                   ' · пик ' + Math.round(peakKmS(distKm, ship.rating, def.assists || [])) + ' км/с' +
                   ' · разгон ' + accelMs(ship.rating).toFixed(1) + ' м/с²' +
                   ' · топливо ' + fuelTons(distKm, ship.rating, def.assists || []) + ' т' +
                   ((def.assists && def.assists.length)
                       ? ' · манёвр у ' + def.assists.map(a => a.body).join(', ')
                       : ''),
            hours: ship.hours, distKm: distKm,
            phases: flightPhases(distKm, ship.rating, def.assists || []),
            fuel: fuelTons(distKm, ship.rating, def.assists || []),
            inFlight: inFlight, inBattle: inBattle, side: 'trade', dir: ship.dir,
            battleResult: inBattle ? (traderWins ? 'отбился' : 'ограблен') : null
        });
    });

    pirates.forEach(ship => {
        // у пиратов своя длительность петли; константа DISPLAY_DIVISOR удалена,
        // из-за неё цикл был NaN и борта не двигались
        const cycle = Math.max(DISPLAY_MIN_GAME_S, Math.min(DISPLAY_MAX_GAME_S,
                              ship.hours * 3600 / 40)) * 1000;
        const t = (nowMs * k / cycle + ship.phase) % 1;
        const p = pointAt(ship.route, t);
        // пират замирает, пока идёт бой
        const pIdx = ship.idx % TRADER_SHIPS;
        const pBattle = (hash('battle-' + pIdx) % 100) / 100;
        const pLen = 0.06;
        const onHit = t > pBattle && t < pBattle + pLen;
        out.push({
            x: p.x, y: p.y, color: onHit ? '#ffd479' : ship.color,
            kind: ship.kind, art: ship.art,
            label: ship.kind + ' · патруль ' + Math.round(ship.hours) + ' ч',
            inFlight: true, inBattle: onHit, side: 'pirate'
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

// Маршруты для отрисовки линий на карте: точки в нормализованных координатах.
export function routeLines() {
    return ROUTES.map(r => ({ id: r.id, from: r.from, to: r.to, pts: r.pts }));
}
