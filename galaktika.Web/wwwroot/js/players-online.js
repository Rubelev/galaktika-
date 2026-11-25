// ============================================================================
//  PLAYERS-ONLINE.JS — другие игроки на карте.
//  Раз в 12 с отправляет свою позицию (presence_ping) и рисует тех, кто
//  ответил в списке, отдельными маркерами с именем. Себя не рисует.
//  Работает только для вошедшего игрока (есть токен).
// ============================================================================
(function (global) {
    'use strict';

    const PING_MS = 12000;
    let layer = null;
    let lastPlayers = [];

    function token() {
        try {
            for (const k of ['galaktika_token', 'token', 'authToken', 'dsh_token']) {
                const v = localStorage.getItem(k);
                if (v) return v;
            }
        } catch (e) { }
        return '';
    }

    function api(action, body) {
        const t = token();
        const opts = {
            method: body ? 'POST' : 'GET',
            credentials: 'same-origin',
            headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { 'X-Auth-Token': t } : {})
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch('api.php?action=' + action, opts).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    // своя позиция в координатах сцены: берём первый маркер флота/корабля
    function ownPos() {
        try {
            const el = document.querySelector('.ship-marker:not(.ship-marker--traffic)') ||
                       document.querySelector('.ship-marker');
            if (!el) return { x: 0, y: 0 };
            const m = (el.style.transform || '').match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/);
            if (m) return { x: Number(m[1]), y: Number(m[2]) };
        } catch (e) { }
        return { x: 0, y: 0 };
    }

    function ensureLayer() {
        if (layer && layer.isConnected) return layer;
        const anchor = document.querySelector('.ship-marker');
        if (!anchor || !anchor.parentNode) return null;
        layer = document.createElement('div');
        layer.id = 'players-layer';
        layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none';
        anchor.parentNode.appendChild(layer);
        return layer;
    }

    function render(players) {
        const L = ensureLayer();
        if (!L) return;
        L.innerHTML = '';
        (players || []).forEach(function (p) {
            const el = document.createElement('div');
            el.className = 'player-marker';
            el.setAttribute('data-player', p.name);
            el.title = p.name + ' · ' + p.system + ' · ' + p.age + ' с назад';
            el.style.cssText =
                'position:absolute;transform:translate(' + p.x + 'px,' + p.y + 'px);' +
                'width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;' +
                'background:#ffd166;box-shadow:0 0 8px #ffd166;pointer-events:none';
            const label = document.createElement('div');
            label.textContent = p.name;
            label.style.cssText = 'position:absolute;left:12px;top:-4px;font:10px ui-monospace,monospace;color:#ffd166;white-space:nowrap';
            el.appendChild(label);
            L.appendChild(el);
        });
        setHud(players.length);
    }

    function setHud(n) {
        let hud = document.getElementById('players-online-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.id = 'players-online-hud';
            hud.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:100004;padding:5px 9px;border-radius:8px;' +
                'background:rgba(8,14,24,.88);border:1px solid rgba(255,209,102,.4);color:#ffd166;' +
                'font:10px ui-monospace,monospace;pointer-events:none';
            document.body.appendChild(hud);
        }
        hud.textContent = 'игроков онлайн: ' + n;
    }

    function ping() {
        if (!token()) return;
        const pos = ownPos();
        // Система: если открыт системный рантайм — берём его, иначе параметр ?system=, иначе sol.
        // Раньше здесь всегда был литерал 'sol' — из-за этого метрика по системам врала.
        const sys = (function () {
            try {
                if (window.SystemRuntime && typeof window.SystemRuntime.currentId === 'function') {
                    const id = window.SystemRuntime.currentId();
                    if (id) return id;
                }
            } catch (e) { }
            try {
                const q = new URLSearchParams(location.search).get('system');
                if (q) return q;
            } catch (e) { }
            return 'sol';
        })();
        api('presence_ping', { x: pos.x, y: pos.y, system: sys })
            .then(function (r) {
                lastPlayers = (r && r.players) || [];
                render(lastPlayers);
                global.__playersOnline = lastPlayers.length;
            })
            .catch(function (e) { global.__playersError = String(e && e.message || e); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(ping, 4000); });
    else setTimeout(ping, 4000);
    setInterval(ping, PING_MS);

    global.PlayersOnline = { ping: ping, render: render, ownPos: ownPos };
})(typeof window !== 'undefined' ? window : globalThis);
