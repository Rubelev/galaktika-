// ============================================================================
//  СВЯЗИ: что править вместе с этим файлом
//  ---------------------------------------------------------------------------
//  Это единственный источник правды по движению и времени: таблицы планет,
//  кораблей, маршрутов, фаз, скоростей. Если меняешь здесь — проверь:
//
//   1) js/solar.js — рисует флот через Motion.shipPose() и торговцев через
//      Motion.segmentPose(). Сам НЕ считает скорость и время.
//   2) js/worldcoords.js — та же орбитальная шкала (ORBIT_SCALE) и эпоха J2000.
//      Расхождение = планеты на карте и в ядре разъедутся.
//   3) js/speedmodel.js — старая матрица скоростей для карточек кораблей.
//      Значения baseSpeedKmS / share должны совпадать с TABLES.motion/ships.
//   4) tools/verify_math.js — тесты проверяют числа отсюда (49 проверок).
//      После правки: node galaktika/tools/verify_math.js → должно быть 49/49.
//   5) html-шаблоны: app-lite/make-static.ps1 и Components/App.razor —
//      там тег <script src="js/motion.js?v=N">, ПОДНИМАЙ N при правке,
//      иначе браузер возьмёт старую версию из кеша.
//   6) app.css — размеры/анимация маркеров (.ship-marker--fleet::after).
//
//  Единицы: время в миллисекундах, расстояния в px карты, 185 px = 1 а.е.,
//  1 real second = TABLES.time.scale игровых секунд (по умолчанию 60).
// ============================================================================

