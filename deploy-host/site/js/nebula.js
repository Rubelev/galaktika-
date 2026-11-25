// ============================================================================
//  NEBULA.JS — уровень «б»: процедурные туманности, звёздная пыль и параллакс.
//
//  Без единого ассета: три canvas-слоя (дальний/средний/ближний), каждый
//  рисуется один раз при смене настроения, а двигается трансформом —
//  поэтому это дешевле, чем перерисовка каждый кадр.
//
//  Что даёт:
//    • объём: туманность из десятков мягких пятен с аддитивным смешением;
//    • глубину: слои двигаются с разной скоростью за курсором/скроллом;
//    • жизнь: ближний слой чуть дышит, звёзды мерцают.
//
//  Ограничения: пауза в невидимой вкладке, отключение при prefers-reduced-motion
//  и на слабых устройствах (тогда остаётся только градиент из backdrops.js).
// ============================================================================
(function (global) {
    'use strict';

    // Палитры туманностей по настроениям (3 цвета: ядро, ореол, пыль)
    const PALETTES = {
        space:  ['#2a4c8f', '#1b3a6b', '#8ab4f8'],
        planet: ['#2b4a70', '#1b2a3f', '#6f9fd8'],
        vegas:  ['#6b2c3a', '#2a1620', '#c9a44c'],
        codex:  ['#1f4a66', '#101e2e', '#5abedc'],
        colony: ['#6b4a22', '#2b2114', '#ffb45a'],
        war:    ['#6b2226', '#2c1214', '#ff8a8a'],
        race:   ['#1f5a66', '#10222c', '#8ff0ff'],
        market: ['#1f6656', '#102420', '#5adcaa']
    };

    let enabled = false;
    let mood = 'space';
    let layers = [];       // {canvas, depth, alpha}
    let raf = 0;
    let t0 = 0;
    let mx = 0, my = 0, tx = 0, ty = 0;

    const lowPower = (function () {
        try {
            const c = navigator.hardwareConcurrency || 8;
            const m = navigator.deviceMemory || 8;
            return c <= 2 || m <= 2;
        } catch (e) { return false; }
    })();
    const reduceMotion = (function () {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
    })();

    function rand(seed) {           // детерминированный «случай»: одна и та же туманность
        let x = seed | 0;
        return function () {
            x = (x * 1664525 + 1013904223) & 0x7fffffff;
            return x / 0x7fffffff;
        };
    }

    function hexToRgb(h) {
        const s = h.replace('#', '');
        return [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)];
    }

    // Рисуем один слой: туманность + пыль
    function paint(canvas, depth, palette, seed) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.ceil(window.innerWidth * (1 + depth * 0.08));
        const h = Math.ceil(window.innerHeight * (1 + depth * 0.08));
        canvas.width = Math.ceil(w * dpr);
        canvas.height = Math.ceil(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const [core, halo, dust] = palette.map(hexToRgb);
        const r = rand(seed);

        // туманность: 26 мягких пятен
        const blobs = 26;
        for (let i = 0; i < blobs; i++) {
            const cx = r() * w;
            const cy = r() * h;
            const rad = (0.12 + r() * 0.32) * Math.min(w, h) * (0.7 + depth * 0.5);
            const a = 0.05 + r() * 0.12;
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
            if (!g) continue;
            const c = (r() > 0.5) ? core : halo;
            g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')');
            g.addColorStop(0.45, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a * 0.45).toFixed(3) + ')');
            g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.fill();
        }

        // пыль: мелкие точки
        const dots = 140 + Math.round(depth * 120);
        for (let i = 0; i < dots; i++) {
            const x = r() * w, y = r() * h;
            const s = 0.5 + r() * 1.6;
            ctx.fillStyle = 'rgba(' + dust[0] + ',' + dust[1] + ',' + dust[2] + ',' + (0.10 + r() * 0.35).toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(x, y, s, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ?nebfx=1 — принудительно включить слой (для проверки и для тех, кто хочет эффект)
    const forceFx = (function () {
        try { return new URLSearchParams(location.search).has('nebfx'); } catch (e) { return false; }
    })();

    function ensure() {
        if (enabled) return true;
        if (!forceFx && (lowPower || reduceMotion)) return false;   // слабым устройствам — только градиент
        const host = document.createElement('div');
        host.id = 'gx-nebula';
        host.style.cssText = 'position:fixed;inset:-6%;z-index:0;pointer-events:none;overflow:hidden';
        const configs = [
            { depth: 0.15, alpha: 0.55 },
            { depth: 0.55, alpha: 0.75 },
            { depth: 1.0, alpha: 0.9 }
        ];
        configs.forEach(function (c, i) {
            const cv = document.createElement('canvas');
            cv.dataset.depth = String(c.depth);
            cv.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
                'opacity:' + c.alpha + ';mix-blend-mode:screen';
            host.appendChild(cv);
            layers.push({ canvas: cv, depth: c.depth, alpha: c.alpha });
        });
        document.body.insertBefore(host, document.body.firstChild);
        enabled = true;
        return true;
    }

    function setMood(name) {
        mood = PALETTES[name] ? name : 'space';
        if (!ensure()) return;
        layers.forEach(function (l, i) {
            paint(l.canvas, l.depth, PALETTES[mood], 1234 + i * 777);
        });
    }

    function loop() {
        raf = 0;
        if (!enabled || document.hidden) return;
        const t = (performance.now() - t0) / 1000;
        tx += (mx - tx) * 0.05;
        ty += (my - ty) * 0.05;
        layers.forEach(function (l) {
            const k = 10 + l.depth * 26;
            const dx = -tx * k + Math.sin(t * 0.04 + l.depth) * (6 + l.depth * 8);
            const dy = -ty * k + Math.cos(t * 0.03 + l.depth) * (4 + l.depth * 6);
            l.canvas.style.transform = 'translate(-50%,-50%) translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
        });
        raf = requestAnimationFrame(loop);
    }

    function start() {
        if (!enabled) return;
        if (!t0) t0 = performance.now();
        if (!raf) raf = requestAnimationFrame(loop);
        window.addEventListener('mousemove', function (e) {
            mx = (e.clientX / window.innerWidth - 0.5) * 2;
            my = (e.clientY / window.innerHeight - 0.5) * 2;
        }, { passive: true });
        window.addEventListener('resize', function () {
            if (!enabled) return;
            layers.forEach(function (l, i) { paint(l.canvas, l.depth, PALETTES[mood], 1234 + i * 777); });
        });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
    }

    function init() {
        // ждём backdrops (он выбирает настроение), затем подхватываем
        const tryApply = function () {
            const m = (global.Backdrops && global.Backdrops.current) ? global.Backdrops.current() : null;
            setMood(m || 'space');
            start();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(tryApply, 60); });
        else setTimeout(tryApply, 60);
    }

    init();
    global.Nebula = { setMood: setMood, enabled: function () { return enabled; }, mood: function () { return mood; } };
})(typeof window !== 'undefined' ? window : globalThis);
