// ============================================================================
//  SCENE-CANVAS.JS — гибридная отрисовка: корабли и трассы на canvas,
//  планеты и интерфейс остаются в DOM.
//
//  Зачем: DOM-маркер на каждый корабль = запись style → пересчёт стилей каждый
//  кадр. Canvas рисует все борта одним проходом, без reflow.
//
//  Включается флагом ?render=canvas (body.render-canvas → DOM-маркеры скрыты).
//  При наклоне сцены (tilt ≠ 0) canvas временно уступает DOM: он рисует в
//  экранных координатах и не умеет перспективу.
// ============================================================================
(function (global) {
    'use strict';

    let canvas = null, ctx = null, dpr = 1;
    const sprites = new Map();

    function ensureCanvas() {
        if (canvas) return canvas;
        const host = document.querySelector('.solar-system-container') || document.body;
        canvas = document.createElement('canvas');
        canvas.id = 'scene-canvas';
        canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;';
        host.appendChild(canvas);
        ctx = canvas.getContext('2d');
        resize();
        global.addEventListener('resize', resize);
        return canvas;
    }

    function resize() {
        if (!canvas) return;
        dpr = Math.min(2, global.devicePixelRatio || 1);
        const w = canvas.clientWidth || global.innerWidth;
        const h = canvas.clientHeight || global.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
    }

    function spriteFor(art) {
        if (!art) return null;
        if (sprites.has(art)) return sprites.get(art);
        const img = new Image();
        img.src = '/images/ships/vol/' + art + '.png';
        sprites.set(art, img);
        return img;
    }

    // Читаем позиции прямо из DOM-маркеров: так canvas покрывает ВСЕ слои
    // (торговцы, флот, портал, гражданские, пояс, пираты) без правок апдейтеров.
    function collectFromDom(camera) {
        const out = [];
        const nodes = document.querySelectorAll('.ship-marker');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            const tr = el.style.transform || '';
            const m = tr.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
            if (!m) continue;
            const rot = tr.match(/rotate\((-?[\d.]+)deg\)/);
            const w = parseFloat(el.style.width) || parseFloat(el.dataset.ms) || 8;
            const bg = (el.style.backgroundImage || '').match(/ships\/vol\/([a-z_]+)\.png/);
            const op = parseFloat(el.style.opacity);
            out.push({
                x: parseFloat(m[1]),
                y: parseFloat(m[2]),
                ang: rot ? parseFloat(rot[1]) : 0,
                px: Math.max(7, w),                 // на canvas борт видно: минимум 7 px
                art: bg ? bg[1] : 'ion_courier',
                side: el.dataset.side || '',
                opacity: isFinite(op) ? op : 1
            });
        }
        return out;
    }

    const ROUTE_SEL = '.trade-path, .fleet-route, .belt-route, .portal-path, .traffic-path, .route-line';

    // Рисуем трассы в тех же координатах сцены: пунктир больше не в DOM
    function drawRoutes(ctx, camera) {
        const nodes = document.querySelectorAll(ROUTE_SEL);
        let drawn = 0;
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            let len = 0;
            try { len = el.getTotalLength(); } catch (e) { continue; }
            if (!len) continue;
            const steps = Math.min(48, Math.max(8, Math.round(len / 14)));
            const pts = [];
            for (let k = 0; k <= steps; k++) {
                const pt = el.getPointAtLength(len * k / steps);
                pts.push(pt);
            }
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
            const cls = el.getAttribute('class') || '';
            ctx.strokeStyle = cls.indexOf('fleet') >= 0 ? 'rgba(143,227,168,0.45)'
                : cls.indexOf('belt') >= 0 ? 'rgba(255,209,102,0.40)'
                : cls.indexOf('portal') >= 0 ? 'rgba(170,140,255,0.50)'
                : cls.indexOf('traffic') >= 0 ? 'rgba(120,180,255,0.30)'
                : 'rgba(160,200,255,0.35)';
            ctx.lineWidth = 1 / (camera.scale || 1);
            ctx.setLineDash([4 / (camera.scale || 1), 6 / (camera.scale || 1)]);
            ctx.stroke();
            drawn++;
        }
        ctx.setLineDash([]);
        return drawn;
    }

    function draw(camera) {
        if (!canvas || !ctx) return 0;
        window.__lastCamera = camera || {};
        const cam = camera || {};
        const w = canvas.width, h = canvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (Math.abs(cam.rotX || 0) > 0.5) return 0;     // наклон — остаётся DOM

        const ships = collectFromDom(cam);
        if (!ships.length) return 0;

        const cx = w / 2, cy = h / 2;
        const s = (cam.scale || 1) * dpr;
        ctx.save();
        ctx.translate(cx + (cam.posX || 0) * dpr, cy + (cam.posY || 0) * dpr);
        ctx.scale(s, s);
        window.__canvasRoutes = drawRoutes(ctx, cam);

        let drawn = 0;
        for (let i = 0; i < ships.length; i++) {
            const sh = ships[i];
            if (!isFinite(sh.x) || !isFinite(sh.y)) continue;
            const size = sh.px / (cam.scale || 1);          // постоянный экранный размер
            const img = spriteFor(sh.art);
            ctx.save();
            ctx.globalAlpha = sh.opacity;
            ctx.translate(sh.x, sh.y);
            ctx.rotate((sh.ang || 0) * Math.PI / 180);
            if (img && img.complete && img.naturalWidth) {
                ctx.drawImage(img, -size / 2, -size / 2, size, size);
            } else {
                ctx.fillStyle = sh.side === 'own' ? '#8fe3a8' : '#9fd0ff';
                ctx.beginPath();
                ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            drawn++;
        }
        ctx.restore();
        window.__canvasDrawn = drawn;
        return drawn;
    }

    // КЛИКИ В CANVAS-РЕЖИМЕ: canvas не ловит мышь (не должен перекрывать планеты),
    // поэтому слушаем документ и ищем ближайший борт в экранных координатах.
    let tapPrev = { t: 0, id: '' };
    function nearestShip(clientX, clientY) {
        if (!canvas || !window.__poseCache) return null;
        const rect = canvas.getBoundingClientRect();
        const cam = window.__lastCamera || {};
        const scale = cam.scale || 1;
        const cx = rect.left + rect.width / 2 + (cam.posX || 0);
        const cy = rect.top + rect.height / 2 + (cam.posY || 0);
        let best = null, bestD = 14;
        window.__poseCache.forEach(function (p, id) {
            if (!p || !isFinite(p.x)) return;
            const sx = cx + p.x * scale;
            const sy = cy + p.y * scale;
            const d = Math.hypot(sx - clientX, sy - clientY);
            if (d < bestD) { bestD = d; best = { id: id, p: p }; }
        });
        return best;
    }

    function markerOf(id) {
        try { return document.querySelector('.ship-marker[data-sid="' + id + '"]'); } catch (e) { return null; }
    }

    document.addEventListener('pointerdown', function (ev) {
        if (!document.body.classList.contains('render-canvas')) return;
        if (ev.target && ev.target.closest && ev.target.closest('.control-panel, .left-menu, [id$="-modal"]')) return;
        const hit = nearestShip(ev.clientX, ev.clientY);
        if (!hit) return;
        const el = markerOf(hit.id);
        if (!el) return;
        const now = Date.now();
        const isDouble = tapPrev.id === hit.id && now - tapPrev.t < 450;
        tapPrev = { t: now, id: hit.id };
        el.dispatchEvent(new MouseEvent(isDouble ? 'dblclick' : 'click', {
            bubbles: true, cancelable: true, clientX: ev.clientX, clientY: ev.clientY
        }));
        window.__canvasTap = (window.__canvasTap || 0) + 1;
    }, true);

    global.SceneCanvas = {
        init: ensureCanvas,
        draw: draw,
        stats: function () { return { canvas: !!canvas, sprites: sprites.size }; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
