// ============================================================================
//  CATALOG-BRIDGE.JS — единственный источник координат тел.
//  Берёт данные из каталога (catalog.js, сгенерирован из SQL) и считает
//  позицию через SceneModel/OrbitKepler. solar.js спрашивает координаты
//  ТОЛЬКО здесь — своей математики у сцены больше нет.
// ============================================================================
(function (global) {
    'use strict';

    function bodies() {
        const c = global.CATALOG;
        if (!c) return [];
        return Array.isArray(c) ? c : (c.bodies || []);
    }

    function find(id) {
        return bodies().find(function (b) { return b.id === id; }) || null;
    }

    function isPlanetLike(b) {
        return b && (b.class === 'planet' || b.class === 'dwarf' || b.class === 'asteroid');
    }

    // позиция тела на игровое время (мс) в пикселях сцены
    function pos(id, timeMs) {
        const b = find(id);
        if (!b || !global.SceneModel) return null;
        const p = global.SceneModel.orbitPosition(b, timeMs);
        if (!p) return null;
        return { x: p.x, y: p.y, r: p.r, kepler: !!p.kepler };
    }

    // точки орбиты для отрисовки линии (те же, что двигают планету)
    function path(id, samples) {
        const b = find(id);
        if (!b || !global.OrbitKepler || b.e === undefined || b.e === null) return null;
        return global.OrbitKepler.path({
            a: Number(b.a), e: Number(b.e),
            i: Number(b.i) || 0, om: Number(b.om) || 0, w: Number(b.w) || 0
        }, samples || 96).map(function (q) {
            const px = (global.SceneModel && global.SceneModel.pxPerAu) || 185;
            return { x: q.x * px, y: q.y * px, z: (q.z || 0) * px };
        });
    }

    function planets() {
        return bodies().filter(isPlanetLike);
    }

    global.CatalogBridge = {
        available: function () { return !!global.CATALOG && !!global.SceneModel; },
        bodies: bodies,
        planets: planets,
        find: find,
        pos: pos,
        path: path,
        count: function () { return bodies().length; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
