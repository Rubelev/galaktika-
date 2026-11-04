// Кто закрывает планетарный вид: ловим удаление 3D-контейнера со стеком.
(function () {
    if (Element.prototype.__pvTraced) return;
    Element.prototype.__pvTraced = true;
    var orig = Element.prototype.remove;
    Element.prototype.remove = function () {
        if (this && this.id === 'blocks3d-wrap') {
            if (!window.__pvClosedBy) window.__pvClosedBy = new Error().stack;
        }
        return orig.apply(this, arguments);
    };
})();
// Переход «галактика → планета»: эффект полёта и планетарный строительный вид на блоках.
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    // профили планет и лун: палитра грунта, неба, тумана и рельефа
    var WORLD_PROFILES = {
        earth: {
            name: 'Земля', sky: '#9fc0da', fog: 0xa9c6dd, fogNear: 55, fogFar: 165,
            palette: { grass: 0x4f7a3a, grass2: 0x5b8a42, sand: 0xb9a878, water: 0x2c5f8a,
                       rock: 0x8a8d85, snow: 0xd8dee2, road: 0x3a3f44,
                       steel: 0x8d979e, steel2: 0x6d777e, tower: 0x9aa4ab, glass: 0x8fd0ff,
                       ring: 0xffd05a, pad: 0x4a5157, base: 0x3f4750, ice: 0xcfe6f2 },
            water: true, hills: 1.0, snowLine: 10
        },
        moon: {
            name: 'Луна', sky: '#07090c', fog: 0x101418, fogNear: 40, fogFar: 130,
            palette: { grass: 0x8d9196, grass2: 0x7c8085, sand: 0xa7abb0, water: 0x585c60,
                       rock: 0x6b6f74, snow: 0xc9ced3, road: 0x4a4f54,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0x8fd0ff,
                       ring: 0xffd05a, pad: 0x545a60, base: 0x40464c, ice: 0xd7e2ea },
            water: false, hills: 1.4, snowLine: 14
        },
        mars: {
            name: 'Марс', sky: '#c98a63', fog: 0xc98a63, fogNear: 45, fogFar: 140,
            palette: { grass: 0x9c5136, grass2: 0xb06244, sand: 0xc98d63, water: 0x6b4a3a,
                       rock: 0x7a4a37, snow: 0xe8dcd2, road: 0x5c3a2c,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0x8fd0ff,
                       ring: 0xffd05a, pad: 0x4f4038, base: 0x3c322c, ice: 0xe8dcd2 },
            water: false, hills: 1.2, snowLine: 12
        },
        venus: {
            name: 'Венера', sky: '#d8b56a', fog: 0xd8b56a, fogNear: 35, fogFar: 110,
            palette: { grass: 0xb99a52, grass2: 0xc9aa5e, sand: 0xd8c07a, water: 0x8a7442,
                       rock: 0x9a824a, snow: 0xe8dcb0, road: 0x6e5f38,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0xffe9a8,
                       ring: 0xffd05a, pad: 0x5c5236, base: 0x47402a, ice: 0xe8dcb0 },
            water: false, hills: 0.7, snowLine: 14
        },
        titan: {
            name: 'Титан', sky: '#b98a3a', fog: 0xb98a3a, fogNear: 30, fogFar: 100,
            palette: { grass: 0x8a6a2c, grass2: 0x9c7a33, sand: 0xb08a3c, water: 0x4a3a1c,
                       rock: 0x6a5222, snow: 0xc9a552, road: 0x4f4020,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0xffd88a,
                       ring: 0xffd05a, pad: 0x4a3f22, base: 0x38301a, ice: 0xd8c27a },
            water: true, hills: 0.9, snowLine: 12
        },
        europa: {
            name: 'Европа', sky: '#cfe2ee', fog: 0xcfe2ee, fogNear: 40, fogFar: 130,
            palette: { grass: 0xa9c0cc, grass2: 0xbcd2dc, sand: 0xdbe8ee, water: 0x7fa6bd,
                       rock: 0x8fa6b2, snow: 0xf0f6fa, road: 0x6f8b98,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0xbfe8ff,
                       ring: 0xffd05a, pad: 0x546a74, base: 0x40525a, ice: 0xf0f6fa },
            water: true, hills: 0.6, snowLine: 8
        },
        io: {
            name: 'Ио', sky: '#c9b34a', fog: 0xc9b34a, fogNear: 35, fogFar: 120,
            palette: { grass: 0xa8953c, grass2: 0xc4ae48, sand: 0xd8c25a, water: 0x6a5a20,
                       rock: 0x8a7a2c, snow: 0xe8d87a, road: 0x5c501f,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0xffe08a,
                       ring: 0xffd05a, pad: 0x4f4620, base: 0x3a3418, ice: 0xe8d87a },
            water: false, hills: 1.5, snowLine: 14
        },
        ganymede: {
            name: 'Ганимед', sky: '#8a92a0', fog: 0x8a92a0, fogNear: 45, fogFar: 140,
            palette: { grass: 0x767d88, grass2: 0x878e99, sand: 0x9aa1aa, water: 0x545a63,
                       rock: 0x62686f, snow: 0xbfc6ce, road: 0x464b52,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0x8fd0ff,
                       ring: 0xffd05a, pad: 0x4a5057, base: 0x383d43, ice: 0xd0d8e0 },
            water: false, hills: 1.2, snowLine: 11
        },
        enceladus: {
            name: 'Энцелад', sky: '#dfeaf2', fog: 0xdfeaf2, fogNear: 45, fogFar: 150,
            palette: { grass: 0xc4d4de, grass2: 0xd6e4ec, sand: 0xe8f2f7, water: 0x9fbcca,
                       rock: 0xa8b8c2, snow: 0xffffff, road: 0x84969f,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0xbfe8ff,
                       ring: 0xffd05a, pad: 0x5f7079, base: 0x4a5a62, ice: 0xffffff },
            water: true, hills: 0.8, snowLine: 7
        },
        phobos: {
            name: 'Фобос', sky: '#0b0d10', fog: 0x14171a, fogNear: 30, fogFar: 90,
            palette: { grass: 0x6f6357, grass2: 0x7d7062, sand: 0x8d8070, water: 0x3f382f,
                       rock: 0x5a5046, snow: 0xa89a88, road: 0x413a32,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0x8fd0ff,
                       ring: 0xffd05a, pad: 0x453e36, base: 0x332e28, ice: 0xb0a292 },
            water: false, hills: 1.8, snowLine: 16
        },
        kepler: {
            name: 'Кеплер-186f', sky: '#7fa88c', fog: 0x7fa88c, fogNear: 50, fogFar: 160,
            palette: { grass: 0x3f7a4a, grass2: 0x4f8a52, sand: 0xb9c08a, water: 0x2f6a7a,
                       rock: 0x6a7a6a, snow: 0xd8e8d8, road: 0x38443a,
                       steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0x8fd0ff,
                       ring: 0xffd05a, pad: 0x44523f, base: 0x33402f, ice: 0xd8e8d8 },
            water: true, hills: 1.1, snowLine: 12
        }
    };

    // ---------- остальные тела Солнечной системы ----------
    // Короткая таблица: id, имя, цвета грунта, небо, туман, рельеф
    var EXTRA = [
        // планеты
        ['mercury', 'Меркурий', 0x8f8b84, 0x7d7972, 0xa8a49c, 0x5f5b55, '#05070a', 0x0b0f13, 1.7, 9],
        ['jupiter', 'Юпитер', 0xd8b78a, 0xe8c99a, 0xf0dcc0, 0xa88a62, '#c9a878', 0xd8bb90, 0.4, 30],
        ['saturn', 'Сатурн', 0xd8c49a, 0xe8d8b0, 0xf2e6c8, 0xb09a72, '#cdb98e', 0xdccaa0, 0.35, 30],
        ['uranus', 'Уран', 0x8fd0d8, 0xa8e0e8, 0xc8f0f4, 0x6fa8b0, '#a8dce4', 0xb8e4ec, 0.3, 26],
        ['neptune', 'Нептун', 0x4a7fc8, 0x5f92d8, 0x8fb8e8, 0x3560a0, '#3f6fc0', 0x5080cc, 0.3, 26],
        ['pluto', 'Плутон', 0xb8a89a, 0xc8b8aa, 0xd8ccc0, 0x8a7a6c, '#0b0d12', 0x141a22, 1.2, 12],
        // спутники Юпитера
        ['callisto', 'Каллисто', 0x6f6a62, 0x7d7870, 0x8f8a80, 0x545049, '#05070a', 0x0b0f13, 1.6, 12],
        // спутники Сатурна
        ['mimas', 'Мимас', 0xb8bcc0, 0xc8ccd0, 0xd8dce0, 0x94989c, '#05070a', 0x0b0f13, 1.5, 9],
        ['enceladus2', 'Энцелад', 0xd8e4ec, 0xe8f0f6, 0xf4f8fb, 0xb0bcc4, '#070a0e', 0x0d1218, 1.1, 7],
        ['tethys', 'Тефия', 0xc4c8cc, 0xd4d8dc, 0xe4e8ec, 0x9aa0a4, '#05070a', 0x0b0f13, 1.2, 9],
        ['dione', 'Диона', 0xb0b6ba, 0xc0c6ca, 0xd0d6da, 0x8c9296, '#05070a', 0x0b0f13, 1.3, 10],
        ['rhea', 'Рея', 0xbcc2c6, 0xccd2d6, 0xdce2e6, 0x94999d, '#05070a', 0x0b0f13, 1.4, 10],
        ['iapetus', 'Япет', 0x8a8078, 0x9a9088, 0xb0a8a0, 0x5f574f, '#05070a', 0x0b0f13, 1.6, 11],
        // спутники Урана
        ['miranda', 'Миранда', 0xa8b0b8, 0xb8c0c8, 0xc8d0d8, 0x808890, '#070b10', 0x0d131a, 1.5, 9],
        ['ariel', 'Ариэль', 0xc0c8d0, 0xd0d8e0, 0xe0e8f0, 0x98a0a8, '#070b10', 0x0d131a, 1.2, 9],
        ['umbriel', 'Умбриэль', 0x7a7f86, 0x888d94, 0x989da4, 0x5c6168, '#070b10', 0x0d131a, 1.4, 10],
        ['titania', 'Титания', 0xa0a8b0, 0xb0b8c0, 0xc0c8d0, 0x788088, '#070b10', 0x0d131a, 1.3, 10],
        ['oberon', 'Оберон', 0x90969c, 0xa0a6ac, 0xb0b6bc, 0x686e74, '#070b10', 0x0d131a, 1.4, 10],
        // спутники Нептуна
        ['proteus', 'Протей', 0x7a7f84, 0x888d92, 0x989da2, 0x5c6166, '#05070a', 0x0b0f13, 1.7, 10],
        ['triton', 'Тритон', 0xc8c0c8, 0xd8d0d8, 0xe8e0e8, 0xa098a0, '#080a10', 0x0e121a, 1.2, 9],
        ['nereid', 'Нереида', 0x8a9096, 0x989ea4, 0xa8aeb4, 0x646a70, '#05070a', 0x0b0f13, 1.6, 10],
        // Плутон и Харон
        ['charon', 'Харон', 0x9a948c, 0xaaa49c, 0xbab4ac, 0x726c66, '#05070a', 0x0b0f13, 1.5, 11],
        // Марс
        ['deimos', 'Деймос', 0x7a6f62, 0x8a7f72, 0x9a8f82, 0x5c5348, '#05070a', 0x0b0f13, 1.8, 12]
    ];

    var BUILD_PARTS = {
        steel: 0x9aa4ab, steel2: 0x747d84, tower: 0xaab3ba, glass: 0x8fd0ff,
        ring: 0xffd05a, pad: 0x4a5157, base: 0x3f4750, ice: 0xd8e2ea
    };

    EXTRA.forEach(function (e) {
        var id = e[0], name = e[1];
        var ground = e[2], ground2 = e[3], sand = e[4], rock = e[5];
        var sky = e[6], fog = e[7], hills = e[8], snowLine = e[9];
        var ice = rock;
        var starry = sky === '#05070a' || sky === '#070a0e' || sky === '#080a10' || sky === '#070b10' || sky === '#0b0d12';
        var pal = {
            grass: ground, grass2: ground2, sand: sand, water: 0x3a6f8a,
            rock: rock, snow: 0xe8eef2, road: rock, ice: ice
        };
        Object.keys(BUILD_PARTS).forEach(function (k) { pal[k] = BUILD_PARTS[k]; });
        WORLD_PROFILES[id] = {
            name: name, sky: sky,
            fog: (typeof fog === 'string' ? parseInt(fog.replace('#', ''), 16) : fog),
            fogNear: starry ? 34 : 45, fogFar: starry ? 115 : 150,
            palette: pal, water: false, hills: hills, snowLine: snowLine
        };
    });

    var nightOn = false;

    var WORLDS = Object.keys(WORLD_PROFILES).map(function (id) {
        return { id: id, name: WORLD_PROFILES[id].name, profile: WORLD_PROFILES[id] };
    });


    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text) d.textContent = text;
        return d;
    }

    function token() {
        try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; }
    }

    function api(path, body, method) {
        return fetch(path, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }

    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }

    function styles() {
        if (document.getElementById('pv-style')) return;
        var s = document.createElement('style');
        s.id = 'pv-style';
        s.textContent = [
            '#pv-fly{position:fixed;inset:0;z-index:9900;background:#03070c;display:flex;align-items:center;',
            'justify-content:center;overflow:hidden}',
            '#pv-fly .pv-disc{width:26vmin;height:26vmin;border-radius:50%;position:relative;',
            'box-shadow:inset -18px -22px 60px rgba(0,0,0,.65), 0 0 70px rgba(120,190,255,.35);',
            'transition:transform .85s cubic-bezier(.5,.05,.35,1), opacity .85s}',
            '#pv-fly .pv-ring{position:absolute;inset:-14%;border-radius:50%;border:1px solid rgba(140,200,255,.35);',
            'animation:pvSpin 6s linear infinite}',
            '@keyframes pvSpin{to{transform:rotate(360deg)}}',
            '#pv-fly .pv-label{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);',
            'font:700 16px Inter,system-ui,sans-serif;color:#9fd0ff;letter-spacing:.12em;text-transform:uppercase}',
            '#pv-bar{position:fixed;left:0;right:0;bottom:0;z-index:9950;display:none;align-items:center;gap:10px;',
            'padding:10px 14px;background:linear-gradient(rgba(5,12,20,0),rgba(5,12,20,.95));',
            'font:13px Inter,system-ui,sans-serif;color:#dce8f7}',
            '#pv-bar b{color:#ffd05a}',
            '#pv-bar .pv-btn{padding:8px 14px;border-radius:9px;border:none;cursor:pointer;font-weight:700;',
            'background:#2ecc71;color:#04121f}',
            '#pv-bar .pv-btn.ghost{background:#1a2c42;color:#cfe0f5;border:1px solid #2b4a6e}'
        ].join('');
        document.head.appendChild(s);
    }

    function open(worldId) {
        window.__pvClosedBy = null;
        window.__pvOpenedAt = Date.now();
        window.__pvUserExit = false;
        // САМОЛЕЧЕНИЕ: если вид закрылся САМ в первые 3 секунды (без кнопки
        // «↑ К глобусу»), открываем его повторно один раз.
        if (!window.__pvWatch) {
            window.__pvWatch = setInterval(function () {
                if (!window.__pvOpenedAt) return;
                if (Date.now() - window.__pvOpenedAt > 5000) {
                    clearInterval(window.__pvWatch); window.__pvWatch = null; return;
                }
                var w = document.getElementById('blocks3d-wrap');
                if (!w && !window.__pvUserExit && !window.__pvRetried &&
                    Date.now() - window.__pvOpenedAt < 3000) {
                    window.__pvRetried = true;
                    try { open(worldId); } catch (e) { }
                }
            }, 400);
        }
        window.__pvStep = 'open-enter:' + worldId;
        try {
        styles();
        window.__pvStep = 'styles-ok';
        // модуль блоков грузим заранее: иначе спуск падал с «модуль не загрузился»
        if (!window.Blocks3D) {
            import('/js/blocks3d.js').then(function () {
                if (window.Blocks3D) open(worldId);
                else toast('3D-модуль недоступен: нужен WebGL');
            }).catch(function () { toast('3D-модуль недоступен: нужен WebGL'); });
            return;
        }
        window.__pvStep = 'blocks3d-ok';
        var world = null;
        try { world = WORLDS.filter(function (w) { return w.id === worldId; })[0] || profileFromCatalog(worldId) || WORLDS[0]; }
        catch (e) { window.__pvErr = 'WORLDS: ' + e.message; window.__pvStep = 'worlds-fail'; return; }
        window.__pvStep = 'world-ok:' + (world && world.id);
        window.__pvWorld = world && world.id;
        window.__pvRequested = worldId;

        var fly = el('div');
        fly.id = 'pv-fly';
        var disc = el('div', 'pv-disc');
        disc.style.background = 'radial-gradient(circle at 32% 28%, #ffffff22, ' + world.color + ' 55%, #000 100%)';
        var ring = el('div', 'pv-ring');
        disc.appendChild(ring);
        fly.appendChild(disc);
        fly.appendChild(el('div', 'pv-label', 'Спуск на ' + world.name));
        document.body.appendChild(fly);
        window.__pvStep = 'fly-appended';

        // эффект: диск вырастает и «проглатывает» экран.
        // requestAnimationFrame может не сработать (фоновая вкладка, throttling,
        // headless) — тогда спуск «зависал» на диске. Поэтому дублируем таймером.
        var started = false;
        function startDescend() {
            if (started) return;
            started = true;
            window.__pvStep = 'descend-start';
            disc.style.transform = 'scale(9)';
            setTimeout(function () {
                fly.style.background = 'transparent';
                fly.remove();
                // ошибку сцены раньше никто не видел: она терялась в асинхронном
                // вызове, и «спуск» просто ничего не делал
                window.__pvStep = 'scene-call';
                try {
                    planetScene(world);
                    window.__pvStep = 'scene-returned после ' + (window.__pvStep || '?');
                } catch (e) {
                    window.__pvErr = (e && e.message) || String(e);
                    if (typeof toast === 'function') toast('Планетарный вид: ' + window.__pvErr);
                    console.error('planetScene:', e);
                }
            }, 780);
        }
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(startDescend);
        setTimeout(startDescend, 80);
        } catch (e) {
            window.__pvErr = 'open: ' + (e && e.message);
            window.__pvStep = 'open-throw';
            throw e;
        }
    }

    // ---- Земля: ландшафт от горизонта до горизонта и гравитационная платформа ----
    var EARTH_PALETTE = {
        grass: 0x4f7a3a, grass2: 0x5b8a42, sand: 0xb9a878, water: 0x2c5f8a,
        rock: 0x8a8d85, snow: 0xd8dee2, road: 0x3a3f44,
        steel: 0x8d979e, steel2: 0x6d777e, tower: 0x9aa4ab, glass: 0x8fd0ff,
        ring: 0xffd05a, pad: 0x4a5157, base: 0x3f4750
    };

    function noise(x, z) {
        return Math.sin(x * 0.12) * Math.cos(z * 0.11) * 2.2
            + Math.sin(x * 0.31 + 1.7) * Math.cos(z * 0.27 + 0.6) * 1.1
            + Math.sin((x + z) * 0.07) * 1.6;
    }

    // ландшафт под конкретный мир: палитра, вода, высота рельефа
    function buildTerrain(size, radius, profile) {
        var out = [];
        var start = -Math.floor(size / 2);
        var hills = profile.hills || 1;
        var hasWater = !!profile.water;
        var snowLine = profile.snowLine || 12;
        for (var x = start; x < start + size; x++) {
            for (var z = start; z < start + size; z++) {
                var d = Math.sqrt(x * x + z * z);
                if (d > size * 0.62) continue;
                var h = Math.round(noise(x, z) * hills + Math.max(0, (radius - d) * 0.02));

                // ЗОНЫ АРЕНЫ «ТАРСИС»: рельеф не случайный, а размечен по зонам
                if (profile.arena) {
                    // кратерное поле — впадины с валиком
                    for (var ci = 0; ci < 5; ci++) {
                        var cxz = [[-20, 8, 7], [-7, -15, 5], [13, -7, 8], [23, 13, 5], [1, 23, 6]][ci];
                        var cd = Math.hypot(x - cxz[0], z - cxz[1]);
                        if (cd < cxz[2]) {
                            var k = 1 - cd / cxz[2];
                            h -= Math.round(4 * k);
                            if (cd > cxz[2] - 1.6) h += 1;          // кромка кратера
                        }
                    }
                    // каньон: узкая извилистая расщелина
                    var canyonX = -4 + 5 * Math.sin(z / 6);
                    if (Math.abs(x - canyonX) < 2) h = -3;
                    else if (Math.abs(x - canyonX) < 3.2) h = Math.max(1, h);
                    // соляные пустоши: плоская светлая область
                    if (z > 17 && Math.abs(x) < 13) h = 0;
                    // серпантин: наклонная терраса
                    if (x > 8 && x < 15 && z > -4 && z < 10) h = Math.round((x - 8) * 0.8) + 1;
                }

                var type;
                if (profile.arena) {
                    // на арене нет зелени и воды: песок → камень → светлый камень
                    type = h < 0 ? 'sand' : (h < 3 ? 'sand' : (h < 6 ? 'rock' : 'snow'));
                } else if (h <= -1) type = hasWater ? 'water' : 'sand';
                else if (h === 0) type = 'sand';
                else if (h < 4) type = d < 7.5 ? 'road' : 'grass';
                else if (h < 7) type = 'grass2';
                else if (h < snowLine) type = 'rock';
                else type = 'snow';
                out.push({ x: x, y: h - 1, z: z, t: type });
                if (h > 2) out.push({ x: x, y: h - 2, z: z, t: type === 'snow' ? 'ice' : 'rock' });
            }
        }
        return out;
    }

    // гравитационная платформа: основание, шахта, кольцо, причальные фермы
    function buildStation(profile) {
        var out = [];
        var H = 30;   // высота шахты в блоках

        // основание
        for (var x = -6; x <= 6; x++) {
            for (var z = -6; z <= 6; z++) {
                var d = Math.sqrt(x * x + z * z);
                if (d > 6) continue;
                out.push({ x: x, y: 1, z: z, t: d < 3 ? 'pad' : 'base' });
                if (d > 4.4) out.push({ x: x, y: 2, z: z, t: 'steel2' });
            }
        }
        // шахта
        for (var y = 2; y <= H; y++) {
            out.push({ x: 0, y: y, z: 0, t: y % 5 === 0 ? 'ring' : 'tower' });
            out.push({ x: 1, y: y, z: 0, t: 'steel' });
            out.push({ x: -1, y: y, z: 0, t: 'steel' });
            out.push({ x: 0, y: y, z: 1, t: 'steel' });
            out.push({ x: 0, y: y, z: -1, t: 'steel' });
        }
        // кольцевые площадки на разных высотах
        [8, 16, 24, H].forEach(function (yy) {
            for (var a = 0; a < 24; a++) {
                var ang = a / 24 * Math.PI * 2;
                var r = yy === H ? 5 : 3.4;
                var px = Math.round(Math.cos(ang) * r);
                var pz = Math.round(Math.sin(ang) * r);
                out.push({ x: px, y: yy, z: pz, t: yy === H ? 'ring' : 'steel' });
            }
        });
        // верхняя платформа-«тарелка»
        for (var xx = -5; xx <= 5; xx++) {
            for (var zz = -5; zz <= 5; zz++) {
                if (xx * xx + zz * zz > 25) continue;
                out.push({ x: xx, y: H + 1, z: zz, t: 'steel' });
                if (xx * xx + zz * zz <= 9) out.push({ x: xx, y: H + 2, z: zz, t: 'pad' });
            }
        }
        // причальные фермы
        for (var t = 0; t < 6; t++) {
            out.push({ x: 6 + t, y: H - 2, z: 0, t: 'steel2' });
            out.push({ x: -6 - t, y: H - 2, z: 0, t: 'steel2' });
            out.push({ x: 0, y: H - 2, z: 6 + t, t: 'steel2' });
            out.push({ x: 0, y: H - 2, z: -6 - t, t: 'steel2' });
        }
        // огни
        out.push({ x: 0, y: H + 3, z: 0, t: 'glass' });
        
            // миры без воды: термоядерную станцию охлаждают радиаторы, а не градирни
            if (!profile.water) {
                var R = 6.2;
                for (var a2 = 0; a2 < 40; a2++) {
                    var ang2 = a2 / 40 * Math.PI * 2;
                    var rx = Math.round(Math.cos(ang2) * (R + 4));
                    var rz = Math.round(Math.sin(ang2) * (R + 4));
                    out.push({ x: rx, y: 1, z: rz, t: 'steel2' });
                    out.push({ x: rx, y: 2, z: rz, t: 'glass' });
                }
            }
return out;
    }

    // какому миру какая панорама неба
    var SKY_FILES = {
        earth: 'earth-day', mars: 'mars-day', moon: 'moon-day', venus: 'venus-day',
        mercury: 'mercury-day', io: 'io-day', europa: 'europa-day', ganymede: 'ganymede-day',
        callisto: 'callisto-day', titan: 'titan-day', enceladus: 'enceladus-day',
        triton: 'triton-day', phobos: 'phobos-day', deimos: 'phobos-day',
        jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune',
        pluto: 'pluto', charon: 'charon'
    };

    function skyFor(world, night) {
        var id = world.id || 'earth';
        var file = SKY_FILES[id] || 'earth-day';
        if (night) {
            var nightFile = file.replace('-day', '-night');
            if (nightFile !== file) return '/images/skies/' + nightFile + '.webp';
        }
        return '/images/skies/' + file + '.webp';
    }

    function planetScene(world) {
        window.__pvStep = 'scene-enter';
        if (!window.Blocks3D) {
            // модуль может ещё грузиться — ждём его, а не выходим молча
            window.__pvStep = 'scene-wait-blocks3d';
            var tries = (window.__pvTries = (window.__pvTries || 0) + 1);
            if (tries <= 20) {
                setTimeout(function () { planetScene(world); }, 200);
                return;
            }
            window.__pvStep = 'scene-no-blocks3d';
            toast('Модуль блоков не загрузился');
            return;
        }
        window.__pvStep = 'scene-blocks3d-ok';
        var profile = world.profile || WORLD_PROFILES.earth;

        var bar = el('div');
        bar.id = 'pv-bar';
        bar.style.display = 'flex';

        var pick = el('select');
        pick.style.cssText = 'padding:6px 10px;border-radius:7px;background:#0b1622;color:#dce8f7;' +
            'border:1px solid #24405f;font:12px Inter,system-ui,sans-serif';
        WORLDS.forEach(function (w) {
            var o = el('option', null, w.name);
            o.value = w.id;
            if (w.id === world.id) o.selected = true;
            pick.appendChild(o);
        });
        pick.onchange = function () {
            var next = WORLDS.filter(function (w) { return w.id === pick.value; })[0];
            var wrapEl = document.getElementById('design-wrap');
            var b3d = document.getElementById('blocks3d-wrap');
            if (b3d) b3d.remove();
            bar.remove();
            if (next) planetScene(next);
        };
        bar.appendChild(pick);

        var title = el('span');
        title.innerHTML = '🌍 <b>' + profile.name + '</b> · горизонт из блоков · ЛКМ ставит, ПКМ убирает';
        bar.appendChild(title);

        var save = el('button', 'pv-btn', 'Сохранить застройку');
        save.onclick = function () {
            var script = window.Blocks3D.scriptOf();
            api('/api/planet/save', { world: world.id, script: script }).then(function (res) {
                if (!res || res.error) { toast(res && res.error ? res.error : 'не сохранилось'); return; }
                toast('Застройка «' + profile.name + '» сохранена');
            });
        };
        bar.appendChild(save);

        var night = el('button', 'pv-btn ghost', '🌙 Ночь');
        night.onclick = function () {
            nightOn = !nightOn;
            night.textContent = nightOn ? '☀️ День' : '🌙 Ночь';
            var wrapEl = document.getElementById('blocks3d-wrap');
            if (wrapEl) wrapEl.remove();
            bar.remove();
            planetScene(world);
        };
        bar.appendChild(night);

        // ---- масштаб ----
        var zoomBox = el('div');
        zoomBox.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 6px;' +
            'border:1px solid #24405f;border-radius:9px;background:#0a1520';
        var zoomOut = el('button', 'pv-btn ghost', '−');
        zoomOut.style.cssText = 'padding:4px 10px;font-size:15px;line-height:1';
        var zoomIn = el('button', 'pv-btn ghost', '+');
        zoomIn.style.cssText = 'padding:4px 10px;font-size:15px;line-height:1';
        var zoomLabel = el('span');
        zoomLabel.id = 'pv-zoom';
        zoomLabel.style.cssText = 'min-width:86px;text-align:center;font:700 12px monospace;color:#9fd0ff';
        zoomLabel.textContent = 'в кадре ~20 м';
        zoomOut.onclick = function () {
            if (window.Blocks3D && window.Blocks3D.zoomBy) window.Blocks3D.zoomBy(1.3);
        };
        zoomIn.onclick = function () {
            if (window.Blocks3D && window.Blocks3D.zoomBy) window.Blocks3D.zoomBy(0.77);
        };
        zoomBox.appendChild(zoomOut);
        zoomBox.appendChild(zoomLabel);
        zoomBox.appendChild(zoomIn);
        bar.appendChild(zoomBox);

        // обновление подписи масштаба: 1 блок = 0,5 м, экран ≈ 40 блоков при радиусе 12
        function paintZoom(r) {
            var radius = r || (window.Blocks3D && window.Blocks3D.camRadius ? window.Blocks3D.camRadius() : 12);
            // 1 блок = 0,5 м; в кадре по высоте примерно 1,6 радиуса в блоках
            var metres = Math.max(2, Math.round(radius * 1.6 * 0.5));
            zoomLabel.textContent = 'в кадре ~' + metres + ' м';
        }
        paintZoom();
        if (window.PlanetView) window.PlanetView.onZoom = paintZoom;

        // перемещение вида влево/вправо (панорама) и переход к точке клика
        var panL = el('button', 'pv-btn', '←');
        panL.title = 'Сдвинуть вид влево';
        panL.onclick = function () { if (window.Blocks3D && window.Blocks3D.panBy) window.Blocks3D.panBy(-5, 0); };
        bar.appendChild(panL);
        var panR = el('button', 'pv-btn', '→');
        panR.title = 'Сдвинуть вид вправо';
        panR.onclick = function () { if (window.Blocks3D && window.Blocks3D.panBy) window.Blocks3D.panBy(5, 0); };
        bar.appendChild(panR);

        var back = el('button', 'pv-btn ghost', '↑ К глобусу');
        back.title = 'Вернуться в Солнечную систему';
        back.onclick = exitToGalaxy(world, bar);
        bar.appendChild(back);
        document.body.appendChild(bar);
        // прячем панели вселенной ТОЛЬКО если 3D-сцена реально открылась:
        // иначе игрок останется без интерфейса и без выхода
        setTimeout(function () {
            if (document.getElementById('blocks3d-wrap')) {
                document.body.classList.add('pv-mode');
                // Прячем солнечную сцену полностью: раньше она оставалась в DOM
                // и при любом сбое наложения «выигрывала» — игрока возвращало на карту.
                var sc = document.querySelector('.solar-system-container');
                if (sc) { sc.dataset.pvHidden = '1'; sc.style.display = 'none'; }
            }
        }, 700);
        // точка, по которой щёлкнули на глобусе: сдвигаем вид к ней
        if (window.__pvPoint) {
            var tries = 0;
            var applyPoint = setInterval(function () {
                if (window.Blocks3D && window.Blocks3D.setPan) {
                    var px = Math.max(-120, Math.min(120, (window.__pvPoint.lon || 0) * 1.6));
                    var pz = Math.max(-120, Math.min(120, -(window.__pvPoint.lat || 0) * 1.6));
                    window.Blocks3D.setPan(px, pz);
                    clearInterval(applyPoint);
                } else if (++tries > 40) clearInterval(applyPoint);
            }, 200);
        }
        window.__pvStep = 'bar-appended';
        if (window.PlanetView && window.PlanetView.onZoom) {
            setTimeout(function () { paintZoom(); }, 400);
        }

        // коэффициент дистанции камеры: √(R/6371), в разумных границах
        var camK = 1;
        try {
            var cat = (window.CATALOG && (window.CATALOG.bodies || window.CATALOG)) || [];
            var cb = (cat || []).filter(function (x) { return x.id === worldId; })[0];
            var R = cb && Number(cb.radius_km);
            if (R && isFinite(R)) camK = Math.max(0.35, Math.min(2.2, Math.sqrt(R / 6371)));
        } catch (e) { }

        var terrain = buildTerrain(150, 34, profile);
        var groundY = Math.round(noise(0, 0) * (profile.hills || 1) + 0.68);
        var station = buildStation(profile).map(function (b) {
            return { x: b.x, y: b.y + groundY, z: b.z, t: b.t };
        });

        var nightPal = {};
        Object.keys(profile.palette).forEach(function (k) {
            var c = profile.palette[k];
            var r = ((c >> 16) & 255) * 0.45, g2 = ((c >> 8) & 255) * 0.5, b2 = (c & 255) * 0.7;
            nightPal[k] = (Math.round(r) << 16) | (Math.round(g2) << 8) | Math.round(b2);
        });
        window.__pvStep = 'before-blocks3d-open';
        window.Blocks3D.open({
            skyTexture: skyFor(world),
            editor: true,
            title: (nightOn ? '🌙 ' : '🌍 ') + profile.name + ' · гравитационная платформа',
            terrain: terrain,
            blocks: station,
            palette: nightOn ? nightPal : profile.palette,
            fog: { color: nightOn ? 0x090d14 : profile.fog, near: profile.fogNear, far: profile.fogFar },
            sky: nightOn ? 0x05070a : profile.sky,
            // КАМЕРА ПОД РАЗМЕР ТЕЛА: мелкие тела (Фобос, Харон) — ближе,
            // крупные (Нептун, Сатурн) — дальше, чтобы поверхность занимала кадр
            camera: [46 * camK, 30 * camK, 56 * camK],
            target: [0, groundY + 16, 0]
        });

        window.__pvWrapNow = !!document.getElementById('blocks3d-wrap');
        window.__pvStep = 'open-called wrap=' + window.__pvWrapNow +
            ' fn=' + (typeof window.Blocks3D.open) +
            ' radius=' + (window.Blocks3D.camRadius ? window.Blocks3D.camRadius() : 'n/a');
        toast('«' + profile.name + '»: ландшафт ' + terrain.length + ' блоков, станция 43 детали');

        // Отдаление колесом за пределы глобуса закрывает вид и возвращает систему —
        // зеркально правилу «зум ×9 открывает глобус».
        var startRadius = window.Blocks3D.camRadius ? window.Blocks3D.camRadius() : 12;
        // Автозакрытие по зуму отключено: оно срабатывало сразу после старта
        // (камера стоит далеко и радиус больше порога) и «выбрасывало» игрока
        // обратно в систему. Выход — только кнопкой «↑ К глобусу».

    }

    // ПОВЕРХНОСТЬ ДЛЯ ЛЮБОГО ТЕЛА: если в WORLDS нет профиля, строим его из
