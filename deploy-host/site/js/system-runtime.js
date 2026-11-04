// ============================================================================
//  SYSTEM-RUNTIME.JS — ядро управления системами.
//
//  Цель: новая система у игрока появляется БЕЗ правок кода и НЕ МОЖЕТ сломать
//  уже работающие. Для этого:
//    1) каждая система — изолированный инстанс (свои тела, масштаб, время);
//    2) перед публикацией инстанс проходит валидацию — плохие данные просто
//       не попадают в игру, а не ломают сцену;
//    3) переключение атомарное: сначала готовим новый, потом подменяем;
//    4) старый инстанс остаётся в кеше — возврат мгновенный;
//    5) никаких глобальных мутаций: всё внутри инстанса.
//
//  API:
//    Runtime.register(systemData)      → id | null (если не прошёл валидацию)
//    Runtime.activate(id)              → true/false
//    Runtime.current()                 → инстанс
//    Runtime.frame(timeMs, camera)     → кадр текущей системы
//    Runtime.validate(systemData)      → {ok, errors[]}
//    Runtime.list()                    → список зарегистрированных
// ============================================================================
(function (global) {
    'use strict';

    const instances = new Map();   // id → { data, bodies, agents, params }
    let currentId = null;
    let lastError = null;

    const REQUIRED_BODY = ['id', 'class'];
    const VALID_CLASS = ['star', 'planet', 'dwarf', 'asteroid', 'moon', 'belt', 'portal'];

    function validate(data) {
        const errors = [];
        if (!data || typeof data !== 'object') return { ok: false, errors: ['нет данных системы'] };
        if (!data.id) errors.push('нет id системы');
        if (!Array.isArray(data.bodies) || data.bodies.length === 0) errors.push('нет тел');
        const ids = new Set();
        let stars = 0;
        (data.bodies || []).forEach(function (b, i) {
            REQUIRED_BODY.forEach(function (k) {
                if (b[k] === undefined || b[k] === null || b[k] === '') errors.push('тело #' + i + ': нет ' + k);
            });
            if (b.class && VALID_CLASS.indexOf(b.class) < 0) errors.push('тело ' + b.id + ': неизвестный класс ' + b.class);
            if (ids.has(b.id)) errors.push('дубль id: ' + b.id);
            ids.add(b.id);
            if (b.class === 'star') stars++;
            if (b.parent && !ids.has(b.parent)) {
                // родитель может быть объявлен позже — проверим после обхода
            }
            // планеты и луны обязаны иметь период, иначе не двигаются
            if ((b.class === 'planet' || b.class === 'dwarf' || b.class === 'asteroid' || b.class === 'moon') &&
                !(Number(b.P) > 0)) errors.push('тело ' + b.id + ': нет периода P');
        });
        if (stars !== 1) errors.push('должна быть ровно одна звезда (сейчас ' + stars + ')');
        // родители
        (data.bodies || []).forEach(function (b) {
            if (b.parent && !ids.has(b.parent)) errors.push('тело ' + b.id + ': родитель ' + b.parent + ' не найден');
        });
        // агенты ссылаются на существующие классы
        const shipIds = new Set(((data.ships) || []).map(function (s) { return s.id; }));
        (data.agents || []).forEach(function (a) {
            if (!shipIds.has(a.class)) errors.push('агент ' + a.id + ': нет класса ' + a.class);
        });
        return { ok: errors.length === 0, errors: errors };
    }

    function register(data) {
        const v = validate(data);
        if (!v.ok) {
            lastError = { id: (data && data.id) || '?', errors: v.errors };
            console.warn('[Runtime] система отклонена:', lastError.id, v.errors);
            return null;
        }
        const instance = {
            id: data.id,
            data: data,
            bodies: data.bodies.slice(),
            agents: (data.agents || []).slice(),
            params: {
                pxPerAu: Number(data.px_per_au) || 185,
                timeScale: Number(data.time_scale) || 1
            }
        };
        instances.set(data.id, instance);   // атомарная подмена: старый живёт до этого момента
        return data.id;
    }

    function activate(id) {
        if (!instances.has(id)) return false;
        currentId = id;
        return true;
    }

    function current() { return currentId ? instances.get(currentId) || null : null; }

    function frame(timeMs, camera) {
        const inst = current();
        if (!inst || !global.SceneModel) return [];
        const prevPx = global.SceneModel.pxPerAu;
        global.SceneModel.pxPerAu = inst.params.pxPerAu;     // изоляция масштаба
        let out = [];
        try {
            out = global.SceneModel.frame(inst.bodies, timeMs, camera);
        } finally {
            global.SceneModel.pxPerAu = prevPx;
        }
        return out;
    }

    function list() {
        return Array.from(instances.keys()).map(function (id) {
            const i = instances.get(id);
            return { id: id, bodies: i.bodies.length, agents: i.agents.length };
        });
    }

    global.SystemRuntime = {
        register: register,
        activate: activate,
        current: current,
        currentId: function () { return currentId; },
        frame: frame,
        validate: validate,
        list: list,
        lastError: function () { return lastError; },
        instances: function () { return Array.from(instances.keys()); }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.SystemRuntime;
})(typeof window !== 'undefined' ? window : globalThis);
