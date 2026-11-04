// ============================================================================
//  SHIP-CARD.JS — карточка КОНКРЕТНОГО борта по клику на маркер флота.
//
//  Зачем отдельный файл: маркеры флота имеют размер 2 px (попасть мышью
//  невозможно), а другие модули на этом же клике открывают общее окно
//  «Космический флот». Поэтому ловим клик на фазе захвата, находим ближайший
//  маркер в радиусе 16 px и показываем его карточку — без зависимости от
//  внутренних функций solar.js.
// ============================================================================
(function (global) {
    'use strict';

    const HIT_RADIUS = 16;

    function pickMarker(ev) {
        const markers = document.querySelectorAll('.ship-marker--fleet');
        let best = null, bestD = 1e9;
        markers.forEach(function (m) {
            const r = m.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
            if (d < bestD) { bestD = d; best = m; }
        });
        return bestD <= HIT_RADIUS ? { el: best, dist: bestD } : null;
    }

    function card() {
        let c = document.getElementById('ship-card');
        if (c) return c;
        c = document.createElement('div');
        c.id = 'ship-card';
        c.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:100007;max-width:330px;' +
            'padding:12px 14px;border-radius:12px;background:rgba(10,16,26,.97);' +
            'border:1px solid rgba(143,214,255,.35);color:#e8eef8;font:13px/1.5 system-ui,sans-serif;' +
            'box-shadow:0 12px 30px rgba(0,0,0,.55)';
        document.body.appendChild(c);
        document.addEventListener('keydown', function (e) {
            if (e.code === 'Escape') { const el = document.getElementById('ship-card'); if (el) el.remove(); }
        });
        return c;
    }

    function show(el) {
        if (!el) return;
        const f = el._fleet || {};
        const title = (el.title || f.label || 'борт').split('—')[0].trim();
        const rows = [];
        if (f.kind) rows.push('тип: ' + f.kind);
        if (f.hours) rows.push('в пути: ' + Number(f.hours).toFixed(1) + ' ч');
        if (f.distKm) rows.push('дистанция: ' + Math.round(f.distKm).toLocaleString('ru-RU') + ' км');
        if (f.art) rows.push('класс: ' + f.art);
        const sid = el.getAttribute('data-sid') || el.getAttribute('data-ship') || '';
        if (sid) rows.push('борт: ' + sid);

        const c = card();
        c.innerHTML = '<button id="ship-card-close" style="float:right;background:none;border:0;color:#9fb2c6;' +
            'font-size:16px;cursor:pointer">×</button>' +
            '<div style="color:#8fd6ff;font-weight:700;font-size:14px">' + title + '</div>' +
            '<div style="opacity:.88;font-size:12px;margin-top:6px">' + rows.join('<br>') + '</div>';
        const b = c.querySelector('#ship-card-close');
        if (b) b.onclick = function () { c.remove(); };
        document.title = 'SHIP ' + title;
        global.__shipCardOpened = (global.__shipCardOpened || 0) + 1;
        global.__shipCardLast = title;
    }


    // СТАБИЛЬНЫЕ ID БОРТОВ: вместо порядкового fleet-N берём маршрут из подписи
    // («Флот · earth → mars · …») → fleet-earth-mars. При повторе маршрута
    // добавляется номер, чтобы id оставался уникальным и одинаковым между
    // загрузками (index меняется при сортировке — маршрут нет).
    function normalizeIds() {
        const seen = {};
        document.querySelectorAll('.ship-marker--fleet').forEach(function (el) {
            const m = (el.title || '').match(/·\s*([a-zа-я0-9_-]+)\s*→\s*([a-zа-я0-9_-]+)/i);
            let base = 'fleet';
            if (m) base = 'fleet-' + m[1].toLowerCase() + '-' + m[2].toLowerCase();
            const n = (seen[base] = (seen[base] || 0) + 1);
            el.dataset.sid = n === 1 ? base : base + '-' + n;
            el.dataset.ship = el.dataset.sid;
        });
        return seen;
    }
    setTimeout(normalizeIds, 1200);
    setTimeout(normalizeIds, 3000);
    setInterval(normalizeIds, 8000);

    document.addEventListener('click', function (ev) {
        const hit = pickMarker(ev);
        global.__shipClickHit = hit ? { dist: Math.round(hit.dist), title: (hit.el.title || '').slice(0, 60) } : null;
        if (!hit) return;
        ev.stopPropagation();
        ev.preventDefault();
        show(hit.el);
    }, true);

    global.ShipCard = { show: show, pick: pickMarker, normalizeIds: normalizeIds };
})(typeof window !== 'undefined' ? window : globalThis);