// каталога (цвет, класс, размер) — иначе все карликовые показывали Землю.
function profileFromCatalog(worldId) {
    var cat = (window.CATALOG && (window.CATALOG.bodies || window.CATALOG)) || [];
    var b = (cat || []).filter(function (x) { return x.id === worldId; })[0];
    var base = (b && b.color) || '#8fa8c0';
    var kind = (b && b.class) || 'planet';
    // АРЕНА ГОНОК «ТАРСИС» (луна Адрастея): камень, пыль, кратеры — без воды и зелени
    var isArena = (b && b.role === 'arena') || worldId === 'adrasteya';
    if (isArena) {
        return {
            id: worldId,
            arena: true,
            name: 'Тарсис · арена гонок (Адрастея)',
            color: '#8a7a68',
            hills: 1.6,
            fog: '#c9a06a', fogNear: 14, fogFar: 95,
            sky: '#c9a06a',
            palette: {
                grass: '#6b5c4c', grass2: '#7d6c58',
                sand: '#d8cbb0', water: '#4a4038',
                rock: '#5a4f45', snow: '#e8dfcf'
            }
        };
    }
    var hills = kind === 'moon' ? 0.6 : (kind === 'dwarf' || kind === 'asteroid' ? 0.8 : 1.0);
    function shade(hex, k) {
        var n = parseInt(String(hex).replace('#', ''), 16);
        var r = Math.max(0, Math.min(255, ((n >> 16) & 255) * k));
        var g = Math.max(0, Math.min(255, ((n >> 8) & 255) * k));
        var bb = Math.max(0, Math.min(255, (n & 255) * k));
        return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(bb) + ')';
    }
    return {
        id: worldId,
        name: (b && b.name) || worldId,
        color: base,
        hills: hills,
        fog: base,
        fogNear: 18,
        fogFar: 120,
        sky: shade(base, 0.35),
        palette: {
            grass: shade(base, 0.85), grass2: shade(base, 1.0),
            sand: shade(base, 1.15), water: shade(base, 0.55),
            rock: shade(base, 0.7), snow: shade(base, 1.3)
        }
    };
}

