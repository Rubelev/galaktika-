// ============================================================================
//  BACKDROPS.JS — фоны-настроения для экранов игры.
//
//  Уровень «а»: без картинок и без тяжёлых ассетов — только CSS-градиенты,
//  виньетка и мягкая пыль. Даёт «не чёрный экран» за 0 КБ трафика.
//
//  Как работает:
//    • создаёт фиксированный слой #gx-backdrop под интерфейсом (z-index 0);
//    • выбирает настроение по экрану (?pv=, ?vegas=1, ?worldtour=1, ...);
//    • можно переключить вручную: window.Backdrops.apply('vegas').
//
//  Важно: слой не перекрывает 3D-сцены (у них свои canvas выше по z-index),
//  он виден за панелями и модалками — там, где раньше был чёрный фон.
//  Уважает prefers-reduced-motion (без анимации) и экономию батареи.
// ============================================================================
(function (global) {
    'use strict';

    const MOODS = {
        // глубина космоса — сцена Солнечной системы
        space: {
            base: 'radial-gradient(1200px 800px at 50% 8%, #101c33 0%, #070c17 45%, #03060c 100%)',
            glow: 'radial-gradient(700px 500px at 12% 82%, rgba(80,140,220,.16), transparent 70%)',
            dust: 'radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,.5), transparent 60%)'
        },
        // планета в дымке
        planet: {
            base: 'radial-gradient(900px 700px at 70% 30%, #1b2a3f 0%, #0a1220 55%, #04070e 100%)',
            glow: 'radial-gradient(800px 600px at 18% 78%, rgba(120,190,255,.18), transparent 70%)',
            dust: 'radial-gradient(3px 3px at 35% 60%, rgba(190,230,255,.45), transparent 60%)'
        },
        // Кеп-Вегас: бордо, латунь, тёплая пыль
        vegas: {
            base: 'radial-gradient(1100px 700px at 50% 15%, #2a1620 0%, #160b12 50%, #070409 100%)',
            glow: 'radial-gradient(700px 500px at 82% 76%, rgba(230,190,110,.22), transparent 72%)',
            dust: 'radial-gradient(2px 2px at 68% 28%, rgba(255,225,160,.55), transparent 60%)'
        },
        // энциклопедия: синь и лёгкая голография
        codex: {
            base: 'radial-gradient(1000px 700px at 40% 10%, #101e2e 0%, #08111c 55%, #03070c 100%)',
            glow: 'radial-gradient(600px 400px at 75% 80%, rgba(90,190,220,.18), transparent 70%)',
            dust: 'radial-gradient(2px 2px at 25% 70%, rgba(160,220,255,.4), transparent 60%)'
        },
        // колония: янтарь и тепло
        colony: {
            base: 'radial-gradient(1000px 700px at 60% 20%, #2b2114 0%, #171009 55%, #070506 100%)',
            glow: 'radial-gradient(700px 500px at 20% 80%, rgba(255,180,90,.20), transparent 72%)',
            dust: 'radial-gradient(2px 2px at 40% 40%, rgba(255,220,170,.45), transparent 60%)'
        },
        // Вармир: кровь и металл
        war: {
            base: 'radial-gradient(1000px 700px at 50% 18%, #2c1214 0%, #180a0c 55%, #070405 100%)',
            glow: 'radial-gradient(700px 500px at 80% 80%, rgba(220,80,70,.20), transparent 72%)',
            dust: 'radial-gradient(2px 2px at 30% 60%, rgba(255,170,150,.4), transparent 60%)'
        },
        // Тарсис: скорость и лёд
        race: {
            base: 'radial-gradient(1000px 700px at 45% 12%, #10222c 0%, #0a1520 55%, #04080c 100%)',
            glow: 'radial-gradient(700px 500px at 70% 78%, rgba(90,220,230,.20), transparent 72%)',
            dust: 'radial-gradient(2px 2px at 60% 35%, rgba(170,245,255,.5), transparent 60%)'
        },
        // рынок: бирюза, сделки
        market: {
            base: 'radial-gradient(1000px 700px at 55% 18%, #102420 0%, #0a1613 55%, #04080a 100%)',
            glow: 'radial-gradient(700px 500px at 25% 78%, rgba(90,220,170,.18), transparent 72%)',
            dust: 'radial-gradient(2px 2px at 45% 55%, rgba(170,255,220,.4), transparent 60%)'
        }
    };

    let layer = null;
    let glowLayer = null;
    let current = null;
    const reduceMotion = (function () {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
    })();

    // Слабые устройства: без свечения и «дыхания», только базовый градиент
    const lowPower = (function () {
        try {
            const cores = navigator.hardwareConcurrency || 8;
            const mem = navigator.deviceMemory || 8;
            return cores <= 2 || mem <= 2;
        } catch (e) { return false; }
    })();

    function ensure() {
        if (layer) return;
        layer = document.createElement('div');
        layer.id = 'gx-backdrop';
        layer.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;transition:opacity .5s';
        glowLayer = document.createElement('div');
        glowLayer.id = 'gx-backdrop-glow';
        glowLayer.style.cssText = 'position:fixed;inset:-10%;z-index:0;pointer-events:none;' +
            'mix-blend-mode:screen;opacity:.85;transition:opacity .6s';
        document.body.appendChild(layer);
        document.body.appendChild(glowLayer);
    }

    function apply(name) {
        const m = MOODS[name] || MOODS.space;
        if (!document.body) { document.addEventListener('DOMContentLoaded', function () { apply(name); }); return; }
        ensure();
        current = name;
        layer.style.background = m.base;
        glowLayer.style.background = lowPower ? 'none' : m.glow;
        glowLayer.style.display = lowPower ? 'none' : 'block';
        // вежливо к глазу: панели и текст не должны «плыть» под фоном
        document.documentElement.setAttribute('data-mood', name);
        // уровень «б»: если подключён nebula.js — переключить туманность
        if (global.Nebula && typeof global.Nebula.setMood === 'function') {
            try { global.Nebula.setMood(name); } catch (e) { }
        }
    }

    // Выбор настроения по экрану
    function detect() {
        const p = new URLSearchParams(location.search);
        if (p.has('vegas') || p.has('casino')) return 'vegas';
        if (p.has('worldtour')) return 'space';
        // ?world=war|race приходит от экрана зрелищ: раньше оба падали в синий 'space'
        const world = (p.get('world') || '').toLowerCase();
        if (world === 'war') return 'war';
        if (world === 'race' || world === 'tarsis') return 'race';
        if (p.has('pv')) return 'planet';
        if (p.has('tour')) return 'planet';
        if (p.has('system') || p.has('war')) return 'war';
        if (p.has('race') || p.has('tarsis')) return 'race';
        if (p.has('colony')) return 'colony';
        if (p.has('market')) return 'market';
        return 'space';
    }

    // Лёгкое «дыхание» фона (отключается при reduce-motion и в фоне вкладки)
    let t0 = performance.now();
    function breathe() {
        if (reduceMotion || lowPower || document.hidden) { requestAnimationFrame(breathe); return; }
        const t = (performance.now() - t0) / 1000;
        if (glowLayer) glowLayer.style.transform = 'translate(' + Math.sin(t * 0.05) * 6 + 'px,' + Math.cos(t * 0.04) * 5 + 'px)';
        requestAnimationFrame(breathe);
    }

    function init() {
        apply(detect());
        requestAnimationFrame(breathe);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    global.Backdrops = { apply: apply, detect: detect, moods: Object.keys(MOODS),
        lowPower: function () { return lowPower; }, current: function () { return current; } };
})(typeof window !== 'undefined' ? window : globalThis);
