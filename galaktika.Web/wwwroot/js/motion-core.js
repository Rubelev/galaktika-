// ============================================================================
//  MOTION-CORE.JS — единые правила движения для клиента и сервера
//  ---------------------------------------------------------------------------
//  Контракт: docs/MOTION-CONTRACT.md
//
//  Позиция корабля = ЧИСТАЯ ФУНКЦИЯ (orders, t, world). Никакого состояния
//  кадра, никаких собственных формул в отрисовке. Один и тот же код должен
//  исполняться на клиенте (рендер) и на сервере (авторитетная проверка).
//
//  Добавление новой команды — одна регистрация:
//      MotionCore.defineCommand('JUMP', { duration, pose })
// ============================================================================
(function (global) {
    'use strict';

    // ===== ФИЗИКА, А НЕ ПРАВИЛО ПИКСЕЛЕЙ =====
    // Фантастические, но САМОСОГЛАСОВАННЫЕ двигатели: у каждого класса своё
    // ускорение и своя максимальная скорость. Перелёт считается по формулам
    // равноускоренного движения, а не по «сколько пикселей в секунду».
    // Глобальный масштаб времени — ОДНА константа для моделирования, на физику
    // конкретного перелёта не влияет.
    const TIME_SCALE = 1;             // 1 = реальное время; для модели можно 60, 3600…
    const CLASS_SPEC = {
        fighter: { accelKmS2: 150, vmaxC: 0.30 },
        light:   { accelKmS2: 80,  vmaxC: 0.25 },
        hauler:  { accelKmS2: 30,  vmaxC: 0.15 },
        heavy:   { accelKmS2: 15,  vmaxC: 0.10 }
    };

    const SPEEDS = {          // доля от BASE_KM_S
        fighter: 1.00,
        light: 0.40,
        hauler: 0.30,
        heavy: 0.15
    };
    const BASE_KM_S = 50000;
    const MAX_C_SHARE = 0.95;
    const C_KM_S = 299792;
    const KM_PER_PX = 808649;
    const MIN_LEG_GAME_MS = 600 * 1000;      // 10 минут при 1×
    const MAX_PX_PER_GAME_SEC = 1 / 45;      // не быстрее 1 px за 45 игровых секунд

    const commands = new Map();

    function speedKmS(cls, limits) {
        const share = SPEEDS[cls] !== undefined ? SPEEDS[cls] : SPEEDS.light;
        let v = BASE_KM_S * share;
        const cap = C_KM_S * ((limits && limits.maxC) || MAX_C_SHARE);
        return Math.min(v, cap);
    }

    // Длительность перелёта по КИНЕМАТИКЕ:
    // разгон до vmax, крейсер, торможение. Если vmax не достигается —
    // чистый разгон-торможение (t = 2·sqrt(d/a)).
    function legDurationSec(km, cls) {
        const spec = CLASS_SPEC[cls] || CLASS_SPEC.light;
        const a = spec.accelKmS2;                       // км/с²
        const vmax = Math.min(C_KM_S * spec.vmaxC, C_KM_S * 0.95);   // км/с
        const tAcc = vmax / a;                          // с
        const dAcc = 0.5 * a * tAcc * tAcc;             // км на разгон
        if (2 * dAcc >= km) return 2 * Math.sqrt(km / a);           // не успевает разогнаться
        return 2 * tAcc + (km - 2 * dAcc) / vmax;
    }

    function legDurationMs(from, to, cls, limits) {
        const dx = to.x - from.x, dy = to.y - from.y;
        const lenPx = Math.hypot(dx, dy) || 1;
        const km = lenPx * KM_PER_PX;
        return (legDurationSec(km, cls) * 1000) / TIME_SCALE;
    }

    // ---------- РЕГИСТР КОМАНД ----------
    // duration(ctx) -> мс игры; pose(ctx, k) -> {x, y, ang}
    function defineCommand(op, spec) {
        if (!op || !spec || typeof spec.duration !== 'function' || typeof spec.pose !== 'function') {
            throw new Error('defineCommand: нужны duration() и pose()');
        }
        commands.set(op, spec);
        return true;
    }

    function getCommand(op) { return commands.get(op) || null; }
    function listCommands() { return Array.from(commands.keys()); }

    // ---------- БАЗОВЫЕ КОМАНДЫ ----------
    defineCommand('HOLD', {
        duration: (o) => Math.max(0, (o.sec || 0) * 1000),
        pose: (o, k, ctx) => ({ x: ctx.at.x, y: ctx.at.y, ang: o.ang || 0 })
    });

    defineCommand('LOAD', {
        duration: (o) => Math.max(60, o.sec || 300) * 1000,
        pose: (o, k, ctx) => ({ x: ctx.at.x, y: ctx.at.y, ang: o.ang || 0 })
    });

    defineCommand('UNLOAD', {
        duration: (o) => Math.max(60, o.sec || 300) * 1000,
        pose: (o, k, ctx) => ({ x: ctx.at.x, y: ctx.at.y, ang: o.ang || 0 })
    });

    defineCommand('MOVE_TO', {
        duration: (o, ctx) => legDurationMs(ctx.from, ctx.to, ctx.cls, ctx.limits),
        pose: (o, k, ctx) => {
            const e = k * k * (3 - 2 * k);           // разгон и торможение
            return {
                x: ctx.from.x + (ctx.to.x - ctx.from.x) * e,
                y: ctx.from.y + (ctx.to.y - ctx.from.y) * e,
                ang: Math.atan2(ctx.to.y - ctx.from.y, ctx.to.x - ctx.from.x) * 180 / Math.PI + 90
            };
        }
    });

    defineCommand('ORBIT', {
        duration: (o) => Math.max(60, o.sec || 240) * 1000,
        pose: (o, k, ctx) => {
            const r = o.radius || 26;
            const turns = o.turns || 1;
            const a = (o.startAngle || 0) + k * Math.PI * 2 * turns;
            return {
                x: ctx.at.x + Math.cos(a) * r,
                y: ctx.at.y + Math.sin(a) * r,
                ang: a * 180 / Math.PI + 90
            };
        }
    });

    defineCommand('LAND', {
        duration: (o) => Math.max(30, o.sec || 120) * 1000,
        pose: (o, k, ctx) => {
            const from = o.radius || 26;
            const to = o.surface || 7;
            const r = from + (to - from) * (k * k * (3 - 2 * k));
            const a = o.startAngle || 0;
            return {
                x: ctx.at.x + Math.cos(a) * r,
                y: ctx.at.y + Math.sin(a) * r,
                ang: (a + Math.PI) * 180 / Math.PI + 90
            };
        }
    });

    defineCommand('PATROL', {
        duration: (o, ctx) => {
            const pts = (o.points || []).map(id => ctx.world.bodies[id]).filter(Boolean);
            if (pts.length < 2) return MIN_LEG_GAME_MS;
            let total = 0;
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                total += legDurationMs(a, b, ctx.cls, ctx.limits);
            }
            return total * Math.max(1, o.loops || 1);
        },
        pose: (o, k, ctx) => {
            const pts = (o.points || []).map(id => ctx.world.bodies[id]).filter(Boolean);
            if (pts.length < 2) return { x: ctx.at.x, y: ctx.at.y, ang: 0 };
            const legs = pts.length;
            const idx = Math.min(legs - 1, Math.floor(k * legs));
            const a = pts[idx], b = pts[(idx + 1) % legs];
            const kk = (k * legs) - idx;
            return {
                x: a.x + (b.x - a.x) * kk,
                y: a.y + (b.y - a.y) * kk,
                ang: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90
            };
        }
    });

    // ---------- ВЫПОЛНЕНИЕ ОЧЕРЕДИ ----------
    // Собираем план: [{op, start, dur, spec, order}]
    // КЭШ ПЛАНА: план зависит только от приказов, класса и старта.
    // Без кэша poseAt() пересобирала план на КАЖДЫЙ кадр — главный тормоз.
    const planCache = new WeakMap();

    function planKey(ship) {
        return JSON.stringify(ship.orders || []) + '|' + (ship.startedAt || 0) + '|' +
            (ship.cls || '') + '|' + JSON.stringify(ship.limits || {}) + '|' + (ship.at || '');
    }

    function cachedPlan(ship, world) {
        let rec = planCache.get(ship);
        const key = planKey(ship);
        if (rec && rec.key === key) return rec.value;
        const value = buildPlan(ship, world);
        planCache.set(ship, { key: key, value: value });
        return value;
    }

    function buildPlan(ship, world) {
        const plan = [];
        let t = ship.startedAt || 0;
        let cursor = null;              // где корабль сейчас
        const ctxBase = { world: world, cls: ship.cls, limits: ship.limits || {} };

        (ship.orders || []).forEach(function (order, i) {
            const spec = commands.get(order.op);
            if (!spec) return;          // неизвестная команда — пропускаем
            const at = order.at || order.to;
            const from = cursor || (world.bodies[ship.at] || { x: 0, y: 0 });
            const to = at ? world.bodies[at] : from;
            const ctx = Object.assign({}, ctxBase, {
                from: from, to: to || from, at: to || from, order: order, index: i
            });
            const dur = spec.duration(order, ctx);
            plan.push({ op: order.op, start: t, dur: dur, spec: spec, ctx: ctx, order: order });
            t += dur;
            cursor = spec.pose(order, 1, ctx);
            if (order.at) ship.at = order.at;
        });
        return { plan: plan, end: t };
    }

    function poseAt(ship, tMs, world) {
        const built = cachedPlan(ship, world);
        if (!built.plan.length) {
            const p = world.bodies[ship.at] || { x: 0, y: 0 };
            return { x: p.x, y: p.y, ang: 0, op: 'IDLE', k: 0, done: true };
        }
        const t = tMs;
        // бинарный поиск сегмента: план отсортирован по start
        let lo = 0, hi = built.plan.length - 1, foundIdx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const st = built.plan[mid];
            if (t < st.start) hi = mid - 1;
            else if (t >= st.start + st.dur) lo = mid + 1;
            else { foundIdx = mid; break; }
        }
        for (let i = (foundIdx >= 0 ? foundIdx : built.plan.length); i < built.plan.length; i++) {
            const step = built.plan[i];
            if (t < step.start + step.dur) {
                const k = step.dur <= 0 ? 1 : Math.max(0, Math.min(1, (t - step.start) / step.dur));
                const p = step.spec.pose(step.order, k, step.ctx);
                return { x: p.x, y: p.y, ang: p.ang || 0, op: step.op, k: k, index: i, done: false };
            }
        }
        const last = built.plan[built.plan.length - 1];
        const p = last.spec.pose(last.order, 1, last.ctx);
        return { x: p.x, y: p.y, ang: p.ang || 0, op: 'DONE', k: 1, index: built.plan.length - 1, done: true };
    }

    function validate(ship, world) {
        const problems = [];
        const built = buildPlan(ship, world);
        built.plan.forEach(function (step) {
            if (!isFinite(step.dur) || step.dur < 0) problems.push(step.op + ': плохая длительность');
            if (step.op === 'MOVE_TO') {
                const lenPx = Math.hypot(step.ctx.to.x - step.ctx.from.x, step.ctx.to.y - step.ctx.from.y) || 1;
                const vKmS = (lenPx * KM_PER_PX) / (step.dur / 1000);
                if (vKmS > C_KM_S * MAX_C_SHARE) problems.push(step.op + ': ' + Math.round(vKmS) + ' км/с > 0,95 c');
            }
        });
        return { ok: problems.length === 0, problems: problems, end: built.end };
    }

    const api = {
        SPEEDS: SPEEDS, BASE_KM_S: BASE_KM_S, C_KM_S: C_KM_S, KM_PER_PX: KM_PER_PX,
        MAX_C_SHARE: MAX_C_SHARE, MIN_LEG_GAME_MS: MIN_LEG_GAME_MS,
        defineCommand: defineCommand, getCommand: getCommand, listCommands: listCommands,
        speedKmS: speedKmS, legDurationMs: legDurationMs, legDurationSec: legDurationSec,
        TIME_SCALE: TIME_SCALE, CLASS_SPEC: CLASS_SPEC,
        buildPlan: buildPlan, cachedPlan: cachedPlan, poseAt: poseAt, validate: validate
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.MotionCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