// ДОПОЛНЯЕМ СПИСОК МИРОВ ИЗ КАТАЛОГА: иначе карликовые и астероиды
// падали в fallback и показывали Землю («Земля · Мегаполис»).
function ensureWorldsFromCatalog() {
    try {
        var c = window.CATALOG;
        var list = (c && (c.bodies || c)) || [];
        list.forEach(function (b) {
            if (!b || !b.id) return;
            var has = WORLDS.some(function (w) { return w.id === b.id; });
            if (!has) WORLDS.push(profileFromCatalog(b.id));
        });
    } catch (e) { }
}
setInterval(ensureWorldsFromCatalog, 1500);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureWorldsFromCatalog);
else ensureWorldsFromCatalog();

function exitToGalaxy(world, bar) {
        return function () {
            window.__pvUserExit = true;
            window.__pvOpenedAt = 0;
            window.__pvRetried = false;
            document.body.classList.remove('pv-mode');
            var sc2 = document.querySelector('.solar-system-container');
            if (sc2 && sc2.dataset.pvHidden) { sc2.style.display = ''; delete sc2.dataset.pvHidden; }
            var wrap = document.getElementById('blocks3d-wrap');
            if (wrap) wrap.remove();
            if (bar) bar.remove();
            // возвращаем масштаб системы, иначе зум ×9 сразу откроет глобус снова
            if (typeof window.solarReset === 'function') window.solarReset();
            var fly = el('div');
            fly.id = 'pv-fly';
            fly.style.background = 'transparent';
            var disc = el('div', 'pv-disc');
            disc.style.background = 'radial-gradient(circle at 32% 28%, #ffffff22, ' + world.color + ' 55%, #000 100%)';
            disc.style.transform = 'scale(9)';
            fly.appendChild(disc);
            document.body.appendChild(fly);
            requestAnimationFrame(function () {
                disc.style.transform = 'scale(0.15)';
                disc.style.opacity = '0';
            });
            setTimeout(function () {
                fly.remove();
                if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
            }, 760);
        };
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('pv-btn')) return;
        var b = el('button', 'menu-btn', '🪐 Планетарный вид');
        b.id = 'pv-btn';
        b.setAttribute('data-tip', 'Планета|Спуск на планету и стройка из блоков');
        b.onclick = function () {
            var u = null;
            try { u = window.getCurrentUser ? window.getCurrentUser() : null; } catch (e) { }
            var world = (u && u.colony && u.colony.world) ? u.colony.world : 'earth';
            // открываем вид в отдельной вкладке: карта остаётся на месте
            var win = null;
            try { win = window.open(location.pathname + '?pv=' + encodeURIComponent(world), '_blank'); } catch (e) { win = null; }
            if (!win) open(world);
        };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.PlanetView = { open: open, worlds: WORLDS };

    if (/[?&]planet=([a-z0-9_-]+)/.test(location.search)) {
        var pid = location.search.match(/[?&]planet=([a-z0-9_-]+)/)[1];
        if (/[?&]night=1/.test(location.search)) nightOn = true;
        var hideStyle = document.createElement('style');
        hideStyle.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(hideStyle);
        setTimeout(function () {
            ['welcome-screen', 'auth-overlay', 'legend-overlay', 'tut-modal'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
            open(pid);
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
