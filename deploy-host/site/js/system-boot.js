// ============================================================================
//  SYSTEM-BOOT.JS — включает ядро систем (SystemRuntime) в игре.
//
//  Что делает:
//   1) собирает системы из каталога (catalog.js → SQL): sol (Солнечная) и war (Вармир);
//   2) регистрирует их в SystemRuntime (с валидацией — битая система не попадёт);
//   3) активирует домашнюю систему;
//   4) даёт window.switchSystem(id) — переключение без перезагрузки;
//   5) отладка: ?sys=1 показывает текущую систему и список зарегистрированных.
// ============================================================================
(function (global) {
    'use strict';
    if ((new URLSearchParams(location.search).get('off') || '').split(',').indexOf('boot') >= 0) return;

    function buildSystems() {
        const c = global.CATALOG;
        if (!c) return [];
        const bodies = Array.isArray(c) ? c : (c.bodies || []);
        const ships = (c.ships || []);
        const agents = (c.agents || []);
        const isSol = function (b) { return b.id !== 'warprime' && b.id !== 'war-front'; };
        const systemOf = function (b) {
            if (b.id === 'warprime') return 'war';
            return 'sol';
        };
        const out = {};
        bodies.forEach(function (b) {
            const sid = systemOf(b);
            if (!out[sid]) out[sid] = { id: sid, px_per_au: 185, time_scale: 1, bodies: [], ships: ships, agents: [] };
            out[sid].bodies.push(b);
        });
        Object.keys(out).forEach(function (sid) {
            out[sid].agents = agents.filter(function (a) { return a.system === sid; });
        });
        return Object.keys(out).map(function (k) { return out[k]; });
    }

    function boot() {
        if (!global.SystemRuntime) return;
        const systems = buildSystems();
        const registered = [];
        systems.forEach(function (s) {
            const id = global.SystemRuntime.register(s);
            if (id) registered.push(id);
        });
        if (registered.length) global.SystemRuntime.activate(registered[0]);
        window.__systems = registered;
        window.__activeSystem = global.SystemRuntime.currentId();

        window.switchSystem = function (id) {
            const ok = global.SystemRuntime.activate(id);
            if (!ok) {
                if (typeof window.notify === 'function') window.notify('Система «' + id + '» не загружена');
                return false;
            }
            window.__activeSystem = id;
            if (typeof window.notify === 'function') {
                const inst = global.SystemRuntime.current();
                window.notify('Система переключена: ' + id + ' · тел ' + (inst ? inst.bodies.length : 0));
            }
            document.title = 'SYS ' + id;
            return true;
        };

        if (new URLSearchParams(location.search).has('sys')) {
            const box = document.createElement('div');
            box.id = 'sys-panel';
            box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:100002;padding:8px 10px;border-radius:10px;' +
                'background:rgba(8,14,24,.9);border:1px solid rgba(143,214,255,.35);color:#dfe8f5;' +
                'font:11px/1.5 ui-monospace,Consolas,monospace;white-space:pre;pointer-events:none';
            box.textContent = 'SYS активная: ' + global.SystemRuntime.currentId() + '\n' +
                'зарегистрированы: ' + registered.join(', ') + '\n' +
                'тел в активной: ' + (global.SystemRuntime.current() ? global.SystemRuntime.current().bodies.length : 0);
            document.body.appendChild(box);
            document.title = 'SYS ' + global.SystemRuntime.currentId() + ' | ' + registered.join(',');
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 1200); });
    else setTimeout(boot, 1200);
})(typeof window !== 'undefined' ? window : globalThis);
