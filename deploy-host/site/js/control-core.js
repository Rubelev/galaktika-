// ============================================================================
//  CONTROL-CORE.JS — центральное ядро управления сценой.
//  Одна точка правды: время, камера, режим, фильтры, выбор.
//  Любой модуль (солнечная карта, глобус, планетарный вид, бой, гонки)
//  меняет состояние ТОЛЬКО через команды этого ядра и подписывается на него.
//
//  API:
//    Control.get()                 → снимок состояния (только чтение)
//    Control.dispatch(cmd, arg)    → выполнить команду
//    Control.subscribe(fn)          → подписка, возвращает отписку
//    Control.commands()             → список команд
//  Отладка: ?control=1 — показывает панель состояния.
// ============================================================================
(function (global) {
    'use strict';

    const state = {
        // время
        timeMs: 0,            // игровое время, мс
        timeScale: 1,         // 1 / 60 / 3600 / 86400 / 31557600
        paused: false,
        // камера
        zoom: 1,
        tilt: 0,              // rotateX
        spin: 0,              // rotateZ
        panX: 0,
        panY: 0,
        // режим сцены
        mode: 'map',          // map | globe | planet | battle | race | garage | war
        world: null,          // мир для globe/planet
        point: null,          // {lat, lon} точка на поверхности
        // слои и фильтры
        filters: { routes: true, ownOnly: false, fleetRoutes: true, stations: true, ships: true },
        // выбор
        selection: null,      // {kind:'planet'|'ship'|'moon', id}
        // служебное
        build: (document.querySelector('meta[name="app-build"]') || {}).content || ''
    };

    const subs = new Set();
    const log = [];
    let frame = 0;

    function get() { return Object.freeze(JSON.parse(JSON.stringify(state))); }

    function emit(cmd, arg) {
        frame++;
        const snapshot = get();
        subs.forEach(function (fn) { try { fn(snapshot, cmd, arg); } catch (e) { } });
        if (log.length < 200) log.push({ t: Date.now(), cmd: cmd, arg: arg });
    }

    function applyTimeScale(v) {
        const allowed = [1, 60, 3600, 86400, 31557600];
        const val = allowed.indexOf(Number(v)) >= 0 ? Number(v) : state.timeScale;
        state.timeScale = val;
        try { if (typeof window.applyTimeScale === 'function') window.applyTimeScale(val); } catch (e) { }
        try { if (typeof window.setTimeMode === 'function') window.setTimeMode(val); } catch (e) { }
    }

    function applyCamera() {
        try {
            if (typeof window.rotX === 'number') { window.rotX = state.tilt; }
            if (typeof window.rotZ === 'number') { window.rotZ = state.spin; }
            if (typeof window.updateSolarTransform === 'function') window.updateSolarTransform();
        } catch (e) { }
    }

    const commands = {
        // ---- время ----
        setTime(ms) { state.timeMs = Number(ms) || 0; emit('setTime', ms); },
        advance(ms) { state.timeMs += Number(ms) || 0; emit('advance', ms); },
        setTimeScale(v) { applyTimeScale(v); emit('setTimeScale', v); },
        pause(p) { state.paused = !!p; emit('pause', p); },
        // ---- камера ----
        setZoom(v) { state.zoom = Math.max(0.15, Math.min(12, Number(v) || 1)); emit('setZoom', state.zoom); },
        zoomBy(k) { commands.setZoom(state.zoom * (Number(k) || 1)); },
        setTilt(deg) { state.tilt = Math.max(-85, Math.min(85, Number(deg) || 0)); applyCamera(); emit('setTilt', state.tilt); },
        setSpin(deg) { state.spin = ((Number(deg) || 0) + 540) % 360 - 180; applyCamera(); emit('setSpin', state.spin); },
        panBy(dx, dy) { state.panX += Number(dx) || 0; state.panY += Number(dy) || 0; emit('panBy', [dx, dy]); },
        resetCamera() { state.zoom = 1; state.tilt = 0; state.spin = 0; state.panX = 0; state.panY = 0; applyCamera(); emit('resetCamera'); },
        // ---- режимы ----
        openMode(mode, world, point) {
            if (!mode) return;
            state.mode = mode;
            if (world !== undefined) state.world = world;
            if (point !== undefined) state.point = point;
            emit('openMode', { mode: mode, world: world, point: point });
        },
        closeMode() { state.mode = 'map'; state.world = null; state.point = null; emit('closeMode'); },
        // ---- фильтры и выбор ----
        setFilter(name, val) {
            if (!(name in state.filters)) return;
            state.filters[name] = !!val;
            document.body.classList.toggle('hide-fleet-routes', name === 'fleetRoutes' && !val);
            document.body.classList.toggle('only-own-routes', name === 'ownOnly' && val);
            document.body.classList.toggle('ships-hidden', name === 'ships' && !val);
            emit('setFilter', [name, val]);
        },
        select(kind, id) { state.selection = id ? { kind: kind, id: id } : null; emit('select', state.selection); }
    };

    function dispatch(cmd, arg) {
        if (!Object.prototype.hasOwnProperty.call(commands, cmd)) {
            console.warn('[Control] неизвестная команда:', cmd);
            return false;
        }
        commands[cmd](arg);
        return true;
    }

    function subscribe(fn) {
        if (typeof fn !== 'function') return function () { };
        subs.add(fn);
        try { fn(get(), 'init', null); } catch (e) { }
        return function () { subs.delete(fn); };
    }

    // ---- панель отладки ----
    function panel() {
        const el = document.createElement('div');
        el.id = 'control-panel-core';
        el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:100001;padding:8px 10px;border-radius:10px;' +
            'background:rgba(8,14,24,.9);border:1px solid rgba(143,214,255,.35);color:#dfe8f5;' +
            'font:10px/1.5 ui-monospace,Consolas,monospace;white-space:pre;pointer-events:none';
        document.body.appendChild(el);
        subscribe(function (s, cmd) {
            el.textContent = 'CONTROL · ' + s.mode + ' · ' + s.build + '\n' +
                'время: ' + Math.round(s.timeMs / 1000) + ' с · ×' + s.timeScale + (s.paused ? ' пауза' : '') + '\n' +
                'камера: zoom ' + s.zoom.toFixed(2) + ' · tilt ' + s.tilt + '° · spin ' + s.spin + '°\n' +
                'мир: ' + (s.world || '—') + ' · точка: ' + (s.point ? s.point.lat.toFixed(1) + '/' + s.point.lon.toFixed(1) : '—') + '\n' +
                'выбор: ' + (s.selection ? s.selection.kind + ':' + s.selection.id : '—') + ' · команд: ' + log.length;
        });
        return el;
    }

    global.Control = {
        get: get,
        dispatch: dispatch,
        subscribe: subscribe,
        commands: function () { return Object.keys(commands); },
        history: function () { return log.slice(-50); }
    };

    if (new URLSearchParams(location.search).has('control')) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel);
        else panel();
    }

    // стартовое состояние времени берём из игры, если оно уже есть
    document.addEventListener('DOMContentLoaded', function () {
        if (typeof window.simulatedTime === 'number') state.timeMs = window.simulatedTime;
    });
})(typeof window !== 'undefined' ? window : globalThis);