// ЕДИНЫЙ ЦЕНТР РАСЧЁТОВ ДВИЖЕНИЯ И ВРЕМЕНИ.
//
// Задача модуля: всё, что касается времени, орбит, скоростей и рейсов,
// считается здесь — в одной таблице и по одному закону. Отрисовка только
// спрашивает готовую позу: Motion.pose(inst, t) -> { x, y, ang, phase, opacity }.
//
// Порядок расчёта рейса:
//   1) маршрут фиксируется в момент вылета (A, B, контрольная точка);
//   2) длительность рейса = длина / 2,5 px/с (одинаковая экранная скорость);
//   3) фазы: погрузка -> взлёт -> разгон -> крейсер -> подход -> разгрузка
//      -> ожидание дока (только если все доки заняты);
//   4) рейс челночный: плечо «туда», затем «обратно», стык непрерывен.
(function () {
    'use strict';

    // ---------- ЕДИНАЯ ТАБЛИЦА ----------
    const TABLES = {
        time: {
            epochMs: Date.UTC(2000, 0, 1, 12, 0, 0),   // J2000
            dayMs: 86400000,
            scale: 60                                  // 1 с реального = 1 мин игрового
        },

        // Орбитальные элементы: a (а.е.), e, период (сут), эпоха (град), размер (px)
        bodies: {
            mercury: { a: 0.387, e: 0.2056, period: 87.97, epoch: 252.25, size: 8, mass: 0.055 },
            venus:   { a: 0.723, e: 0.0068, period: 224.70, epoch: 181.98, size: 12, mass: 0.815 },
            earth:   { a: 1.000, e: 0.0167, period: 365.26, epoch: 100.46, size: 14, mass: 1.0 },
            mars:    { a: 1.524, e: 0.0934, period: 686.98, epoch: 355.45, size: 11, mass: 0.107 },
            ceres:   { a: 2.767, e: 0.0758, period: 1681.6, epoch: 95.99, size: 7, mass: 0.0002 },
            jupiter: { a: 5.203, e: 0.0484, period: 4332.6, epoch: 34.40, size: 26, mass: 317.8 },
            saturn:  { a: 9.537, e: 0.0542, period: 10759,  epoch: 49.94, size: 22, mass: 95.2 },
            uranus:  { a: 19.191, e: 0.0472, period: 30689, epoch: 313.23, size: 16, mass: 14.5 },
            neptune: { a: 30.069, e: 0.0086, period: 60182, epoch: 304.88, size: 15, mass: 17.1 }
        },

        // Масса корпуса (т), число двигателей, тяга одного двигателя
        // Классы скорости: доля от константы 50 000 км/с.
        //   грузовики и газовозы — 30 %
        //   лёгкий транспорт     — 40 % (без модернизации)
        //   истребители          — 100 % (дальше растут модернизацией)
        ships: {
            jet_scout:          { mass: 45,  engines: 1, thrust: 450,  cls: 'light',  share: 0.40 },
            jet_hauler:         { mass: 320, engines: 2, thrust: 800,  cls: 'truck',  share: 0.30 },
            ion_courier:        { mass: 90,  engines: 2, thrust: 1200, cls: 'light',  share: 0.40 },
            ion_corsair:        { mass: 140, engines: 2, thrust: 1300, cls: 'light',  share: 0.40 },
            ion_prospector:     { mass: 180, engines: 2, thrust: 1000, cls: 'truck',  share: 0.30 },
            grav_frigate:       { mass: 260, engines: 3, thrust: 1100, cls: 'truck',  share: 0.30 },
            plasma_interceptor: { mass: 120, engines: 3, thrust: 900,  cls: 'fighter', share: 1.00 }
        },

        // Маршруты флота: кто куда и на чём
        routes: [
            { id: 'earth-mars',    from: 'earth',   to: 'mars',    art: 'jet_scout',    count: 2 },
            { id: 'mars-jupiter',  from: 'mars',    to: 'jupiter', art: 'ion_courier',  count: 2 },
            { id: 'jupiter-saturn',from: 'jupiter', to: 'saturn',  art: 'jet_hauler',   count: 2 },
            { id: 'earth-jupiter', from: 'earth',   to: 'jupiter', art: 'grav_frigate', count: 1 }
        ],

        // Фазы рейса, игровые секунды
        phases: {
            load: 25, takeoff: 10, accel: 20, land: 15, unload: 25, dockWait: 30
        },

        // Единая экранная скорость крейсера и перевод а.е. -> км
        motion: {
            speedOfLight: 299792,       // км/с
            maxLightShare: 0.95,        // быстрее 0,95 c не летаем
            pxPerSecond: 2.5,
            kmPerAu: 149600000,
            pxPerAuAtEarth: 185,
            baseSpeedKmS: 50000,    // 1/6 c у эталонного борта (по решению: 50 000 км/с)
            accelKmS2: 1000,        // разгон/торможение: 1000 км/с²
            minAccelSec: 120,       // не меньше 2 игровых минут на манёвр
            maxAccelSec: 1800,      // не больше 30 минут игрового времени
            engineBonus: 0.08,
            techBonus: 0.05,
            maxEngineLevel: 5,
            maxTechLevel: 10
        }
    };

    // ---------- ВРЕМЯ ----------
    let currentScale = TABLES.time.scale;      // фактический масштаб (ставится из solar.js)
    let gameTimeMs = TABLES.time.epochMs + 0;   // текущее игровое время

    function now() { return gameTimeMs; }
    function setTime(ms) {
        if (typeof ms === 'number' && isFinite(ms)) gameTimeMs = ms;
    }
    function advance(dtMs, scale) {
        const s = (typeof scale === 'number' && isFinite(scale)) ? scale : TABLES.time.scale;
        gameTimeMs += dtMs * s;
        return gameTimeMs;
    }

    // ---------- ОРБИТЫ ----------
    const ORBIT_SCALE = [
        [0.387, 118], [0.723, 150], [1.000, 185], [1.524, 228], [2.100, 245],
        [3.300, 300], [5.203, 330], [9.537, 400], [19.191, 480], [30.069, 560], [39.482, 620]
    ];

    function orbitPx(au) {
        const t = ORBIT_SCALE;
        if (au <= t[0][0]) return t[0][1] * (au / t[0][0]);
        for (let i = 1; i < t.length; i++) {
            if (au <= t[i][0]) {
                const a0 = t[i - 1][0], r0 = t[i - 1][1], a1 = t[i][0], r1 = t[i][1];
                return r0 + (r1 - r0) * (au - a0) / (a1 - a0);
            }
        }
        return t[t.length - 1][1];
    }

    function bodyAt(id, tMs) {
        const b = TABLES.bodies[id];
        if (!b) return null;
        const days = ((tMs === undefined ? gameTimeMs : tMs) - TABLES.time.epochMs) / TABLES.time.dayMs;
        const M = ((b.epoch + (days / b.period) * 360) % 360) * Math.PI / 180;
        const nu = M + (2 * b.e - 0.25 * b.e * b.e * b.e) * Math.sin(M)
                     + 1.25 * b.e * b.e * Math.sin(2 * M);
        const r = b.a * (1 - b.e * b.e) / (1 + b.e * Math.cos(nu));
        const rPx = orbitPx(r);
        return { x: Math.cos(nu) * rPx, y: Math.sin(nu) * rPx, size: b.size, au: r };
    }

    // Период маршрута считается ОДИН РАЗ на фиксированной эпохе:
    // если пересчитывать его от текущего времени, на стыке циклов фаза скачет.
    (function initRouteSpans() {
        const P = TABLES.phases;
        const M0 = TABLES.motion;
        const t0 = TABLES.time.epochMs;
        TABLES.routes.forEach(r => {
            const A = bodyAt(r.from, t0), B = bodyAt(r.to, t0);
            const len = (A && B) ? Math.hypot(B.x - A.x, B.y - A.y) : 200;
            r.len = len;
            // период = фазы + профиль полёта (разгон + крейсер + торможение)
            const kmPerPx0 = M0.kmPerAu / M0.pxPerAuAtEarth;
            const v0 = shipSpeed(r.art || 'jet_scout');
            let prof0 = flightProfile(len * kmPerPx0, v0);
            // минимальное реальное время плеча — 10 минут (при 1 с = 1 мин: 36 000 с)
            const minReal0 = 600 * Math.max(1, currentScale) - (P.load + P.takeoff + P.unload);
            if (prof0.total < minReal0) {
                prof0 = flightProfile(len * kmPerPx0, (len * kmPerPx0) / Math.max(60, minReal0));
            }
            r.prof = prof0;
            r.span = (P.load + P.takeoff + prof0.total + P.unload) * 1000;
        });
    })();

    // ---------- СКОРОСТЬ ----------
    function shipSpeed(id, opts) {
        const s = TABLES.ships[id];
        const M = TABLES.motion;
        if (!s) return M.baseSpeedKmS;
        const o = opts || {};
        const lvl = Math.max(0, Math.min(M.maxEngineLevel, o.engineLevel || 0));
        const tech = Math.max(0, Math.min(M.maxTechLevel, o.techLevel || 0));
        const engines = Math.max(1, o.engines || s.engines);
        const thrust = s.thrust * (1 + M.engineBonus * lvl);
        // константа × доля класса; модернизация двигателя и технологии дают прирост
        const share = (typeof s.share === 'number') ? s.share : 0.4;
        const engineBonus = 1 + M.engineBonus * lvl;
        const v = M.baseSpeedKmS * share * engineBonus * (1 + M.techBonus * tech);
        const cap = M.speedOfLight * M.maxLightShare;
        return Math.round(Math.min(v, cap) * 10) / 10;
    }

    // ---------- ПРОФИЛЬ ПОЛЁТА ----------
    // Скорость набирается и гасится линейно: путь = разгон + крейсер + торможение.
    // Возвращает времена фаз и функцию «доля пути по времени».
    function flightProfile(distKm, vKmS) {
        const M0 = TABLES.motion;
        const a = Math.max(1, M0.accelKmS2);
        let tAcc = vKmS / a;
        tAcc = Math.max(M0.minAccelSec, Math.min(M0.maxAccelSec, tAcc));
        // путь за разгон/торможение (по половине ускорения с каждой стороны)
        const sAcc = 0.5 * vKmS * tAcc;
        const sCruise = Math.max(0, distKm - 2 * sAcc);
        const tCruise = sCruise / Math.max(1, vKmS);
        return { tAcc: tAcc, tCruise: tCruise, total: 2 * tAcc + tCruise,
                 sAcc: sAcc, sCruise: sCruise, v: vKmS, dist: distKm };
    }

    // доля пройденного пути по прошедшему времени внутри полёта
    function distanceShare(prof, elapsed) {
        const t = Math.max(0, Math.min(prof.total, elapsed));
        let s;
        if (t < prof.tAcc) {
            const a = prof.v / prof.tAcc;
            s = 0.5 * a * t * t;
        } else if (t < prof.tAcc + prof.tCruise) {
            s = prof.sAcc + prof.v * (t - prof.tAcc);
        } else {
            const td = Math.min(prof.tAcc, t - prof.tAcc - prof.tCruise);
            const a = prof.v / prof.tAcc;
            s = prof.sAcc + prof.sCruise + prof.v * td - 0.5 * a * td * td;
        }
        return Math.max(0, Math.min(1, s / Math.max(1, prof.dist)));
    }

    // ---------- РЕЙС ----------

    // ---------- ЛОГИСТИКА: заказы и расписание борта ----------
    // Борт НЕ летает «туда-обратно». Он берёт ближайший заказ из точки, где
    // сейчас стоит: прилетел, разгрузился — и ищет ближайшую погрузку.
    // Если заказов нет — ждёт на станции.
    const JOBS = [
        { id: 'j1', from: 'earth',   to: 'mars',    cargo: 'зерно' },
        { id: 'j2', from: 'mars',    to: 'jupiter', cargo: 'руда' },
        { id: 'j3', from: 'jupiter', to: 'saturn',  cargo: 'газ' },
        { id: 'j4', from: 'saturn',  to: 'earth',   cargo: 'лёд' },
        { id: 'j5', from: 'earth',   to: 'jupiter', cargo: 'чипы' },
        { id: 'j6', from: 'mars',    to: 'earth',   cargo: 'металл' },
        { id: 'j7', from: 'jupiter', to: 'mars',    cargo: 'платы' }
    ];

    function distAu(a, b) {
        const A = TABLES.bodies[a], B = TABLES.bodies[b];
        if (!A || !B) return 1e9;
        return Math.abs(A.a - B.a);
    }

    // Расписание борта: каждый раз — ближайший заказ из текущей точки.
    // Состояния: ожидание -> погрузка -> полёт -> разгрузка -> выбор заказа.
    // Кольцо планет: борт ходит ПО КРУГУ, а не «домой и обратно».
    // Половина бортов идёт по часовой, половина — против, чтобы не было
    // «все вылетают из одной планеты».
    const RING = ['earth', 'mars', 'jupiter', 'saturn'];

    function buildSchedule(startIndex, dir, legsCount) {
        const P = TABLES.phases;
        const M0 = TABLES.motion;
        const kmPerPx = M0.kmPerAu / M0.pxPerAuAtEarth;
        const legs = [];
        let idx = startIndex % RING.length;

        for (let k = 0; k < legsCount; k++) {
            const from = RING[idx];
            idx = (idx + dir + RING.length) % RING.length;
            const to = RING[idx];

            // заказ ищем в таблице; если такого нет — синтезируем перевозку
            const job = JOBS.find(j => j.from === from && j.to === to)
                     || JOBS.find(j => j.from === to && j.to === from)
                     || { cargo: 'груз' };

            legs.push({ kind: 'load', at: from, seconds: P.load, cargo: job.cargo });

            const A = bodyAt(from, TABLES.time.epochMs), B = bodyAt(to, TABLES.time.epochMs);
            const lenPx = (A && B) ? Math.hypot(B.x - A.x, B.y - A.y) : 200;
            const km = lenPx * kmPerPx;
            const v = shipSpeed('jet_scout');
            // те же 10 минут реального времени, что и у торговцев
            const natural = flightProfile(km, v).total;
            const minReal = 600 * (TABLES.time.scale || 60) - (P.load + P.takeoff + P.unload);
            const prof = (natural < minReal)
                ? flightProfile(km, km / Math.max(60, minReal))
                : flightProfile(km, v);
            legs.push({
                kind: 'fly', from: from, to: to, cargo: job.cargo,
                seconds: Math.max(20, prof.total),
                prof: prof
            });
            legs.push({ kind: 'unload', at: to, seconds: P.unload, cargo: job.cargo });
        }

        let acc = 0;
        legs.forEach(l => { l.start = acc; acc += l.seconds; });
        return { legs: legs, total: acc };
    }

    const SCHEDULES = (function () {
        const out = [];
        for (let i = 0; i < 7; i++) {
            const dir = (i % 2 === 0) ? 1 : -1;     // чётные — по часовой, нечётные — против
            out.push(buildSchedule(i % 4, dir, 8));
        }
        return out;
    })();

    // Полная поза рейса как чистая функция времени:
    // ничего не хранится между кадрами, поэтому кадр воспроизводим.
    function routePose(routeId, phase, tMs) {
        const r = TABLES.routes.find(x => x.id === routeId);
        if (!r) return null;
        const P = TABLES.phases;
        const t = (tMs === undefined ? gameTimeMs : tMs);

        // 1) грубая оценка длины и периода на текущий момент
        const A1 = bodyAt(r.from, t), B1 = bodyAt(r.to, t);
        if (!A1 || !B1) return null;
        const len1 = Math.hypot(B1.x - A1.x, B1.y - A1.y) || 1;
        const span1 = (P.load + P.takeoff + P.accel + P.land + P.unload
                       + Math.max(20, len1 / TABLES.motion.pxPerSecond) * TABLES.time.scale) * 1000;

        // 2) период берём из таблицы (фиксирован при загрузке)
        const span = r.span;

        const shifted = t + (phase || 0) * span;
        const cycle = Math.floor(shifted / span);
        const cycleStart = cycle * span;
        const A = bodyAt(r.from, cycleStart), B = bodyAt(r.to, cycleStart);
        if (!A || !B) return null;
        const dx = B.x - A.x, dy = B.y - A.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len, ny = -dx / len;
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        const side = (nx * mx + ny * my) >= 0 ? 1 : -1;
        const bulge = Math.min(46, Math.max(10, len * 0.12)) * side;
        const cp = { x: mx + nx * bulge, y: my + ny * bulge };

        // реальные секунды × масштаб времени = игровые секунды
        // темп задаём фиксированной длиной маршрута: скорость не «плывёт»
        const lenPace = r.len || len;
        const kmPerPx = TABLES.motion.kmPerAu / TABLES.motion.pxPerAuAtEarth;
        const vKmS = shipSpeed(r.art || 'jet_scout');
        const prof = flightProfile(lenPace * kmPerPx, vKmS);
        const total = span / 1000;                     // ровно период маршрута
        const back = (cycle % 2) === 1;
        let el = (shifted - cycleStart) / 1000;            // игровые секунды в рейсе

        // фазы: погрузка -> взлёт -> полёт (разгон/крейсер/торможение) -> разгрузка
        const f1 = P.load, f2 = f1 + P.takeoff;
        const f3 = f2 + prof.total;                    // конец полёта
        const f4 = f3 + P.unload;                      // конец разгрузки
        let u = 0, ph = 'load';
        if (el < f1) { u = 0; ph = 'load'; }
        else if (el < f2) { u = 0; ph = 'takeoff'; }
        else if (el < f3) {
            // внутри полёта скорость нелинейна: разгон, крейсер, торможение
            u = distanceShare(prof, el - f2);
            const tt = el - f2;
            ph = (tt < prof.tAcc) ? 'accel'
               : (tt > prof.tAcc + prof.tCruise ? 'land' : 'cruise');
        }
        else if (el < f4) { u = 1; ph = 'unload'; }
        else { u = 1; ph = 'wait'; }
        u = Math.max(0, Math.min(1, u));

        const A0 = back ? B : A, B0 = back ? A : B;
        const bz = (q) => {
            const w = 1 - q;
            return { x: w * w * A0.x + 2 * w * q * cp.x + q * q * B0.x,
                     y: w * w * A0.y + 2 * w * q * cp.y + q * q * B0.y };
        };
        const p1 = bz(u), p2 = bz(Math.min(1, u + 0.01));
        return {
            x: p1.x, y: p1.y,
            ang: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI + 90,
            phase: ph, u: u, cycle: cycle, back: back,
            opacity: (ph === 'load' || ph === 'wait') ? 0.65 : 1,
            A: A, B: B, cp: cp, len: len, lenPace: lenPace, total: total, t0: cycleStart
        };
    }

    // ========================================================================
    //  ФЛОТ: простое кольцо планет, прямые отрезки, без Безье.
    //  Каждое плечо длится не меньше 10 минут реального времени.
    // ========================================================================
    function shipPose(index, tMs) {
        const P = TABLES.phases;
        const t = (tMs === undefined ? gameTimeMs : tMs);
        const M0 = TABLES.motion;
        const kmPerPx = M0.kmPerAu / M0.pxPerAuAtEarth;
        const ORBIT_GAME_S = 120 * Math.max(1, currentScale);
        const LAND_GAME_S = 60 * Math.max(1, currentScale);
        const legs = RING.length;
        const dir = (index % 2 === 0) ? 1 : -1;
        const startIdx = index % RING.length;
        // класс борта по индексу: чётные — лёгкие, нечётные — грузовые
        const art = (index % 2 === 0) ? 'ion_courier' : 'jet_hauler';
        const vCap = 60000;                       // 0,2 c
        const v = Math.min(shipSpeed(art), vCap);
        // минимум 10 минут реального времени и не быстрее 45 с на пиксель
        const minReal = Math.max(600 * Math.max(1, currentScale), 45 * 60);

        // ---- РАСПИСАНИЕ ПЛЕЧ ----
        // Длительность каждого плеча считается ОТ ЕГО ДЛИНЫ, а не одна на всех:
        // раньше все 8 плеч получали одинаковые 600 с, из-за чего дальние плечи
        // (Юпитер-Сатурн) летели в разы быстрее света.
        // Кэш длин плеч: расписание НЕ должно зависеть от текущего времени,
        // иначе при сдвиге t на минуту борт «перескакивает» на другое плечо.
        window.__legLenCache = window.__legLenCache || {};
        const cacheKey = 'v2:' + startIdx + ':' + dir + ':' + art;
        const cached = window.__legLenCache[cacheKey];

        const durations = [];
        const geometry = [];
        for (let k = 0; k < legs; k++) {
            const fromId = RING[((startIdx + dir * k) % legs + legs) % legs];
            const toId = RING[((startIdx + dir * (k + 1)) % legs + legs) % legs];
            // длительности считаем от ФИКСИРОВАННОЙ эпохи: если брать текущее t,
            // плечи «дышат» каждый кадр и борт перескакивает (было 1,6 c)
            const A = bodyAt(fromId, 0), B = bodyAt(toId, 0);
            if (!A || !B) return null;
            let lenPx = Math.hypot(B.x - A.x, B.y - A.y) || 1;
            if (cached && cached[k]) lenPx = cached[k];   // стабильное расписание
            const km = lenPx * kmPerPx;
            const fly = Math.max(km / Math.max(1, v), minReal);
            geometry.push({ fromId: fromId, toId: toId, A: A, B: B, lenPx: lenPx, km: km, fly: fly });
            // плюс орбитальный виток и посадка: борт не пролетает сквозь планету
            durations.push(P.load + fly + ORBIT_GAME_S + LAND_GAME_S + P.unload);
        }

        if (!cached) {
            window.__legLenCache[cacheKey] = geometry.map(g => g.lenPx);
        }

        let total = 0;
        for (let k = 0; k < legs; k++) total += durations[k];
        const cycleTime = ((t / 1000) % total + total) % total;

        let acc = 0, legNo = 0, el = 0;
        for (let k = 0; k < legs; k++) {
            if (cycleTime < acc + durations[k]) { legNo = k; el = cycleTime - acc; break; }
            acc += durations[k];
            legNo = k;
        }
        const g = geometry[legNo];
        const legDur = durations[legNo];
        const flyDur = g.fly;

        const PARK_PX = 10;      // радиус орбиты у цели
        const SURF_PX = 4;       // стоянка на поверхности
        const dx = g.B.x - g.A.x, dy = g.B.y - g.A.y;
        const len = Math.hypot(dx, dy) || 1;
        const dirX = dx / len, dirY = dy / len;

        // Радиальные опорные точки: стоянка и стык плеч совпадают, поэтому
        // переход между плечами непрерывен (планета на стыке общая).
        function radial(P, r) {
            const d = Math.hypot(P.x, P.y) || 1;
            return { x: P.x + (P.x / d) * r, y: P.y + (P.y / d) * r, a: Math.atan2(P.y, P.x) };
        }
        const sRad = radial(g.A, SURF_PX);      // старт: поверхность A
        const eRad = radial(g.B, PARK_PX);      // орбита у B
        const S = sRad, E = eRad;
        const baseAng = eRad.a;                  // орбита начинается с радиального угла
        sRad.a0 = sRad.a;

        let x, y, ang, u, ph;
        if (el < P.load) {
            x = S.x; y = S.y; u = 0; ph = 'load';
            ang = baseAng * 180 / Math.PI + 90;
        } else if (el < P.load + flyDur) {
            const k = (el - P.load) / flyDur;
            u = k * k * (3 - 2 * k);            // разгон и торможение
            x = S.x + (E.x - S.x) * u;
            y = S.y + (E.y - S.y) * u;
            ang = baseAng * 180 / Math.PI + 90;
            ph = 'fly';
        } else if (el < P.load + flyDur + ORBIT_GAME_S) {
            const k = (el - P.load - flyDur) / ORBIT_GAME_S;
            u = 1;
            const a = baseAng + (Math.PI / 4) * k;   // короткая дуга
            x = g.B.x + Math.cos(a) * PARK_PX;
            y = g.B.y + Math.sin(a) * PARK_PX;
            ang = a * 180 / Math.PI + 90;
            ph = 'orbit';
        } else if (el < P.load + flyDur + ORBIT_GAME_S + LAND_GAME_S) {
            const k = (el - P.load - flyDur - ORBIT_GAME_S) / LAND_GAME_S;
            u = 1;
            // спуск: угол возвращается к радиальному, радиус уменьшается до поверхности
            const a = baseAng + (Math.PI / 4) * (1 - k);
            const r = PARK_PX + (SURF_PX - PARK_PX) * (k * k * (3 - 2 * k));
            x = g.B.x + Math.cos(a) * r;
            y = g.B.y + Math.sin(a) * r;
            ang = (a + Math.PI) * 180 / Math.PI + 90;
            ph = 'land';
        } else {
            u = 1;
            const a = baseAng;                   // радиальная точка на поверхности
            x = g.B.x + Math.cos(a) * SURF_PX;
            y = g.B.y + Math.sin(a) * SURF_PX;
            ang = (a + Math.PI) * 180 / Math.PI + 90;
            ph = 'unload';
        }

        return {
            x: x, y: y,
            ang: Math.atan2(g.B.y - g.A.y, g.B.x - g.A.x) * 180 / Math.PI + 90,
            phase: ph, u: u,
            opacity: ph === 'load' ? 0.85 : 1,
            span: legDur, legDur: legDur, flyDur: flyDur, km: g.km, lenPx: g.lenPx,
            vKmS: v, art: art,
            leg: ph, cargo: '-', from: g.fromId, to: g.toId
        };
    }

    // ПРОСТОЕ ДВИЖЕНИЕ: отрезок + орбита + посадка.
    // Борт не пролетает сквозь планету: подходит, замедляется, выходит на
    // орбиту цели (дуга), затем снижается на поверхность и разгружается.
    function travelPose(ax, ay, bx, by, art, phase, tMs) {
        const M0 = TABLES.motion, P = TABLES.phases;
        const t = (tMs === undefined ? gameTimeMs : tMs);
        const kmPerPx = M0.kmPerAu / M0.pxPerAuAtEarth;

        const dx = bx - ax, dy = by - ay;
        const lenPx = Math.hypot(dx, dy) || 1;
        const km = lenPx * kmPerPx;
        const dirX = dx / lenPx, dirY = dy / lenPx;

        const vRaw = shipSpeed(art || 'jet_scout');
        const v = Math.min(vRaw, 60000);              // потолок 0,2 c
        // Рейс не быстрее 45 игровых секунд на пиксель пути: иначе дальние
        // плечи (Земля–Юпитер) визуально «проскакивают».
        const minReal = Math.max(600 * Math.max(1, currentScale), lenPx * 45);
        const durTravel = Math.max(km / Math.max(1, v), minReal);

        // длительности участков (игровые секунды, масштабируются)
        const orbitDur = Math.max(90, 120 * Math.max(1, currentScale));
        const landDur = Math.max(45, 60 * Math.max(1, currentScale));
        const span = P.load + durTravel + orbitDur + landDur + P.unload;

        const raw = (t / 1000) + (phase || 0) * span;
        const el = raw - Math.floor(raw / span) * span;

        const PARK_PX = 10;                            // радиус орбиты у цели
        const SURF_PX = 4;                             // посадка на поверхность
        const startX = ax + dirX * PARK_PX, startY = ay + dirY * PARK_PX;
        const endX = bx - dirX * PARK_PX, endY = by - dirY * PARK_PX;
        const baseAng = Math.atan2(dy, dx);            // направление полёта

        let x, y, ang, u, ph;

        if (el < P.load) {
            x = startX; y = startY; ang = baseAng * 180 / Math.PI + 90;
            u = 0; ph = 'load';
        } else if (el < P.load + durTravel) {
            const k = (el - P.load) / durTravel;
            // плавное торможение у цели и разгон у старта
            u = k * k * (3 - 2 * k);
            x = startX + (endX - startX) * u;
            y = startY + (endY - startY) * u;
            ang = baseAng * 180 / Math.PI + 90;
            ph = 'fly';
        } else if (el < P.load + durTravel + orbitDur) {
            const k = (el - P.load - durTravel) / orbitDur;
            u = 1;
            const sweep = (Math.PI / 4) * k;           // короткая дуга у цели
            const a = baseAng + sweep;
            x = bx + Math.cos(a) * PARK_PX;
            y = by + Math.sin(a) * PARK_PX;
            ang = a * 180 / Math.PI + 90;              // нос по касательной к орбите
            ph = 'orbit';
        } else if (el < P.load + durTravel + orbitDur + landDur) {
            const k = (el - P.load - durTravel - orbitDur) / landDur;
            u = 1;
            const a = baseAng + Math.PI / 2;           // точка входа на посадку
            const r = PARK_PX + (SURF_PX - PARK_PX) * (k * k * (3 - 2 * k));
            x = bx + Math.cos(a) * r;
            y = by + Math.sin(a) * r;
            ang = (a + Math.PI) * 180 / Math.PI + 90;
            ph = 'land';
        } else {
            u = 1;
            const a = baseAng + Math.PI / 2;
            x = bx + Math.cos(a) * SURF_PX;
            y = by + Math.sin(a) * SURF_PX;
            ang = (a + Math.PI) * 180 / Math.PI + 90;
            ph = 'unload';
        }

        return {
            x: x, y: y, ang: ang,
            u: u, phase: ph,
            opacity: (ph === 'load' || ph === 'unload') ? 0.85 : 1,
            lenPx: lenPx, km: km, vKmS: v, span: span,
            durTravel: durTravel, orbitDur: orbitDur, landDur: landDur, el: el,
            art: art || 'jet_scout'
        };
    }

    function simpleSegmentPose(ax, ay, bx, by, art, phase, tMs) {
        const t = (tMs === undefined ? gameTimeMs : tMs);
        const r = travelPose(ax, ay, bx, by, art, phase, t);
        const raw = (t / 1000) + (phase || 0) * r.span;
        const back = (Math.floor(raw / r.span) % 2) === 1;
        if (back) {
            r.x = bx + (ax - bx) * r.u;
            r.y = by + (ay - by) * r.u;
            r.ang = Math.atan2(ay - by, ax - bx) * 180 / Math.PI + 90;
        }
        // у части моделей нос нарисован вниз — доворачиваем спрайт
        const NOSE_OFFSET = { jet_hauler: 180, ion_prospector: 180, grav_frigate: 180 };
        r.ang = (r.ang + (NOSE_OFFSET[art] || 0)) % 360;
        return r;
    }

    // ЕДИНАЯ КРИВАЯ ПОЗА: борт идёт по ТОЙ ЖЕ квадратичной дуге, что нарисована
    // пунктиром (A -> cp -> B). Раньше линия была дугой, а борт — прямой.
    function curvePose(ax, ay, cx, cy, bx, by, art, phase, tMs) {
        const t = (tMs === undefined ? gameTimeMs : tMs) / 1000;
        const lenChord0 = Math.hypot(bx - ax, by - ay) || 1;
        const lenArc0 = lenChord0 + Math.hypot(cx - (ax + bx) / 2, cy - (ay + by) / 2) * 0.66;
        // КВАНТОВАНИЕ: планеты смещаются на доли px каждый кадр, из-за этого
        // dur менялся и борт «перебрасывало» на сотни px. Фиксируем шаг 10 px.
        const lenArc = Math.max(10, Math.round(lenArc0 / 10) * 10);
        const km = lenArc * (TABLES.motion.kmPerAu / TABLES.motion.pxPerAuAtEarth);
        const v = shipSpeed(art || 'ion_courier');
        const bySpeed = km / v;
        const byPixels = lenArc * 45;
        const dur = Math.max(bySpeed, byPixels, 600 * (window.__scaleNow || 1));
        // ТРЕУГОЛЬНАЯ ВОЛНА вместо frac(t/dur): при крошечном изменении dur
        // (планеты двигаются) frac давал скачок на сотни px. Здесь фаза непрерывна.
        const sPhase = (t / dur) + (phase || 0) * 2;
        const wv = ((sPhase % 2) + 2) % 2;
        const u = wv < 1 ? wv : 2 - wv;
        const e = u * u * (3 - 2 * u);
        const w = 1 - e;
        const x = w * w * ax + 2 * w * e * cx + e * e * bx;
        const y = w * w * ay + 2 * w * e * cy + e * e * by;
        const w2 = 1 - Math.min(1, e + 0.01);
        const e2 = Math.min(1, e + 0.01);
        const x2 = w2 * w2 * ax + 2 * w2 * e2 * cx + e2 * e2 * bx;
        const y2 = w2 * w2 * ay + 2 * w2 * e2 * cy + e2 * e2 * by;
        return { x: x, y: y, ang: Math.atan2(y2 - y, x2 - x) * 180 / Math.PI + 90,
                 u: u, phase: 'fly', span: dur * 1000, km: km, lenPx: lenArc,
                 art: art || 'ion_courier' };
    }

    // ЕДИНАЯ КРУГОВАЯ ПОЗА (патруль, орбита, гражданские борта).
    // Тот же принцип: время в мс, никаких собственных формул в отрисовке.
    function arcPose(cx, cy, radius, periodSec, tMs, phase) {
        const t = (tMs === undefined ? gameTimeMs : tMs) / 1000;
        const period = Math.max(1, periodSec || 600);
        const a = ((t / period) + (phase || 0)) * Math.PI * 2;
        return {
            x: cx + Math.cos(a) * radius,
            y: cy + Math.sin(a) * radius,
            ang: a * 180 / Math.PI + 90,
            phase: 'fly', u: (a / (Math.PI * 2)) % 1,
            span: period, vKmS: (2 * Math.PI * radius * (TABLES.motion.kmPerAu / TABLES.motion.pxPerAuAtEarth)) / period,
            art: 'ion_courier'
        };
    }

    window.Motion = {
        TABLES: TABLES,
        now: now, setTime: setTime, advance: advance,
        setScale: function (s2) { if (typeof s2 === 'number' && isFinite(s2)) currentScale = s2; },
        getScale: function () { return currentScale; },
        orbitPx: orbitPx,
        bodyAt: bodyAt,
        shipSpeed: shipSpeed,
        routePose: routePose,
        shipPose: shipPose,
        flightProfile: flightProfile,
        segmentPose: simpleSegmentPose,
        curvePose: curvePose,
        arcPose: arcPose,
        SCHEDULES: SCHEDULES,
        JOBS: JOBS,
        // утилита для отчётов
        table: function () {
            return TABLES.routes.map(r => ({
                id: r.id, from: r.from, to: r.to, art: r.art, count: r.count,
                speed: shipSpeed(r.art)
            }));
        }
    };
})();
