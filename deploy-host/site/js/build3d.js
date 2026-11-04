// Планетарный конструктор: постройки из кубиков, кубики ресурсов и вода.
// ?build=1&world=earth&tab=city|res|water
(function () {
    'use strict';

    if (/[?&]safe=1/.test(location.search)) return;

    var THREE = null, renderer = null, scene = null, camera = null;
    var wrap = null, raf = 0, t0 = 0;
    var world = 'earth', tab = 'city';
    var waterBlocks = [], smokePuffs = [], flags = [];
    var roadBlocks = [], vehicles = [];
    var PLANET_R = 150;                       // радиус кривизны поверхности
    function curveY(x, z) { return -(x * x + z * z) / (2 * PLANET_R); }

    var PAL = {
        earth: { sky: 0x9fc0da, fog: 0xa9c6dd, ground: 0x4f7a3a, ground2: 0x5b8a42, rock: 0x8a8d85,
                 water: 0x3f93cc, light: 0xfff4e0, ambient: 0.9 },
        moon: { sky: 0x05070a, fog: 0x0c1014, ground: 0x8d9196, ground2: 0x7c8085, rock: 0x6b6f74,
                water: 0x527d94, light: 0xe8f0ff, ambient: 0.75 }
    };

    var C = {
        wall: 0xd8d2c4, wall2: 0xc2bbab, roof: 0x8a4b3c, roof2: 0x6f3a2e,
        steel: 0x9aa4ab, steel2: 0x6d777e, dark: 0x3a4046, glass: 0x8fd0ff,
        wood: 0xa8743a, green: 0x3f8a4a, yellow: 0xd8a41c, red: 0xc9362b,
        concrete: 0xb8bec2, concrete2: 0x9aa0a4, white: 0xe8ecef, chrome: 0xc9d2d8
    };

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    function bx(w, h, d, color, x, y, z, opts) {
        var mat = new THREE.MeshLambertMaterial({ color: color });
        if (opts && opts.emissive) {
            mat.emissive = new THREE.Color(opts.emissive);
            mat.emissiveIntensity = opts.intensity || 0.7;
        }
        if (opts && opts.opacity !== undefined) { mat.transparent = true; mat.opacity = opts.opacity; }
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x || 0, y || 0, z || 0);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    }

    // ---------- постройки ----------
    var BUILDERS = {
        house: function (g) {
            var W = 5, D = 4, H = 4.5;
            g.add(bx(W, 0.5, D, C.concrete, 0, 0.25, 0));
            for (var f = 0; f < 3; f++) {
                var y = 1.2 + f * 1.3;
                g.add(bx(W, 1.1, D, f === 1 ? C.wall2 : C.wall, 0, y, 0));
                for (var w = -1; w <= 1; w++) {
                    g.add(bx(0.7, 0.5, 0.12, C.glass, w * 1.5, y, D / 2 + 0.02, { emissive: 0xffd98a, intensity: 0.35 }));
                }
            }
            g.add(bx(W + 0.6, 0.4, D + 0.6, C.roof, 0, 5.1, 0));
            g.add(bx(W - 0.6, 0.5, D - 0.6, C.roof2, 0, 5.6, 0));
            g.add(bx(0.9, 1.6, 0.14, C.wood, 0, 1.0, D / 2 + 0.05));
            g.add(bx(0.5, 0.9, 0.5, C.steel2, 1.6, 5.9, -0.8));
            return { name: 'Жилой дом', note: 'три этажа, 9 окон, вход' };
        },
        farm: function (g) {
            g.add(bx(7, 0.4, 5, C.green, 0, 0.2, 0));
            for (var r = -2; r <= 2; r++) {
                g.add(bx(6, 0.25, 0.5, C.wood, 0, 0.5, r * 0.9));
                for (var i = 0; i < 6; i++) {
                    g.add(bx(0.3, 0.6, 0.3, 0x2f7a3a, -2.5 + i, 0.9, r * 0.9));
                }
            }
            // теплица
            for (var k = 0; k < 3; k++) {
                g.add(bx(3.4, 1.6, 0.1, C.glass, 0, 1.2 + k * 0.05, -2.6 + k * 1.3, { opacity: 0.45 }));
            }
            g.add(bx(3.6, 0.2, 4.2, C.steel, 0, 2.2, -1.9));
            // силос
            g.add(bx(1.4, 3.2, 1.4, C.concrete, 3.4, 1.8, -1.6));
            g.add(bx(1.6, 0.3, 1.6, C.steel2, 3.4, 3.5, -1.6));
            return { name: 'Ферма', note: 'грядки, теплица, силос' };
        },
        factory: function (g) {
            g.add(bx(9, 0.5, 6, C.concrete2, 0, 0.25, 0));
            g.add(bx(8, 3.2, 5, C.wall2, 0, 2, 0));
            g.add(bx(8.6, 0.4, 5.6, C.steel, 0, 3.9, 0));
            for (var i = 0; i < 4; i++) {
                g.add(bx(0.9, 1.1, 0.12, C.glass, -2.7 + i * 1.8, 2.2, 2.55, { emissive: 0x9fe0ff, intensity: 0.3 }));
            }
            // трубы
            [[-2.6, -1.4], [0, -1.4], [2.6, -1.4]].forEach(function (p) {
                g.add(bx(0.9, 4.2, 0.9, C.concrete, p[0], 5.6, p[1]));
                g.add(bx(1.1, 0.3, 1.1, C.red, p[0], 7.8, p[1]));
                var puff = bx(1.2, 1.2, 1.2, 0xdfe6ea, p[0], 8.6, p[1], { opacity: 0.5 });
                puff.userData.smoke = true;
                puff.userData.baseY = 8.6;
                g.add(puff);
                smokePuffs.push(puff);
            });
            g.add(bx(4, 1.2, 1.2, C.dark, 0, 1.4, 3.2));
            return { name: 'Завод', note: 'цех, три трубы, рольганг' };
        },
        mine: function (g) {
            g.add(bx(5, 0.4, 5, C.rock, 0, 0.2, 0));
            g.add(bx(3.2, 1.6, 3.2, C.dark, 0, 1.0, 0));
            for (var i = 0; i < 4; i++) {
                var x = -1.6 + (i % 2) * 3.2, z = -1.6 + Math.floor(i / 2) * 3.2;
                g.add(bx(0.3, 6, 0.3, C.steel2, x, 4.2, z));
            }
            g.add(bx(3.8, 0.3, 0.3, C.steel2, 0, 7.2, -1.6));
            g.add(bx(0.3, 0.3, 3.8, C.steel2, -1.6, 7.2, 0));
            g.add(bx(0.3, 0.3, 3.8, C.steel2, 1.6, 7.2, 0));
            var wheel = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.18, 8, 16),
                new THREE.MeshLambertMaterial({ color: C.yellow }));
            wheel.position.set(0, 7.4, 0);
            g.add(wheel);
            // руда
            [[2.6, 1.4], [3.1, 1.1], [2.4, 2.1]].forEach(function (p) {
                g.add(bx(0.7, 0.5, 0.7, 0x8a6a3a, p[0], 0.6, p[1]));
            });
            return { name: 'Шахта', note: 'копёр, шкив, отвал руды' };
        },
        warehouse: function (g) {
            g.add(bx(8, 0.4, 6, C.concrete, 0, 0.2, 0));
            g.add(bx(7.4, 3.4, 5.4, C.wall2, 0, 2, 0));
            g.add(bx(7.8, 0.35, 5.8, C.roof, 0, 3.9, 0));
            for (var i = 0; i < 3; i++) {
                g.add(bx(1.8, 2.4, 0.15, C.dark, -2.4 + i * 2.4, 1.6, 2.75));
            }
            [[-3, 1], [3, 1], [-3, 2.2], [3, 2.2]].forEach(function (p) {
                g.add(bx(1, 1, 1, C.wood, p[0], 0.9, p[1]));
                g.add(bx(1.05, 0.1, 1.05, C.roof2, p[0], 1.45, p[1]));
            });
            return { name: 'Склад', note: 'ангар, ворота, паллеты' };
        },
        power: function (g) {
            g.add(bx(6, 0.4, 6, C.concrete2, 0, 0.2, 0));
            g.add(bx(2.6, 2.6, 2.6, C.white, 0, 1.6, 0));
            g.add(bx(2.8, 0.3, 2.8, C.steel, 0, 3.0, 0));
            // купол
            g.add(bx(2, 0.8, 2, C.chrome, 0, 3.5, 0));
            g.add(bx(1.2, 0.6, 1.2, C.chrome, 0, 4.1, 0));
            // градирни
            [[-3.4, -1.6], [-3.4, 1.6]].forEach(function (p) {
                g.add(bx(1.6, 2.4, 1.6, C.concrete, p[0], 1.4, p[1]));
                g.add(bx(2.0, 0.9, 2.0, C.concrete2, p[0], 3.0, p[1]));
                var puff = bx(1.4, 1.4, 1.4, 0xe8eef2, p[0], 4.1, p[1], { opacity: 0.45 });
                puff.userData.smoke = true;
                puff.userData.baseY = 4.1;
                g.add(puff);
                smokePuffs.push(puff);
            });
            // солнечные панели
            for (var i = 0; i < 3; i++) {
                var pan = bx(1.8, 0.12, 1.2, 0x2b4a6e, 2.6, 0.9, -1.6 + i * 1.6);
                pan.rotation.x = -0.35;
                g.add(pan);
                g.add(bx(0.12, 0.8, 0.12, C.steel2, 2.6, 0.5, -1.6 + i * 1.6));
            }
            return { name: 'Электростанция', note: 'реактор, градирни, солнечные панели' };
        },
        defense: function (g) {
            g.add(bx(3.2, 0.5, 3.2, C.concrete2, 0, 0.25, 0));
            for (var y = 0; y < 5; y++) {
                g.add(bx(2.4 - y * 0.12, 1, 2.4 - y * 0.12, y % 2 ? C.steel2 : C.steel, 0, 1 + y, 0));
            }
            g.add(bx(2.6, 0.4, 2.6, C.dark, 0, 6.1, 0));
            // турель
            g.add(bx(1.2, 0.8, 1.2, C.steel, 0, 6.7, 0));
            var barrel = bx(0.24, 0.24, 2.4, C.dark, 0, 6.9, 1.2);
            g.add(barrel);
            // антенна
            g.add(bx(0.16, 2.6, 0.16, C.chrome, -0.8, 7.8, -0.8));
            var ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 14),
                new THREE.MeshLambertMaterial({ color: C.red }));
            ring.rotation.x = Math.PI / 2;
            ring.position.set(-0.8, 9.1, -0.8);
            g.add(ring);
            return { name: 'Оборонительная башня', note: 'турель, ствол, антенна' };
        },
        market: function (g) {
            g.add(bx(7, 0.3, 5, C.concrete, 0, 0.15, 0));
            for (var i = 0; i < 3; i++) {
                var x = -2.2 + i * 2.2;
                g.add(bx(1.8, 0.7, 1.2, C.wood, x, 0.8, 0));
                // навес
                var aw = bx(2.1, 0.16, 1.5, i === 0 ? C.red : (i === 1 ? C.yellow : C.green), x, 2.1, 0);
                aw.rotation.x = 0.18;
                g.add(aw);
                g.add(bx(0.12, 1.3, 0.12, C.steel2, x - 0.9, 1.4, -0.7));
                g.add(bx(0.12, 1.3, 0.12, C.steel2, x + 0.9, 1.4, -0.7));
                g.add(bx(0.5, 0.4, 0.5, C.wood, x - 0.4, 1.25, 0.2));
                g.add(bx(0.4, 0.3, 0.4, 0x6f8a3a, x + 0.4, 1.2, 0.25));
            }
            return { name: 'Рынок', note: 'три прилавка с навесами' };
        },
        shipyard: function (g) {
            g.add(bx(9, 0.4, 7, C.concrete2, 0, 0.2, 0));
            // стапель
            for (var i = 0; i < 4; i++) {
                g.add(bx(0.4, 5, 0.4, C.yellow, -3.6 + i * 2.4, 3, -2.6));
                g.add(bx(0.4, 5, 0.4, C.yellow, -3.6 + i * 2.4, 3, 2.6));
            }
            g.add(bx(8.4, 0.4, 0.4, C.yellow, 0, 5.4, -2.6));
            g.add(bx(8.4, 0.4, 0.4, C.yellow, 0, 5.4, 2.6));
            g.add(bx(0.4, 0.4, 5.6, C.yellow, 0, 5.4, 0));
            // корпус корабля
            g.add(bx(5.2, 0.9, 1.6, C.chrome, 0, 1.0, 0));
            g.add(bx(3.4, 0.7, 1.3, C.white, -0.6, 1.7, 0));
            g.add(bx(1.4, 0.6, 1.0, C.glass, -1.6, 2.2, 0, { emissive: 0x8fd0ff, intensity: 0.4 }));
            g.add(bx(0.8, 0.5, 1.1, C.steel2, 2.6, 1.0, 0));
            // леса
            g.add(bx(0.12, 1.6, 0.12, C.steel2, 1.8, 1.6, 1.0));
            g.add(bx(1.6, 0.12, 0.12, C.steel2, 2.4, 2.4, 1.0));
            return { name: 'Верфь', note: 'стапель, корпус корабля, леса' };
        },
        lab: function (g) {
            g.add(bx(5, 0.35, 5, C.concrete, 0, 0.18, 0));
            g.add(bx(3.6, 1.4, 3.6, C.white, 0, 1.0, 0));
            g.add(bx(3.0, 0.8, 3.0, C.chrome, 0, 2.0, 0));
            g.add(bx(2.0, 0.6, 2.0, C.chrome, 0, 2.7, 0));
            // тарелка
            var dish = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.2, 0.7, 12),
                new THREE.MeshLambertMaterial({ color: C.white }));
            dish.position.set(0, 3.4, 0);
            dish.rotation.x = 0.5;
            g.add(dish);
            g.add(bx(0.14, 2.4, 0.14, C.steel2, 0, 2.4, 0));
            // приборы
            [[1.8, 1.4], [-1.8, 1.4]].forEach(function (p) {
                g.add(bx(1.0, 0.9, 0.6, C.steel, p[0], 0.8, p[1]));
                g.add(bx(0.9, 0.14, 0.4, C.glass, p[0], 1.3, p[1] + 0.1, { emissive: 0x8fffc0, intensity: 0.5 }));
            });
            return { name: 'Лаборатория', note: 'купол, тарелка, приборы' };
        }
    };

    // ---------- экономика стройки ----------
    var CITY = {
        house:     { cost: 800,  income: 5,  foot: 6,  title: 'Жилой дом' },
        farm:      { cost: 1200, income: 8,  foot: 8,  title: 'Ферма' },
        factory:   { cost: 4500, income: 25, foot: 10, title: 'Завод' },
        mine:      { cost: 3000, income: 18, foot: 6,  title: 'Шахта' },
        warehouse: { cost: 2000, income: 4,  foot: 9,  title: 'Склад' },
        power:     { cost: 3500, income: 10, foot: 7,  title: 'Электростанция' },
        defense:   { cost: 2500, income: 2,  foot: 4,  title: 'Оборонительная башня' },
        market:    { cost: 1800, income: 12, foot: 8,  title: 'Рынок' },
        shipyard:  { cost: 6000, income: 30, foot: 10, title: 'Верфь' },
        lab:       { cost: 4000, income: 14, foot: 6,  title: 'Лаборатория' },
        spaceport: { cost: 12000, income: 45, foot: 24, title: 'Космопорт' },
        // развлечения: дают доход и счастье
        stadium:   { cost: 9000,  income: 40, foot: 20, title: 'Стадион' },
        raceway:   { cost: 11000, income: 52, foot: 22, title: 'Гоночная трасса' },
        park:      { cost: 6000,  income: 20, foot: 30, title: 'Парк развлечений' },
        docks:     { cost: 20000, income: 60, foot: 28, title: 'Доки' }
    };

    var cityState = {
        money: 6000, earned: 0, spent: 0, selected: 'house',
        placed: [], ghost: null, ground: null, grid: null, raycaster: null, pointer: null
    };

    // ---------- ресурсы ----------
    var RES = [
        { id: 'grain', name: 'Зерно', color: 0xd8c26a, glyph: 'З' },
        { id: 'water', name: 'Вода', color: 0x3f8fd0, glyph: 'В' },
        { id: 'steel', name: 'Сталь', color: 0x8d979e, glyph: 'С' },
        { id: 'copper', name: 'Медь', color: 0xb06a3a, glyph: 'М' },
        { id: 'nickel', name: 'Никель', color: 0xa8b0b8, glyph: 'Н' },
        { id: 'silver', name: 'Серебро', color: 0xd8dee2, glyph: 'Ag' },
        { id: 'gold', name: 'Золото', color: 0xd8a41c, glyph: 'Au' },
        { id: 'quartz', name: 'Кварц', color: 0xa8d8e8, glyph: 'К' },
        { id: 'corundum', name: 'Корунд', color: 0x9a4a8a, glyph: 'Ко' },
        { id: 'diamond', name: 'Алмаз', color: 0xbdf0ff, glyph: 'А' },
        { id: 'chips', name: 'Чипы', color: 0x3f8a4a, glyph: 'Ч' },
        { id: 'heavy', name: 'Тяжёлые', color: 0x6a5a7a, glyph: 'Т' }
    ];

    function glyphTexture(letter, bg) {
        var cv = document.createElement('canvas');
        cv.width = 128; cv.height = 128;
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(10,14,18,0.85)';
        ctx.lineWidth = 10;
        ctx.strokeRect(6, 6, 116, 116);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8;
        ctx.font = 'bold 64px Inter, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, 64, 70);
        return new THREE.CanvasTexture(cv);
    }

    function label(text, color) {
        var cv = document.createElement('canvas');
        cv.width = 256; cv.height = 64;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = 'rgba(10,16,22,0.82)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.strokeStyle = '#' + ('000000' + (color || 0x8fd6ff).toString(16)).slice(-6);
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 252, 60);
        ctx.fillStyle = '#e6f2fb';
        ctx.font = 'bold 26px Inter, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 34);
        var tex = new THREE.CanvasTexture(cv);
        var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        spr.scale.set(4.2, 1.05, 1);
        return spr;
    }

    function resourceCube(res) {
        var g = new THREE.Group();
        g.add(bx(1.4, 1.4, 1.4, res.color, 0, 0.7, 0, { emissive: res.color, intensity: 0.12 }));
        var dark = ((res.color & 0xfefefe) >> 1);
        g.add(bx(1.46, 0.14, 1.46, dark, 0, 1.44, 0));
        var tag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1),
            new THREE.MeshBasicMaterial({ map: glyphTexture(res.glyph, res.color), transparent: true }));
        tag.position.set(0, 0.7, 0.72);
        g.add(tag);
        return g;
    }

    // ---------- вода ----------
    function buildLake(cx, cz, r) {
        var g = new THREE.Group();
        var waterMat = new THREE.MeshLambertMaterial({
            color: PAL[world].water, transparent: true, opacity: 0.74,
            emissive: new THREE.Color(0x0d2f4a), emissiveIntensity: 0.3,
            depthWrite: false
        });
        for (var x = -r; x <= r; x += 2) {
            for (var z = -r; z <= r; z += 2) {
                if (x * x + z * z > r * r) continue;
                // плитки 2×2 с перекрытием — швов нет, блоков вчетверо меньше
                var m = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.5, 2.06), waterMat.clone());
                m.position.set(cx + x, 0.25 + curveY(cx + x, cz + z), cz + z);
                m.castShadow = false;
                m.receiveShadow = true;
                m.userData.baseY = 0.25 + curveY(cx + x, cz + z);   // волна пляшет от кривизны
                m.userData.wx = x;
                m.userData.wz = z;
                g.add(m);
                waterBlocks.push(m);
            }
        }
        // глубина: тёмные блоки в центре
        for (var dx = -r; dx <= r; dx++) {
            for (var dz = -r; dz <= r; dz++) {
                if (dx * dx + dz * dz > (r - 3) * (r - 3)) continue;
                var deep = bx(0.95, 0.3, 0.95, 0x1d4f73, cx + dx, -0.1 + curveY(cx + dx, cz + dz), cz + dz);
                deep.castShadow = false;
                g.add(deep);
            }
        }
        // пена у берега
        for (var f = 0; f < 44; f++) {
            var fa = f / 44 * Math.PI * 2;
            var fx = cx + Math.round(Math.cos(fa) * r);
            var fz = cz + Math.round(Math.sin(fa) * r);
            var foam = bx(0.9, 0.12, 0.9, 0xeaf6ff, fx, 0.42 + curveY(fx, fz), fz, { opacity: 0.75, emissive: 0xbfe4ff, intensity: 0.25 });
            foam.castShadow = false;
            g.add(foam);
        }
        // берег
        for (var a = 0; a < 40; a++) {
            var ang = a / 40 * Math.PI * 2;
            var px = Math.round(cx + Math.cos(ang) * (r + 1.2));
            var pz = Math.round(cz + Math.sin(ang) * (r + 1.2));
            g.add(bx(1, 0.45, 1, 0xb8a878, px, 0.22, pz));
        }
        return g;
    }

    function terrain(radius, hole) {
        var g = new THREE.Group();
        var base = new THREE.Color(PAL[world].ground);
        var light = new THREE.Color(PAL[world].ground2);
        var c = new THREE.Color();
        for (var x = -radius; x <= radius; x++) {
            for (var z = -radius; z <= radius; z++) {
                var d2 = x * x + z * z;
                if (d2 > radius * radius) continue;
                if (hole && d2 < hole * hole) continue;          // котловина под озеро
                // мягкий градиент к краю, без резких пятен
                var k = Math.min(1, Math.sqrt(d2) / radius);
                c.copy(base).lerp(light, 0.35 * k * k);
                var m = bx(1, 0.5, 1, c.getHex(), x, -0.25 + curveY(x, z), z);
                m.castShadow = false;
                m.receiveShadow = false;
                g.add(m);
            }
        }
        return g;
    }

    // дно котловины: тёмный грунт, чтобы под водой не было травы
    function lakeBottom(cx, cz, r) {
        var g = new THREE.Group();
        var c = new THREE.Color(PAL[world].rock).multiplyScalar(0.75);
        for (var x = -r; x <= r; x++) {
            for (var z = -r; z <= r; z++) {
                if (x * x + z * z > r * r) continue;
                var m = bx(1, 0.5, 1, c.getHex(), cx + x, -0.85 + curveY(cx + x, cz + z), cz + z);
                m.castShadow = false;
                m.receiveShadow = false;
                g.add(m);
            }
        }
        return g;
    }

    function planetBody(radius) {
        var seg = 48;
        var geo = new THREE.SphereGeometry(PLANET_R, seg, seg, 0, Math.PI * 2, 0, Math.PI * 0.5);
        var mat = new THREE.MeshLambertMaterial({ color: PAL[world].ground2 });
        var sphere = new THREE.Mesh(geo, mat);
        sphere.position.y = -PLANET_R + 0.2;
        sphere.receiveShadow = false;
        return sphere;
    }

    // тёмная «кора» под верхним слоем — скрывает зазоры
    function planetCrust(radius) {
        var g = new THREE.Group();
        var R = radius + 3, step = 2;
        var inner = (radius - 2) * (radius - 2);
        for (var x = -R; x <= R; x += step) {
            for (var z = -R; z <= R; z += step) {
                var d2 = x * x + z * z;
                if (d2 > R * R || d2 < inner) continue;      // только кромка
                var y = curveY(x, z);
                var m = bx(step, 2.2, step, PAL[world].rock, x, y - 1.4, z);
                m.castShadow = false;
                m.receiveShadow = false;
                g.add(m);
            }
        }
        return g;
    }

    function buildCity() {
        var g = new THREE.Group();
        g.add(planetBody(48));
        g.add(terrain(48));
        g.add(planetCrust(48));
        g.add(lampRow(-30, -14, 6, 8, 0));       // улица перед домами
        g.add(lampRow(-30, 12, 6, 8, 0));        // вторая улица
        // дорожная сетка города
        g.add(roadLine(-40, -14, 40, -14, 5));    // главная улица
        g.add(roadLine(-40, 12, 40, 12, 5));      // вторая улица
        g.add(roadLine(-22, -14, -22, 12, 5));    // переулок 1
        g.add(roadLine(6, -14, 6, 12, 5));        // переулок 2
        g.add(roadLine(30, -14, 30, 12, 5));      // переулок 3
        // транспорт по маршрутам
        addVehicle(g, [[-40, -15.4], [40, -15.4]], 0.05, 'truck');
        addVehicle(g, [[40, -12.6], [-40, -12.6]], 0.07, 'car');
        addVehicle(g, [[-22, -14], [-22, 12], [-22, -14]], 0.12, 'car');
        addVehicle(g, [[6, 12], [6, -14], [6, 12]], 0.09, 'truck');
        addVehicle(g, [[30, -14], [30, 12], [30, -14]], 0.11, 'car');
        g.add(buildHuman(-2, 0.5, -4));
        var order = ['house', 'farm', 'factory', 'mine', 'warehouse', 'power', 'defense', 'market', 'shipyard', 'lab', 'spaceport', 'docks', 'stadium', 'raceway', 'park'];
        var pos = [
            [-34, -28], [-12, -30], [10, -30], [32, -28],
            [-36, -2], [-14, -2], [10, -2], [34, 0],
            [-34, 24], [-6, 26], [22, 28], [-4, 46],
            [38, 34], [-40, 44], [12, 48]
        ];
        order.forEach(function (key, i) {
            var b = null;
            if (window.Models3D) b = window.Models3D.build(key, variantFor(key), THREE);
            if (!b) {
                b = new THREE.Group();
                // развлечения пока собираем из существующих мешей
                var alias = { stadium: 'market', raceway: 'power', park: 'farm' }[key] || key;
                (BUILDERS[alias] || BUILDERS.factory)(b);
            }
            b.position.set(pos[i][0], curveY(pos[i][0], pos[i][1]) + 0.06, pos[i][1]);
            b.rotation.y = (i % 2 ? -0.3 : 0.22);
            b.userData.kind = key;
            var sc = window.Models3D && window.Models3D.scale ? window.Models3D.scale[key] : null;
            var hw = sc ? Math.min(14, sc.modelW / 2) : 6;
            addObstacle(pos[i][0], pos[i][1], hw + 2, hw + 2);
            g.add(b);
        });
        return g;
    }

    // ---------- ходьба от первого лица ----------
    var walk = {
        on: false, yaw: 0, pitch: 0, keys: {},
        obstacles: [],            // {x, z, r} — препятствия в метрах
        eye: 1.7, speed: 6.5,
        startX: 0, startZ: 0,
        vy: 0, yOff: 0, onGround: true,   // прыжок
        hands: 'hand',                     // что в руках: hand/tool/bucket/box
        actionHint: ''
    };

    // прыжок от первого лица
    function walkJump() {
        if (!walk.on || !walk.onGround) return false;
        walk.vy = 5.2;
        walk.onGround = false;
        return true;
    }

    // даём другим модулям рулить ходьбой (экранные кнопки)
    window.B3D_WALK = walk;
    window.walkJump = walkJump;
    window.B3D_ENABLE_WALK = function (on) { enableWalk(on); };

    // ?check=1 — проверить физику построек в текущей сцене
    window.B3D_CHECK = function () {
        if (!window.WorldCheck || !window.B3D_SCENE) return null;
        window.WorldCheck.scan(THREE, window.B3D_SCENE, {
            groundFn: function (x, z) { return curveY(x, z); },
            waterLevel: 0.25,
            islandR: 44
        });
        return window.WorldCheck.report();
    };

    function addObstacle(x, z, halfW, halfD) {
        walk.obstacles.push({ x: x, z: z, r: Math.max(halfW, halfD) * 0.55 });
        window.B3D_OBSTACLES = walk.obstacles;          // нужно для авто-инфраструктуры
    }

    function walkBlocked(x, z) {
        for (var i = 0; i < walk.obstacles.length; i++) {
            var o = walk.obstacles[i];
            var dx = x - o.x, dz = z - o.z;
            if (dx * dx + dz * dz < o.r * o.r) return true;
        }
        // границы острова
        var d2 = x * x + z * z;
        if (d2 > 44 * 44) return true;
        return false;
    }

    function enableWalk(on) {
        walk.on = on;
        if (on) {
            walk.yaw = 0;
            walk.obstacles = [];
            // ставим человека рядом с жилым кварталом
            var startX = -34, startZ = -16, lookX = -34, lookZ = -28;
            if (tab === 'beijing') { startX = -22; startZ = -24; lookX = -22; lookZ = -12; }
        if (tab === 'moscow') { startX = -26; startZ = 26; lookX = -26; lookZ = 10; }
        if (tab === 'paris') { startX = 6; startZ = 30; lookX = -2; lookZ = 6; }
        if (tab === 'ny') { startX = 9; startZ = 30; lookX = 9; lookZ = 14; }
        if (tab === 'gz') { startX = -6; startZ = 40; lookX = -6; lookZ = 24; }
            walk.pitch = 0.06;
            walk.startX = startX; walk.startZ = startZ;
            camera.position.set(startX, 1.7 + curveY(startX, startZ), startZ);
            camera.lookAt(lookX, 6, lookZ);
            walk.yaw = Math.atan2(-(lookX - startX), -(lookZ - startZ));
        } else {
            camera.position.set(60, 34, 90);
            camera.lookAt(4, 2, 16);
        }
        var b = document.getElementById('walk-btn');
        if (b) b.textContent = on ? '🛰 Обзор' : '🚶 Пешком';
        var lg = document.getElementById('bld-legend');
        if (lg) lg.style.display = on ? 'none' : 'block';
        var hint = document.getElementById('walk-hint');
        if (!hint && on) {
            hint = el('div');
            hint.id = 'walk-hint';
            hint.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:9600;' +
                'padding:8px 16px;border:3px solid #0a0e12;border-radius:10px;background:rgba(10,16,22,.9);' +
                'color:#cfdae4;font:700 13px Inter,system-ui,sans-serif';
            hint.textContent = 'WASD — идти · мышь — смотреть · Esc — выход';
            document.body.appendChild(hint);
        }
        if (hint) hint.style.display = on ? 'block' : 'none';
    }

    function bindWalkInput(canvas) {
        var drag = false, lx = 0, ly = 0;
        canvas.addEventListener('pointerdown', function (e) {
            if (!walk.on) return;
            drag = true; lx = e.clientX; ly = e.clientY;
        });
        window.addEventListener('pointerup', function () { drag = false; });
        window.addEventListener('pointermove', function (e) {
            if (!walk.on || !drag) return;
            walk.yaw -= (e.clientX - lx) * 0.004;
            walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch - (e.clientY - ly) * 0.003));
            lx = e.clientX; ly = e.clientY;
        });
        document.addEventListener('keydown', function (e) {
            if (!walk.on) return;
            var k = e.key.toLowerCase();
            if (k === 'escape') { enableWalk(false); return; }
            if (k === ' ' || k === 'space') { walkJump(); e.preventDefault(); return; }
            if (['w','a','s','d','ц','ф','ы','в','arrowup','arrowdown','arrowleft','arrowright'].indexOf(k) >= 0) {
                walk.keys[k] = true; e.preventDefault();
            }
        });
        document.addEventListener('keyup', function (e) {
            walk.keys[e.key.toLowerCase()] = false;
        });
    }

    function stepWalk(dt) {
        if (!walk.on) return;
        var k = walk.keys;
        var fwd = (k['w'] || k['ц'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['ы'] || k['arrowdown'] ? 1 : 0);
        var side = (k['d'] || k['в'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['ф'] || k['arrowleft'] ? 1 : 0);
        var vx = Math.sin(walk.yaw) * fwd + Math.cos(walk.yaw) * side;
        var vz = Math.cos(walk.yaw) * fwd - Math.sin(walk.yaw) * side;
        var len = Math.hypot(vx, vz);
        if (len > 0) {
            vx /= len; vz /= len;
            var step = walk.speed * dt;
            var nx = camera.position.x + vx * step;
            var nz = camera.position.z + vz * step;
            if (!walkBlocked(nx, camera.position.z)) camera.position.x = nx;
            if (!walkBlocked(camera.position.x, nz)) camera.position.z = nz;
        }
        // прыжок: гравитация 9,8 м/с², приземление на рельеф
        if (!walk.onGround) {
            walk.vy -= 9.8 * dt;
            walk.yOff += walk.vy * dt;
            if (walk.yOff <= 0) { walk.yOff = 0; walk.vy = 0; walk.onGround = true; }
        }
        camera.position.y = 1.7 + curveY(camera.position.x, camera.position.z) + walk.yOff;
        camera.rotation.order = 'YXZ';
        camera.rotation.y = walk.yaw;
        camera.rotation.x = walk.pitch;
    }

    var cityVariants = {};
    // миры без воды: там станция охлаждается радиаторами, а не градирнями
    function variantFor(kind) {
        if (cityVariants[kind]) return cityVariants[kind];
        if (kind === 'power' && world !== 'earth') return 3;   // лунная: радиаторное поле
        return 1;
    }

    function hasVariant(kind) {
        if (!window.Models3D) return false;
        var item = window.Models3D.buildings.filter(function (b) { return b.id === kind; })[0];
        return !!(item && item.variants.length > 1);
    }

    function buildShips() {
        var g = new THREE.Group();
        g.add(planetBody(46));
        g.add(terrain(46));
        g.add(planetCrust(46));
        var ids = Object.keys(window.Models3D.ships);
        var colors = 0;
        ids.forEach(function (id, i) {
            var ship = window.Models3D.buildShip(id, THREE);
            if (!ship) return;
            var row = Math.floor(i / 3), col = i % 3;
            var px = -26 + col * 26, pz = -20 + row * 20;
            ship.position.set(px, 2.6 + curveY(px, pz), pz);
            ship.rotation.y = -1.15;                 // нос влево-вперёд: виден профиль
            g.add(ship);
        });
        return g;
    }

    // человечек 1,8 м: показывает, насколько постройки огромные
    function buildHuman(x, y, z) {
        var g = new THREE.Group();
        var skin = 0xe8c9a0, suit = 0x2f7fc4, boot = 0x22282e;
        var parts = [
            [0.28, 0.68, 0.22, suit, 0, 1.05, 0],   // торс
            [0.24, 0.26, 0.24, skin, 0, 1.55, 0],   // голова
            [0.1, 0.62, 0.12, suit, -0.19, 0.95, 0],
            [0.1, 0.62, 0.12, suit, 0.19, 0.95, 0],
            [0.13, 0.7, 0.15, boot, -0.1, 0.35, 0],
            [0.13, 0.7, 0.15, boot, 0.1, 0.35, 0]
        ];
        parts.forEach(function (p2) {
            var m = bx(p2[0], p2[1], p2[2], p2[3], p2[4], p2[5], p2[6]);
            m.castShadow = true;
            g.add(m);
        });
        g.position.set(x, y + curveY(x, z), z);
        g.userData.human = true;
        return g;
    }

    // пекинский квартал: хутуны, сыхэюани, пагода, башня, храм
    function buildBeijing() {
        var g = new THREE.Group();
        g.add(planetBody(46));
        g.add(terrain(46));
        g.add(planetCrust(46));

        // старый город: 6 сыхэюаней в два ряда + пайфаны
        var sihe = [[-22, -16], [-4, -16], [14, -16], [-22, 2], [-4, 2], [14, 2]];
        sihe.forEach(function (p2, i) {
            var b = Models3D.build('siheyuan', 1, THREE);
            b.position.set(p2[0], curveY(p2[0], p2[1]) + 0.06, p2[1]);
            b.rotation.y = i % 2 ? 0 : Math.PI / 2;
            addObstacle(p2[0], p2[1], 6, 6);
            g.add(b);
        });
        // пайфан на входе в хутун
        [[-13, -24], [-13, 12]].forEach(function (p2) {
            var b = Models3D.build('paifang', 1, THREE);
            b.position.set(p2[0], curveY(p2[0], p2[1]) + 0.06, p2[1]);
            g.add(b);
        });
        // пагода
        var pg = Models3D.build('pagoda', 1, THREE);
        pg.position.set(30, curveY(30, -8) + 0.06, -8);
        addObstacle(30, -8, 8, 8);
        g.add(pg);
        // башня-барабан
        var gt = Models3D.build('gate_tower', 1, THREE);
        gt.position.set(30, curveY(30, 10) + 0.06, 10);
        addObstacle(30, 10, 9, 9);
        g.add(gt);
        // храм
        var tp = Models3D.build('temple', 1, THREE);
        tp.position.set(-2, curveY(-2, 22) + 0.06, 22);
        addObstacle(-2, 22, 10, 10);
        g.add(tp);
        // современные башни района
        [[-32, 16], [-32, -2]].forEach(function (p2, i) {
            var q = Models3D.build('house', 3, THREE);
            q.position.set(p2[0], curveY(p2[0], p2[1]) + 0.06, p2[1]);
            q.rotation.y = i ? 0.3 : -0.3;
            addObstacle(p2[0], p2[1], 10, 10);
            g.add(q);
        });
        // фонарики вдоль хутуна
        for (var i = 0; i < 14; i++) {
            var lx = -40 + i * 6, lz = -26;
            var pole = bx(0.25, 3.2, 0.25, C.dark, lx, 1.6 + curveY(lx, lz), lz);
            g.add(pole);
            var lantern = bx(0.9, 1.1, 0.9, 0xd8352a, lx, 3.5 + curveY(lx, lz), lz,
                { emissive: 0xff4a3a, intensity: 0.85 });
            g.add(lantern);
        }
        // человечек для масштаба
        g.add(lampRow(-34, -8, 6, 6, 0));
        // Пекинская опера
        var po = Models3D.build('peking_opera', 1, THREE, 0.3);
        po.scale.setScalar(0.5 / 0.3);
        po.position.set(10, curveY(10, 34) + 0.06, 34);
        po.rotation.y = Math.PI;
        addObstacle(10, 34, 9, 7);
        g.add(po);
        g.add(lampRow(-6, 22, 4, 5, 0));
        g.add(buildHuman(-12, 0.5, -8));
        return g;
    }

    // Гуанчжоу: Кантонская башня на берегу Жемчужной реки
    function buildGuangzhou() {
        var g = new THREE.Group();
        g.add(planetBody(48));
        g.add(terrain(48));
        g.add(planetCrust(48));

        // река: полоса по Z от -14 до 14, блоки воды + набережные
        var waterMat = new THREE.MeshLambertMaterial({
            color: 0x3f8fc0, transparent: true, opacity: 0.78,
            emissive: new THREE.Color(0x0a2a40), emissiveIntensity: 0.25
        });
        for (var x = -46; x <= 46; x += 2) {
            for (var z = -12; z <= 12; z += 2) {
                var wm = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.5, 2.06), waterMat.clone());
                var wy = 0.15 + curveY(x, z);
                wm.position.set(x, wy, z);
                wm.userData.baseY = wy;
                wm.userData.wx = x; wm.userData.wz = z;
                waterBlocks.push(wm);
                g.add(wm);
            }
            // набережная
            [-14, 14].forEach(function (zz) {
                var bank = bx(2, 1.2, 4, 0xb8bec2, x, 0.6 + curveY(x, zz), zz);
                g.add(bank);
            });
        }

        // Кантонская башня на правом берегу
        var tw = Models3D.build('canton_tower', 1, THREE);
        tw.position.set(-6, curveY(-6, 24) + 0.06, 24);
        addObstacle(-6, 24, 10, 10);
        g.add(tw);
        // оперный театр рядом
        var op = Models3D.build('opera', 1, THREE);
        op.position.set(14, curveY(14, 26) + 0.06, 26);
        addObstacle(14, 26, 9, 9);
        g.add(op);
        // мост через реку
        var br = Models3D.build('pearl_bridge', 1, THREE);
        br.position.set(20, curveY(20, 0) + 0.06, 0);
        br.rotation.y = Math.PI / 2;
        g.add(br);
        // лодки
        [[-24, -2, 0.3], [-2, 4, -0.2], [28, -4, 1.1]].forEach(function (b2) {
            var bo = Models3D.build('river_boat', 1, THREE);
            bo.position.set(b2[0], 0.5 + curveY(b2[0], b2[1]), b2[1]);
            bo.rotation.y = b2[2];
            g.add(bo);
        });
        // город на левом берегу
        [[-44, 34], [-30, 38], [-16, 40], [30, 40]].forEach(function (p2, i) {
            var q = Models3D.build('house', 3, THREE);
            q.position.set(p2[0], curveY(p2[0], p2[1]) + 0.06, p2[1]);
            q.rotation.y = i * 0.25;
            addObstacle(p2[0], p2[1], 10, 10);
            g.add(q);
        });
        g.add(buildHuman(4, 0.5, 18));
        return g;
    }

    // Париж: Эйфелева башня, Сена, османовские дома, Марсово поле
    function buildParis() {
        var g = new THREE.Group();
        g.add(planetBody(48));
        g.add(terrain(48));
        g.add(planetCrust(48));

        // Сена: полоса по X вдали
        var waterMat = new THREE.MeshLambertMaterial({
            color: 0x4a7f96, transparent: true, opacity: 0.8,
            emissive: new THREE.Color(0x0a2733), emissiveIntensity: 0.22
        });
        for (var x = -46; x <= 46; x += 2) {
            for (var z = 26; z <= 38; z += 2) {
                var wm = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.5, 2.06), waterMat.clone());
                var wy = 0.12 + curveY(x, z);
                wm.position.set(x, wy, z);
                wm.userData.baseY = wy; wm.userData.wx = x; wm.userData.wz = z;
                waterBlocks.push(wm);
                g.add(wm);
            }
            [-1].forEach(function () {});
        }
        // набережная
        for (var bx2 = -46; bx2 <= 46; bx2 += 2) {
            g.add(bx(2, 1.1, 3, 0xd8cdb8, bx2, 0.55 + curveY(bx2, 24), 24));
            g.add(bx(2, 1.1, 3, 0xd8cdb8, bx2, 0.55 + curveY(bx2, 40), 40));
        }

        // мост через Сену
        var br = Models3D.build('pearl_bridge', 1, THREE);
        br.position.set(-2, curveY(-2, 32) + 0.06, 32);
        g.add(br);

        // Эйфелева башня в центре Марсова поля
        var tw = Models3D.build('eiffel', 1, THREE);
        tw.position.set(-2, curveY(-2, 4) + 0.06, 4);
        addObstacle(-2, 4, 12, 12);
        g.add(tw);

        // Опера Гарнье
        var ga = Models3D.build('garnier', 1, THREE, 0.3);
        ga.scale.setScalar(0.5 / 0.3);
        ga.position.set(20, curveY(20, -20) + 0.06, -20);
        addObstacle(20, -20, 9, 8);
        g.add(ga);
        // османовские кварталы по сторонам
        [[-34, 8], [-20, -8], [16, -6], [32, 10], [-36, -18]].forEach(function (p2, i) {
            var hb = Models3D.build('haussmann', 1, THREE);
            hb.position.set(p2[0], curveY(p2[0], p2[1]) + 0.06, p2[1]);
            hb.rotation.y = i % 2 ? 0 : Math.PI / 2;
            addObstacle(p2[0], p2[1], 7, 7);
            g.add(hb);
        });
        // аллея деревьев Марсова поля
        for (var t = 0; t < 12; t++) {
            var tz = -20 + t * 3.5;
            [-9, 5].forEach(function (tx) {
                g.add(bx(0.5, 2.4, 0.5, 0x5a4028, tx, 1.2 + curveY(tx, tz), tz));
                g.add(bx(2.2, 2, 2.2, 0x3f7a4a, tx, 3.2 + curveY(tx, tz), tz));
            });
        }
        g.add(lampRow(-24, -14, 7, 7, 0));      // аллея Марсова поля
        g.add(lampRow(-24, 14, 7, 7, 0));
        // дороги Парижа
        g.add(roadLine(-36, 6, 34, 6, 5));
        g.add(roadLine(-16, -20, -16, 14, 5));
        addVehicle(g, [[-36, 4.6], [34, 4.6]], 0.05, 'car');
        addVehicle(g, [[34, 7.4], [-36, 7.4]], 0.06, 'truck');
        addVehicle(g, [[-16, -20], [-16, 14], [-16, -20]], 0.1, 'car');
        g.add(buildHuman(-6, 0.5, -6));
        return g;
    }

    // дорога: асфальт, обочина и прерывистая разметка
    function roadLine(x0, z0, x1, z1, width) {
        var g = new THREE.Group();
        var w = width || 4;
        var dx = x1 - x0, dz = z1 - z0;
        var len = Math.hypot(dx, dz);
        if (len < 0.1) return g;
        var ux = dx / len, uz = dz / len;
        var ang = Math.atan2(dz, dx);   // блок длиной по X
        var steps = Math.floor(len);
        for (var i = 0; i <= steps; i++) {
            var px = x0 + ux * i, pz = z0 + uz * i;
            var y = 0.05 + curveY(px, pz);
            var a = bx(1.1, 0.1, w, 0x2b3036, px, y, pz);
            a.rotation.y = ang;
            g.add(a);
            // прерывистая разметка по центру
            if (i % 5 < 3) {
                var m = bx(0.7, 0.04, 0.3, 0xe0d9a8, px, y + 0.08, pz);
                m.rotation.y = ang;
                g.add(m);
            }
            // обочины
            var off = w / 2 + 0.55;
            var bx1 = px - uz * off, bz1 = pz + ux * off;   // перпендикуляр к дороге
            var bx2 = px + uz * off, bz2 = pz - ux * off;
            g.add(bx(1.1, 0.14, 0.6, 0x9aa0a4, bx1, 0.07 + curveY(bx1, bz1), bz1));
            g.add(bx(1.1, 0.14, 0.6, 0x9aa0a4, bx2, 0.07 + curveY(bx2, bz2), bz2));
        }
        return g;
    }

    // машина: кузов, кабина, колёса, фары
    function makeVehicle(color, kind) {
        var g = new THREE.Group();
        var bodyColor = color || 0x8a97a3;
        var isTruck = kind === 'truck';
        var L = isTruck ? 3.4 : 2.2;
        g.add(bx(L, 0.9, 1.4, bodyColor, 0, 0.75, 0));
        g.add(bx(L * 0.45, 0.7, 1.3, isTruck ? 0xcfd6da : 0x2b3238, L * 0.2, 1.45, 0));
        if (isTruck) {
            g.add(bx(L * 0.55, 1.1, 1.4, 0xd8dee2, -L * 0.2, 1.5, 0));   // кузов
        }
        // колёса
        [[-L * 0.3, 0.7], [L * 0.3, 0.7], [-L * 0.3, -0.7], [L * 0.3, -0.7]].forEach(function (w) {
            var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 10),
                new THREE.MeshLambertMaterial({ color: 0x1d2226 }));
            wh.rotation.x = Math.PI / 2;
            wh.position.set(w[0], 0.3, w[1]);
            g.add(wh);
        });
        // фары
        g.add(bx(0.16, 0.2, 0.3, 0xfff0b0, L / 2, 0.8, 0.45, { emissive: 0xfff0b0, intensity: 1.0 }));
        g.add(bx(0.16, 0.2, 0.3, 0xfff0b0, L / 2, 0.8, -0.45, { emissive: 0xfff0b0, intensity: 1.0 }));
        g.add(bx(0.14, 0.18, 0.3, 0xd43a2c, -L / 2, 0.8, 0.45, { emissive: 0xd43a2c, intensity: 0.8 }));
        g.add(bx(0.14, 0.18, 0.3, 0xd43a2c, -L / 2, 0.8, -0.45, { emissive: 0xd43a2c, intensity: 0.8 }));
        g.userData.isVehicle = true;
        return g;
    }

    // пускаем машину по маршруту
    function addVehicle(group, path, speed, kind) {
        var v = makeVehicle(
            [0xd8dee2, 0x8a97a3, 0xb04a3c, 0x2f7fc4, 0xd8a41c][vehicles.length % 5], kind);
        group.add(v);
        vehicles.push({ mesh: v, path: path, t: Math.random(), speed: speed || 0.035 });
        return v;
    }

    function stepVehicles(dt) {
        vehicles.forEach(function (v) {
            var path = v.path;
            if (!path || path.length < 2) return;
            v.t += dt * v.speed;
            if (v.t > 1) v.t -= 1;
            var total = path.length - 1;
            var seg = Math.min(total - 1, Math.floor(v.t * total));
            var local = v.t * total - seg;
            var a = path[seg], b = path[seg + 1];
            var x = a[0] + (b[0] - a[0]) * local;
            var z = a[1] + (b[1] - a[1]) * local;
            v.mesh.position.set(x, 0.14 + curveY(x, z), z);
            v.mesh.scale.setScalar(1.25);
            v.mesh.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
        });
    }

    // уличный фонарь: столб, светящаяся лампа и пятно света на земле
    function streetLamp(x, z, color) {
        var g = new THREE.Group();
        var y0 = curveY(x, z);
        g.add(bx(0.24, 4.2, 0.24, 0x2b3238, x, 2.1 + y0, z));
        g.add(bx(1.1, 0.3, 1.1, 0x3a4046, x, 4.3 + y0, z));
        var head = bx(0.8, 0.5, 0.8, color || 0xffe0a8, x, 4.0 + y0, z,
            { emissive: color || 0xffe0a8, intensity: 1.0 });
        g.add(head);
        // пятно света
        var pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20),
            new THREE.MeshBasicMaterial({
                color: color || 0xffd98a, transparent: true, opacity: 0.28,
                blending: THREE.AdditiveBlending, depthWrite: false
            }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(x, 0.12 + y0, z);
        g.add(pool);
        return g;
    }

    function lampRow(x0, z0, count, stepX, stepZ) {
        var g = new THREE.Group();
        for (var i = 0; i < count; i++) {
            g.add(streetLamp(x0 + i * stepX, z0 + i * stepZ));
        }
        return g;
    }

    // Нью-Йорк: статуя Свободы, залив, небоскрёбы
    function buildNewYork() {
        var g = new THREE.Group();
        g.add(planetBody(46));
        g.add(terrain(46));
        g.add(planetCrust(46));

        var waterMat = new THREE.MeshLambertMaterial({
            color: 0x3f7f9e, transparent: true, opacity: 0.8,
            emissive: new THREE.Color(0x0a2230), emissiveIntensity: 0.22
        });
        for (var x = -44; x <= 44; x += 2) {
            for (var z = -18; z <= 18; z += 2) {
                if (x > -6 && x < 26 && z > 8) continue;      // остров
                var wm = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.5, 2.06), waterMat.clone());
                var wy = 0.1 + curveY(x, z);
                wm.position.set(x, wy, z);
                wm.userData.baseY = wy; wm.userData.wx = x; wm.userData.wz = z;
                waterBlocks.push(wm);
                g.add(wm);
            }
        }
        // остров под статуей
        for (var ix = 0; ix < 20; ix += 2) {
            for (var iz = 10; iz < 20; iz += 2) {
                g.add(bx(2, 1, 2, 0x7d8a6a, ix, 0.5 + curveY(ix, iz), iz));
            }
        }
        var st = Models3D.build('liberty', 1, THREE);
        st.position.set(9, curveY(9, 14) + 1.0, 14);
        addObstacle(9, 14, 8, 8);
        g.add(st);

        // Манхэттен: небоскрёбы на дальнем берегу
        [[-26, -22], [-16, -24], [-4, -26], [8, -24], [20, -22], [32, -20]].forEach(function (p2, i) {
            var hb = Models3D.build('haussmann', 1, THREE);
            hb.position.set(p2[0], curveY(p2[0], p2[1]) + 0.06, p2[1]);
            hb.rotation.y = i * 0.2;
            hb.scale.set(1, 1.4 + i * 0.25, 1);
            addObstacle(p2[0], p2[1], 7, 7);
            g.add(hb);
        });
        g.add(lampRow(-20, 6, 8, 7, 0));
        g.add(buildHuman(3, 1.5, 12));
        return g;
    }

    // Москва: Кремль, Спасская башня, соборы
    function buildMoscow() {
        var g = new THREE.Group();
        g.add(planetBody(46));
        g.add(terrain(46));
        g.add(planetCrust(46));

        // река Москва
        var waterMat = new THREE.MeshLambertMaterial({
            color: 0x4a7f96, transparent: true, opacity: 0.8,
            emissive: new THREE.Color(0x0a2733), emissiveIntensity: 0.2
        });
        for (var x = -46; x <= 46; x += 2) {
            for (var z = 24; z <= 34; z += 2) {
                var wm = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.5, 2.06), waterMat.clone());
                var wy = 0.1 + curveY(x, z);
                wm.position.set(x, wy, z);
                wm.userData.baseY = wy; wm.userData.wx = x; wm.userData.wz = z;
                waterBlocks.push(wm);
                g.add(wm);
            }
        }
        // кремлёвская стена: 4 сегмента
        [[-30, -6, 0], [-10, -6, 0], [10, -6, 0], [30, -6, 0]].forEach(function (seg) {
            var wl = Models3D.build('kremlin_wall', 1, THREE);
            wl.position.set(seg[0], curveY(seg[0], seg[1]) + 0.06, seg[1]);
            wl.rotation.y = Math.PI / 2;
            g.add(wl);
        });
        // Спасская башня
        var sp = Models3D.build('spasskaya', 1, THREE);
        sp.position.set(-2, curveY(-2, -14) + 0.06, -14);
        addObstacle(-2, -14, 9, 9);
        g.add(sp);
        // колокольня Ивана Великого
        var iv = Models3D.build('ivan_tower', 1, THREE);
        iv.position.set(10, curveY(10, -6) + 0.06, -6);
        addObstacle(10, -6, 6, 6);
        g.add(iv);
        // соборы с золотыми куполами
        [[-16, -4], [-8, -2], [18, -2], [24, -6]].forEach(function (p2, i) {
            var cd = Models3D.build('cathedral', 1, THREE);
            cd.position.set(p2[0], curveY(p2[0], p2[1]) + 0.06, p2[1]);
            cd.rotation.y = i * 0.3;
            addObstacle(p2[0], p2[1], 6, 6);
            g.add(cd);
        });
        // Большой театр — на площади перед Кремлём
        var bt = Models3D.build('bolshoi', 1, THREE, 0.3);
        bt.scale.setScalar(0.5 / 0.3);
        bt.position.set(-26, curveY(-26, 10) + 0.06, 10);
        bt.rotation.y = Math.PI;
        addObstacle(-26, 10, 10, 8);
        g.add(bt);
        // дома на другом берегу
        [[-4, 14], [14, 12], [30, 14]].forEach(function (p2, i) {
            var hb = Models3D.build('haussmann', 1, THREE);
            hb.position.set(p2[0], curveY(p2[0], p2[1]) + 0.06, p2[1]);
            hb.rotation.y = i * 0.25;
            addObstacle(p2[0], p2[1], 7, 7);
            g.add(hb);
        });
        // фонари у театра
        g.add(lampRow(-34, 4, 3, 4, 0));
        g.add(lampRow(-30, 6, 9, 7, 0));
        g.add(roadLine(-38, 4, 38, 4, 5));
        g.add(roadLine(-24, 4, -24, 16, 5));
        addVehicle(g, [[-38, 2.6], [38, 2.6]], 0.045, 'truck');
        addVehicle(g, [[38, 5.4], [-38, 5.4]], 0.06, 'car');
        addVehicle(g, [[-24, 4], [-24, 16], [-24, 4]], 0.11, 'car');
        g.add(buildHuman(-2, 0.5, 4));
        return g;
    }

    function buildResources() {
        var g = new THREE.Group();
        g.add(planetBody(16));
        g.add(terrain(16));
        g.add(planetCrust(16));
        RES.forEach(function (res, i) {
            var c = resourceCube(res);
            var col = i % 4, row = Math.floor(i / 4);
            c.position.set(-10 + col * 6.6, 0.5 + curveY(-10 + col * 6.6, -8 + row * 7.5), -8 + row * 7.5);
            g.add(c);
        });
        return g;
    }

    function buildWater() {
        var g = new THREE.Group();
        g.add(planetBody(18));
        g.add(terrain(18, 9));
        g.add(lakeBottom(0, 0, 9));
        g.add(planetCrust(18));
        g.add(buildLake(0, 0, 8));
        // плотина и насосная
        g.add(bx(1.2, 2.2, 16, C.concrete, 10, 1.1, 0));
        g.add(bx(2.2, 1.6, 2.2, C.wall2, -10, 0.8, 9));
        g.add(bx(0.4, 2.0, 0.4, C.steel2, -10, 2.2, 9));
        g.add(bx(1.4, 0.4, 1.4, C.steel, -10, 3.2, 9));
        var drop = bx(0.35, 0.35, 0.35, 0x8fd0ff, 9.2, 1.6, 0, { emissive: 0x8fd0ff, intensity: 0.6 });
        g.add(drop);
        return g;
    }

    function buildScene() {
        scene = new THREE.Scene();
        window.B3D_SCENE = scene;
        window.B3D_THREE = THREE;
        window.B3D_TAB = tab;
        window.B3D_CURVE = curveY;
        var p = PAL[world];
        scene.background = new THREE.Color(p.sky);
        scene.fog = new THREE.Fog(p.fog, world === 'moon' ? 26 : 34, world === 'moon' ? 88 : 108);
        if (tab === 'city' || tab === 'citymode' || tab === 'ships' || tab === 'beijing' ||
            tab === 'gz' || tab === 'paris' || tab === 'ny' || tab === 'moscow') {
            scene.fog.near = 90;          // город большой — туман не должен его съедать
            scene.fog.far = 260;
        }
        scene.add(new THREE.HemisphereLight(0xffffff, 0x2b3136, p.ambient));
        var dir = new THREE.DirectionalLight(p.light, world === 'moon' ? 1.3 : 0.95);
        dir.position.set(14, 22, 10);
        dir.castShadow = true;
        dir.shadow.mapSize.set(1024, 1024);
        dir.shadow.camera.left = -30; dir.shadow.camera.right = 30;
        dir.shadow.camera.top = 30; dir.shadow.camera.bottom = -30;
        dir.shadow.bias = -0.0004;
        dir.shadow.normalBias = 0.06;
        scene.add(dir);
        if (world === 'moon') scene.add(stars());

        waterBlocks = [];
        smokePuffs = [];
        vehicles = [];
        if (tab === 'city') scene.add(buildCity());
        else if (tab === 'ships') scene.add(buildShips());
        else if (tab === 'res') scene.add(buildResources());
        else if (tab === 'water') scene.add(buildWater());
        else if (tab === 'beijing') scene.add(buildBeijing());
        else if (tab === 'gz') scene.add(buildGuangzhou());
        else if (tab === 'paris') scene.add(buildParis());
        else if (tab === 'ny') scene.add(buildNewYork());
        else if (tab === 'moscow') scene.add(buildMoscow());
        else scene.add(buildCityMode());

        camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
        var dist = tab === 'citymode' ? 26 : (tab === 'res' ? 22 : (tab === 'water' ? 22 : (tab === 'ships' ? 62 : (tab === 'beijing' ? 80 : (tab === 'gz' ? 74 : (tab === 'paris' || tab === 'ny' || tab === 'moscow' ? 78 : 96))))));
        camera.position.set(dist * 0.62, dist * 0.34 + 4, dist * 0.78);
        camera.lookAt(tab === 'city' ? 4 : 0, (tab === 'city' || tab === 'beijing') ? 3 : 1.2,
            tab === 'city' ? 16 : (tab === 'beijing' ? 2 : 0));

        // пресеты камеры и ночной режим для слайд-шоу
        if (/[?&]cam=pagoda/.test(location.search)) {
            camera.position.set(30, 8, 10);
            camera.lookAt(30, 10, -8);
        }
        var simM = location.search.match(/[?&]sim=(\d+)/);
        if (simM) {
            var secs = Math.min(600, parseInt(simM[1], 10));
            for (var si = 0; si < secs * 60; si++) stepVehicles(1 / 60);
        }
        if (tab === 'ny' && !/[?&]cam=/.test(location.search)) {
            camera.position.set(40, 24, 46);
            camera.lookAt(4, 12, 6);
        }
        if (tab === 'moscow' && !/[?&]cam=/.test(location.search)) {
            camera.position.set(38, 26, 52);
            camera.lookAt(-2, 10, -4);
        }
        if (/[?&]cam=statue/.test(location.search)) {
            camera.position.set(20, 12, 26);
            camera.lookAt(9, 16, 14);
        }
        if (/[?&]cam=spasskaya/.test(location.search)) {
            camera.position.set(6, 14, 4);
            camera.lookAt(-2, 16, -14);
        }
        if (tab === 'paris' && !/[?&]cam=/.test(location.search)) {
            camera.position.set(44, 28, 62);
            camera.lookAt(-2, 14, 8);
        }
        if (/[?&]cam=tower/.test(location.search)) {
            camera.position.set(6, 24, 14);
            camera.lookAt(24, 2, 44);
        }
        if (/[?&]cam=seine/.test(location.search)) {
            camera.position.set(-6, 3, 52);
            camera.lookAt(-2, 20, 6);
        }
        if (tab === 'gz' && !/[?&]cam=/.test(location.search)) {
            camera.position.set(50, 32, 66);
            camera.lookAt(-4, 13, 18);
        }
        if (/[?&]cam=deck/.test(location.search)) {
            // вид со смотровой площадки башни
            camera.position.set(0.5, 22.6, 25.5);
            camera.lookAt(4, 3, -14);
        }
        if (/[?&]cam=river/.test(location.search)) {
            camera.position.set(-6, 2.2, -8);
            camera.lookAt(-6, 16, 24);
        }
        if (/[?&]cam=roads/.test(location.search)) {
            camera.position.set(6, 16, 22);
            camera.lookAt(0, 0, -2);
        }
        if (/[?&]cam=street/.test(location.search)) {
            camera.position.set(-22, 3.2, -36);
            camera.lookAt(-22, 3.4, -14);
        }
        // съёмка: произвольная камера ?cx=..&cy=..&cz=..&lx=..&ly=..&lz=..
        // ставится после пресетов, иначе они перетирают положение
        if (/[?&]cx=/.test(location.search)) {
            var num = function (name, def) {
                var m = location.search.match(new RegExp('[?&]' + name + '=(-?\\d+(?:\\.\\d+)?)'));
                return m ? parseFloat(m[1]) : def;
            };
            camera.position.set(num('cx', 20), num('cy', 12), num('cz', 20));
            camera.lookAt(num('lx', 0), num('ly', 6), num('lz', 0));
            if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
        }
        if (/[?&]night=1/.test(location.search)) {
            scene.background = new THREE.Color(0x070b12);
            scene.fog.color = new THREE.Color(0x070b12);
            scene.fog.near = 40; scene.fog.far = 140;
            scene.traverse(function (n) {
                if (n.isHemisphereLight) n.intensity *= 0.5;
                if (n.isDirectionalLight) n.intensity *= 0.42;
                // светящиеся окна и фонари ночью разгораются
                if (n.isMesh && n.material && n.material.emissiveIntensity > 0) {
                    n.material.emissiveIntensity = Math.min(2.2, n.material.emissiveIntensity * 2.0);
                }
            });
            // зарево города над крышами
            var glow = new THREE.Mesh(
                new THREE.CircleGeometry(34, 32),
                new THREE.MeshBasicMaterial({
                    color: 0xffb45a, transparent: true, opacity: 0.16,
                    blending: THREE.AdditiveBlending, depthWrite: false
                }));
            glow.rotation.x = -Math.PI / 2;
            glow.position.set(0, 0.2 + curveY(0, 4), 4);
            scene.add(glow);
        }
    }

    function stars() {
        var g = new THREE.BufferGeometry();
        var n = 600, pos = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
            var r = 160 + Math.random() * 80;
            var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
            pos[i * 3 + 1] = Math.abs(r * Math.cos(ph));
            pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false }));
    }

    function animate(t) {
        raf = requestAnimationFrame(animate);
        var time = t / 1000;
        // волны
        waterBlocks.forEach(function (m) {
            var d = m.userData;
            m.position.y = d.baseY + Math.sin(time * 1.3 + d.wx * 0.45 + d.wz * 0.35) * 0.1
                + Math.cos(time * 0.85 + d.wx * 0.2) * 0.045;
        });
        // дым
        smokePuffs.forEach(function (p, i) {
            var k = ((time * 0.35 + i * 0.3) % 1);
            p.position.y = p.userData.baseY + k * 3.4;
            p.material.opacity = 0.5 * (1 - k);
            p.scale.setScalar(0.7 + k * 1.5);
        });
        if (vehicles.length) stepVehicles(0.016);
        if (walk.on) {
            var wdt = Math.min(0.05, (t - (walk._last || t)) / 1000 || 0.016);
            walk._last = t;
            stepWalk(wdt);
        }
        if (tab === 'citymode' && cityState.placed.length) {
            cityState.money += incomePerSecond() * 0.016;
            cityState.earned += incomePerSecond() * 0.016;
            if (Math.random() < 0.04) updateCityHud();
        }
        renderer.render(scene, camera);
    }

    var CITY_INFO = [
        ['Жилой модуль', 'город на 8 000 человек', 'house'],
        ['Жилой квартал', '3 башни по 12 этажей · вариант 3', 'house'],
        ['Ферма', 'теплицы и поля', 'farm'],
        ['Фабрика', '3 смены по 1 000 рабочих', 'factory'],
        ['Шахта', 'ствол 400 м', 'mine'],
        ['Склад', 'ангар и паллеты', 'warehouse'],
        ['Термоядерная станция', '1 ГВт, градирни', 'power'],
        ['Оборонительная башня', 'турель и радар', 'defense'],
        ['Рынок', '120 лавок', 'market'],
        ['Верфь', 'стапель под колосс', 'shipyard'],
        ['Лаборатория', 'купол и реактор', 'lab']
    ];

    function legendHtml() {
        var rows = [];
        if (tab === 'city') {
            rows.push('<b style="color:#8fd6ff">Постройки · 12</b>' +
                '<span style="color:#6f8296;font-size:11px"> · настоящий масштаб</span>');
            if (window.Models3D) {
                rows.push('<div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap">' +
                    '<button data-var="1" data-kind="house" class="vbtn">дом</button>' +
                    '<button data-var="3" data-kind="house" class="vbtn">квартал</button>' +
                    '<button data-var="1" data-kind="factory" class="vbtn">завод</button>' +
                    '<button data-var="2" data-kind="factory" class="vbtn">завод+</button>' +
                    '<button data-var="1" data-kind="power" class="vbtn">станция</button>' +
                    '<button data-var="3" data-kind="power" class="vbtn">лунная</button></div>');
            }
            CITY_INFO.forEach(function (c, i) {
                var sc = window.Models3D && window.Models3D.scale ? window.Models3D.scale[c[2]] : null;
                var size = sc ? (' · ' + sc.w + '×' + sc.d + '×' + sc.h + ' м') : '';
                var rooms = sc ? (' · ' + sc.rooms.toLocaleString('ru-RU') + ' помещ.') : '';
                var ratio = sc && sc.modelW ? (' · схема 1:' + Math.round(sc.w / sc.modelW)) : '';
                var iconKind = c[2] || '';
                var icon = iconKind
                    ? '<img src="/images/icons/' + iconKind + '_128.png" alt="" ' +
                      'style="width:26px;height:26px;vertical-align:-7px;margin-right:5px;' +
                      'filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">'
                    : '';
                rows.push('<div style="margin-top:6px">' + icon +
                    '<span style="color:#ffd05a">' + (i + 1) + '.</span> ' +
                    c[0] + '<div style="color:#6f8296;font-size:11px">' + c[1] + size + rooms + ratio + '</div></div>');
            });
            rows.push('<div style="margin-top:8px;color:#3ec97a;font-size:11px">🧍 человечек 1,8 м — для масштаба</div>');
        } else if (tab === 'ny') {
            rows.push('<b style="color:#8fd6ff">Нью-Йорк · статуя Свободы</b>');
            [['Статуя', 'звезда-форт, пьедестал, корона из 7 лучей'],
             ['Факел', 'светится оранжевым'],
             ['Скрижаль', 'в левой руке'],
             ['Залив', 'вода с волнами вокруг острова'],
             ['Манхэттен', '6 высотных кварталов']].forEach(function (c) {
                rows.push('<div style="margin-top:6px"><span style="color:#ffd05a">·</span> ' + c[0] +
                    '<div style="color:#6f8296;font-size:11px">' + c[1] + '</div></div>');
            });
            rows.push('<div style="margin-top:8px;color:#3ec97a;font-size:11px">вид: &cam=statue</div>');
        } else if (tab === 'moscow') {
            rows.push('<b style="color:#8fd6ff">Москва · Кремль</b>');
            [['Стена', '4 сегмента, зубцы «ласточкин хвост»'],
             ['Спасская башня', 'часы, шатёр, звезда'],
             ['Иван Великий', 'белая колокольня, золотой купол'],
             ['Соборы', '4 с золотыми «луками»'],
             ['Москва-река', 'вода с волнами']].forEach(function (c) {
                rows.push('<div style="margin-top:6px"><span style="color:#ffd05a">·</span> ' + c[0] +
                    '<div style="color:#6f8296;font-size:11px">' + c[1] + '</div></div>');
            });
            rows.push('<div style="margin-top:8px;color:#3ec97a;font-size:11px">вид: &cam=spasskaya</div>');
        } else if (tab === 'paris') {
            rows.push('<b style="color:#8fd6ff">Париж · Марсово поле</b>');
            [['Эйфелева башня', '64 яруса, 3 площадки, арки'],
             ['Сена', 'полоса воды с волнами'],
             ['Мост', 'вантовый через Сену'],
             ['Османовские дома', '6 кварталов, цинк и камень'],
             ['Аллея', '24 дерева Марсова поля']].forEach(function (c) {
                rows.push('<div style="margin-top:6px"><span style="color:#ffd05a">·</span> ' + c[0] +
                    '<div style="color:#6f8296;font-size:11px">' + c[1] + '</div></div>');
            });
            rows.push('<div style="margin-top:8px;color:#3ec97a;font-size:11px">виды: &cam=tower, &cam=seine</div>');
        } else if (tab === 'gz') {
            rows.push('<b style="color:#8fd6ff">Гуанчжоу · река и башня</b>');
            [['Кантонская башня', '60 ярусов, талия, смотровая 44-й'],
             ['Жемчужная река', '24 м в ширину модели, волны'],
             ['Вантовый мост', '2 пилона, трос с провисом и подвесы'],
             ['Оперный театр', 'ступенчатые «камни»'],
             ['Речные трамвайчики', '3 на воде'],
             ['Город', '4 башни на левом берегу']].forEach(function (c) {
                rows.push('<div style="margin-top:6px"><span style="color:#ffd05a">·</span> ' + c[0] +
                    '<div style="color:#6f8296;font-size:11px">' + c[1] + '</div></div>');
            });
            rows.push('<div style="margin-top:8px;color:#3ec97a;font-size:11px">виды: &cam=deck, &cam=river</div>');
        } else if (tab === 'beijing') {
            rows.push('<b style="color:#8fd6ff">Пекин · исторический квартал</b>');
            [['Сыхэюань', 'двор, серые крыши, красные ворота'],
             ['Пагода', '5 ярусов, золотой шпиль'],
             ['Башня-барабан', 'красные колонны, двойная крыша'],
             ['Храм', 'золотая крыша, 6 колонн'],
             ['Пайфан', 'арочные ворота хутуна'],
             ['Фонарики', '14 вдоль переулка']].forEach(function (c) {
                rows.push('<div style="margin-top:6px"><span style="color:#ffd05a">·</span> ' + c[0] +
                    '<div style="color:#6f8296;font-size:11px">' + c[1] + '</div></div>');
            });
            rows.push('<div style="margin-top:8px;color:#3ec97a;font-size:11px">🧍 человечек 1,8 м</div>');
        } else if (tab === 'ships') {
            rows.push('<b style="color:#8fd6ff">Корабли · 9</b>');
            Object.keys(window.Models3D.ships).forEach(function (id, i) {
                var len = window.Models3D.shipSize ? window.Models3D.shipSize[id] : 0;
                rows.push('<div style="margin-top:4px"><span style="color:#ffd05a">' + (i + 1) + '.</span> ' +
                    window.Models3D.ships[id].name + '<span style="color:#6f8296"> · ' + len + ' м</span></div>');
            });
        } else if (tab === 'res') {
            rows.push('<b style="color:#8fd6ff">Ресурсы · 12</b>');
            RES.forEach(function (r) {
                rows.push('<div style="margin-top:5px;display:flex;align-items:center;gap:7px">' +
                    '<i style="width:12px;height:12px;border-radius:3px;display:inline-block;background:#' +
                    ('000000' + r.color.toString(16)).slice(-6) + ';border:1px solid #0a0e12"></i>' +
                    r.name + '<span style="color:#6f8296"> · ' + r.glyph + '</span></div>');
            });
        } else if (tab === 'citymode') {
            rows.push('<b style="color:#8fd6ff">Стройка</b>');
            rows.push('<div style="margin-top:6px">Выбери постройку справа, наведи курсор на площадку и нажми ЛКМ.</div>');
            rows.push('<div style="margin-top:5px;color:#6f8296">ПКМ — снести (возврат 60 %). R — повернуть. Постройки приносят доход.</div>');
        } else if (tab === 'city') {
            rows.push('');

        } else {
            rows.push('<b style="color:#8fd6ff">Вода</b>');
            rows.push('<div style="margin-top:6px">Озеро из кубиков: волны, глубина, пена у берега.</div>');
            rows.push('<div style="margin-top:5px;color:#6f8296">Плотина, насосная станция, сток.</div>');
        }
        return rows.join('');
    }

    // ---------- режим стройки (по мотивам Minecraft / Roblox tycoon) ----------
    function buildCityMode() {
        var g = new THREE.Group();
        g.add(planetBody(34));
        g.add(terrain(34));
        g.add(planetCrust(34));

        // площадка под застройку и сетка
        var pad = bx(26, 0.3, 26, 0xb8bec2, 0, 0.15 + curveY(0, 0), 0);
        pad.receiveShadow = true;
        g.add(pad);
        var grid = new THREE.GridHelper(26, 26, 0x2b3238, 0x59636b);
        grid.position.y = 0.32;
        g.add(grid);
        cityState.grid = grid;

        // невидимая плоскость для курсора
        var plane = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
            new THREE.MeshBasicMaterial({ visible: false }));
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = 0.3;
        g.add(plane);
        cityState.ground = plane;

        // уже поставленные
        cityState.placed.forEach(function (b) {
            g.add(makeCityBuilding(b.kind, b.x, b.z, b.rot));
        });

        return g;
    }

    function makeCityBuilding(kind, x, z, rot) {
        var b = new THREE.Group();
        BUILDERS[kind](b);
        b.position.set(x, curveY(x, z) + 0.06, z);
        b.rotation.y = rot || 0;
        b.userData.kind = kind;
        b.userData.gridX = x;
        b.userData.gridZ = z;
        return b;
    }

    function ghostFor(kind) {
        var b = new THREE.Group();
        BUILDERS[kind](b);
        b.traverse(function (n) {
            if (n.isMesh && n.material) {
                n.material = new THREE.MeshLambertMaterial({
                    color: 0x7fe0a0, transparent: true, opacity: 0.42
                });
            }
        });
        return b;
    }

    function snap(v) { return Math.round(v); }
    function canAfford(kind) { return cityState.money >= CITY[kind].cost; }

    function incomePerSecond() {
        var sum = 0;
        cityState.placed.forEach(function (b) { sum += CITY[b.kind].income; });
        return sum;
    }

    function updateCityHud() {
        var m = document.getElementById('city-money');
        if (m) m.textContent = Math.round(cityState.money).toLocaleString('ru-RU');
        var inc = document.getElementById('city-income');
        if (inc) inc.textContent = '+' + incomePerSecond() + '/с';
        var cnt = document.getElementById('city-count');
        if (cnt) cnt.textContent = cityState.placed.length;
    }

    function bindCityInput(canvas) {
        cityState.raycaster = new THREE.Raycaster();
        cityState.pointer = new THREE.Vector2();

        function updateGhost(ev) {
            if (!cityState.ground) return;
            var r = canvas.getBoundingClientRect();
            cityState.pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
            cityState.pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
            cityState.raycaster.setFromCamera(cityState.pointer, camera);
            var hit = cityState.raycaster.intersectObject(cityState.ground, false)[0];
            if (!hit) return;
            var kind = cityState.selected;
            if (!cityState.ghost || cityState.ghost.userData.kind !== kind) {
                if (cityState.ghost) scene.remove(cityState.ghost);
                cityState.ghost = ghostFor(kind);
                cityState.ghost.userData.kind = kind;
                scene.add(cityState.ghost);
            }
            var x = snap(hit.point.x), z = snap(hit.point.z);
            cityState.ghost.position.set(x, curveY(x, z) + 0.06, z);
            cityState.ghost.userData.gx = x;
            cityState.ghost.userData.gz = z;
            var ok = canAfford(kind);
            cityState.ghost.traverse(function (n) {
                if (n.isMesh && n.material) n.material.color.setHex(ok ? 0x7fe0a0 : 0xe06060);
            });
        }

        canvas.addEventListener('pointermove', updateGhost);
        canvas.addEventListener('pointerdown', function (ev) {
            if (ev.button !== 0 || !cityState.ghost) return;
            updateGhost(ev);
            var kind = cityState.ghost.userData.kind;
            var x = cityState.ghost.userData.gx, z = cityState.ghost.userData.gz;
            if (!canAfford(kind)) {
                flash('Не хватает кредитов: нужно ' + CITY[kind].cost);
                return;
            }
            placeAt(kind, x, z, cityState.ghost.rotation.y);
        });
        canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
        canvas.addEventListener('pointerdown', function (ev) {
            if (ev.button !== 2) return;
            // снос: ближайшая постройка в радиусе 3
            var r = canvas.getBoundingClientRect();
            cityState.pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
            cityState.pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
            cityState.raycaster.setFromCamera(cityState.pointer, camera);
            var hit = cityState.raycaster.intersectObject(cityState.ground, false)[0];
            if (!hit) return;
            var best = -1, bestD = 9;
            cityState.placed.forEach(function (b, i) {
                var d = Math.pow(b.x - hit.point.x, 2) + Math.pow(b.z - hit.point.z, 2);
                if (d < bestD) { bestD = d; best = i; }
            });
            if (best >= 0) {
                var gone = cityState.placed.splice(best, 1)[0];
                var refund = Math.round(CITY[gone.kind].cost * 0.6);
                cityState.money += refund;
                var obj = scene.children.filter(function (n) {
                    return n.userData && n.userData.kind === gone.kind &&
                        Math.abs(n.position.x - gone.x) < 0.6 && Math.abs(n.position.z - gone.z) < 0.6;
                })[0];
                if (obj) scene.remove(obj);
                updateCityHud();
                flash('Снесено, возврат ' + refund);
            }
        });
        document.addEventListener('keydown', function (ev) {
            if (!cityState.ghost) return;
            if (ev.key === 'r' || ev.key === 'R' || ev.key === 'к' || ev.key === 'К') {
                cityState.ghost.rotation.y += Math.PI / 4;
                flash('Поворот');
            }
        });
    }

    function placeAt(kind, x, z, rot) {
        if (!CITY[kind]) return false;
        if (cityState.money < CITY[kind].cost) { flash('Не хватает кредитов'); return false; }
        cityState.money -= CITY[kind].cost;
        cityState.spent += CITY[kind].cost;
        cityState.placed.push({ kind: kind, x: x, z: z, rot: rot || 0 });
        var b = makeCityBuilding(kind, x, z, rot || 0);
        scene.add(b);
        updateCityHud();
        flash(CITY[kind].title + ' построен');
        return true;
    }

    function flash(text) {
        var n = document.getElementById('city-flash');
        if (!n) return;
        n.textContent = text;
        n.style.opacity = '1';
        clearTimeout(n._t);
        n._t = setTimeout(function () { n.style.opacity = '0'; }, 1600);
    }

    function saveCity() {
        var payload = 'city:' + JSON.stringify(cityState.placed);
        api('/api/planet/save', { world: world, script: payload }).then(function (res) {
            if (!res || res.error) { flash('Не сохранилось: ' + (res && res.error ? res.error : 'ошибка')); return; }
            flash('Город сохранён: ' + cityState.placed.length + ' построек');
        });
    }

    function loadCity() {
        api('/api/planet/load?world=' + encodeURIComponent(world), null, 'GET').then(function (res) {
            var sc = (res && res.script) || '';
            if (sc.indexOf('city:') !== 0) { flash('Сохранённого города нет'); return; }
            try {
                var list = JSON.parse(sc.slice(5));
                cityState.placed = list.slice(0, 60);
                rebuild('citymode');
                flash('Загружено построек: ' + cityState.placed.length);
            } catch (e) { flash('Не удалось прочитать город'); }
        });
    }

    function api(path, body, method) {
        var token = '';
        try { token = localStorage.getItem('galaktika_token') || ''; } catch (e) { }
        return fetch(path, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }

    function buildCityPanel() {
        var old = document.getElementById('city-panel');
        if (old) old.remove();
        var p = el('div');
        p.id = 'city-panel';
        p.style.cssText = 'position:absolute;right:14px;top:64px;z-index:5;width:270px;background:rgba(10,16,22,.92);' +
            'border:2px solid #101214;border-radius:12px;padding:12px;color:#dce8f7;font:12.5px/1.5 Inter,system-ui,sans-serif';
        var rows = Object.keys(CITY).map(function (k) {
            var c = CITY[k];
            return '<button data-kind="' + k + '" style="display:flex;justify-content:space-between;width:100%;' +
                'margin:3px 0;padding:6px 8px;border:2px solid #0a0e12;border-radius:7px;cursor:pointer;' +
                'background:' + (cityState.selected === k ? 'linear-gradient(#ffe07a,#d8a41c);color:#2a1f00' : '#2b3238;color:#e6eaed') +
                ';font:700 12px Inter,system-ui,sans-serif"><span>' + c.title + '</span><span>' + c.cost + ' кр</span></button>';
        }).join('');
        p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline">' +
            '<b style="color:#8fd6ff;font-size:13px">🏗 СТРОЙКА</b>' +
            '<span style="color:#3ec97a;font-weight:700" id="city-income">+0/с</span></div>' +
            '<div style="margin:6px 0 10px;font:700 18px monospace;color:#ffd05a"><span id="city-money">6 000</span> кр</div>' +
            '<div style="color:#6f8296;margin-bottom:6px">Построек: <b id="city-count" style="color:#dce8f7">0</b> · ЛКМ поставить, ПКМ снести, R повернуть</div>' +
            rows +
            '<div style="display:flex;gap:6px;margin-top:10px">' +
            '<button id="city-save" style="flex:1;padding:7px;border:2px solid #0a0e12;border-radius:7px;background:#2ecc71;color:#04121f;font-weight:800;cursor:pointer">Сохранить</button>' +
            '<button id="city-load" style="flex:1;padding:7px;border:2px solid #0a0e12;border-radius:7px;background:#2b3238;color:#e6eaed;font-weight:800;cursor:pointer">Загрузить</button>' +
            '</div>' +
            '<div id="city-flash" style="margin-top:8px;min-height:16px;color:#8fd6ff;opacity:0;transition:opacity .3s"></div>';
        wrap.appendChild(p);
        p.querySelectorAll('button[data-kind]').forEach(function (b) {
            b.onclick = function () {
                cityState.selected = b.getAttribute('data-kind');
                buildCityPanel();
                updateCityHud();
            };
        });
        p.querySelector('#city-save').onclick = saveCity;
        p.querySelector('#city-load').onclick = loadCity;
        updateCityHud();
    }

    function bindVariantButtons() {
        var root = document.getElementById('bld-legend');
        if (!root) return;
        root.querySelectorAll('.vbtn').forEach(function (b) {
            b.style.cssText = 'padding:4px 7px;border:2px solid #0a0e12;border-radius:6px;cursor:pointer;' +
                'background:#2b3238;color:#e6eaed;font:700 10.5px Inter,system-ui,sans-serif';
            b.onclick = function () {
                cityVariants[b.getAttribute('data-kind')] = parseInt(b.getAttribute('data-var'), 10);
                rebuild(tab);
            };
        });
    }

    function open(initialTab, initialWorld) {
        tab = initialTab || tab;
        world = initialWorld || world;
        if (wrap) wrap.remove();
        wrap = el('div');
        wrap.id = 'build-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9880;background:#070b0e;font:13px Inter,system-ui,sans-serif;color:#dce8f7';
        document.body.appendChild(wrap);

        import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.shadowMap.enabled = true;
            renderer.setSize(window.innerWidth, window.innerHeight);
            wrap.appendChild(renderer.domElement);

            buildScene();
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();

            var narrow = window.innerWidth < 760;
            if (narrow) {
                var st2 = document.createElement('style');
                st2.textContent = '#bld-legend{max-width:190px !important;font-size:11px !important;padding:8px !important;' +
                    'max-height:34vh;overflow:auto}' +
                    '#city-panel{width:168px !important;font-size:11px !important;padding:8px !important}' +
                    '#city-panel button{font-size:10.5px !important;padding:4px 6px !important}' +
                    '#build-wrap button{font-size:11px !important;padding:7px 9px !important;border-width:2px !important}';
                document.head.appendChild(st2);
            }
            var walkBtn = el('button', null, '🚶 Пешком');
            walkBtn.id = 'walk-btn';
            walkBtn.style.cssText = 'position:absolute;right:14px;top:64px;z-index:6;padding:10px 16px;' +
                'border:3px solid #0a0e12;border-radius:10px;cursor:pointer;font:800 13px Inter,system-ui,sans-serif;' +
                'background:linear-gradient(#8fd6ff,#2f9fe0);color:#04223a;box-shadow:0 4px 0 #0a0e12';
            walkBtn.onclick = function () { enableWalk(!walk.on); };
            wrap.appendChild(walkBtn);

            var hud = el('div');
            hud.style.cssText = 'position:absolute;left:0;right:0;top:0;display:flex;gap:8px;align-items:center;' +
                'padding:12px 14px;background:linear-gradient(rgba(7,11,14,.9),rgba(7,11,14,0));z-index:3;flex-wrap:wrap';
            hud.innerHTML = '<b style="color:#8fd6ff;font-size:14px">🏗 ПЛАНЕТАРНЫЙ КОНСТРУКТОР</b>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#23262a;' +
                'font:700 12px monospace">мир: ' + (world === 'earth' ? 'Земля' : 'Луна') + '</span>';
            wrap.appendChild(hud);

            if (tab === 'citymode') buildCityPanel();
            if (/[?&]walk=1/.test(location.search)) setTimeout(function () { enableWalk(true); }, 900);

            var legend = el('div');
            legend.id = 'bld-legend';
            legend.style.cssText = 'position:absolute;left:14px;top:64px;z-index:3;background:rgba(10,16,22,.86);' +
                'border:2px solid #101214;border-radius:10px;padding:10px 12px;max-width:290px;' +
                'max-height:76vh;overflow:auto;' +
                'font:12px/1.55 Inter,system-ui,sans-serif;color:#cfdae4';
            legend.innerHTML = legendHtml();
            wrap.appendChild(legend);
            bindVariantButtons();
            if (window.innerWidth < 760) {
                legend.style.display = 'none';
                var lgBtn = el('button', null, '📋 Список');
                lgBtn.style.cssText = 'position:absolute;left:12px;top:56px;z-index:5;padding:7px 11px;' +
                    'border:2px solid #0a0e12;border-radius:8px;background:#2b3238;color:#e6eaed;' +
                    'font:700 12px Inter,system-ui,sans-serif;cursor:pointer';
                lgBtn.onclick = function () {
                    legend.style.display = legend.style.display === 'none' ? 'block' : 'none';
                };
                wrap.appendChild(lgBtn);
            }

            var nav = el('div');
            var narrow2 = window.innerWidth < 760;
            nav.style.cssText = 'position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:4;' +
                (narrow2
                    ? 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;width:94vw;max-width:420px'
                    : 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center');
            function mkBtn(label, active, fn) {
                var b = el('button', null, label);
                b.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                    'font:800 13px Inter,system-ui,sans-serif;box-shadow:0 4px 0 #101214;' +
                    (active ? 'background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00' : 'background:#2b3238;color:#e6eaed');
                b.onclick = fn;
                nav.appendChild(b);
                return b;
            }
            [['city', '🏙 Постройки'], ['paris', '🗼 Париж'], ['ny', '🗽 Нью-Йорк'], ['moscow', '🏰 Москва'], ['beijing', '🏮 Пекин'], ['gz', '🏯 Гуанчжоу'], ['citymode', '🏗 Стройка'], ['ships', '🚀 Корабли'], ['res', '📦 Ресурсы'], ['water', '💧 Вода']].forEach(function (t2) {
                mkBtn(t2[1], tab === t2[0], function () { rebuild(t2[0]); });
            });
            if (!narrow2) nav.appendChild(el('span')).style.cssText = 'width:12px';
            [['earth', '🌍 Земля'], ['moon', '🌕 Луна']].forEach(function (w) {
                mkBtn(w[1], world === w[0], function () { world = w[0]; rebuild(tab); });
            });
            mkBtn('✕ Закрыть', false, function () { cancelAnimationFrame(raf); wrap.remove(); wrap = null; });
            wrap.appendChild(nav);

            orbit(renderer.domElement, camera);
            bindWalkInput(renderer.domElement);
            if (tab === 'citymode') bindCityInput(renderer.domElement);
            raf = requestAnimationFrame(animate);
        }).catch(function (e) {
            var d = el('div', null, 'Не загрузился 3D: ' + (e && e.message ? e.message : e));
            d.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
            wrap.appendChild(d);
        });
    }

    function rebuild(newTab) {
        tab = newTab;
        if (renderer) { renderer.dispose(); renderer = null; }
        if (wrap) { var cv = wrap.querySelector('canvas'); if (cv) cv.remove(); }
        buildScene();
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.shadowMap.enabled = true;
        renderer.setSize(window.innerWidth, window.innerHeight);
        wrap.appendChild(renderer.domElement);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        orbit(renderer.domElement, camera);
        if (tab === 'citymode') bindCityInput(renderer.domElement);
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(animate);
        var cp = document.getElementById('city-panel');
        if (cp) cp.remove();
        if (tab === 'citymode') buildCityPanel();
        var lg = document.getElementById('bld-legend');
        if (lg) { lg.innerHTML = legendHtml(); bindVariantButtons(); }
        var hudSub = wrap.querySelector('span');
        if (hudSub) hudSub.textContent = 'мир: ' + (world === 'earth' ? 'Земля' : 'Луна');
        // перекрашиваем кнопки
        var btns = wrap.querySelectorAll('button');
        var labels = ['🏙 Постройки', '🗼 Париж', '🗽 Нью-Йорк', '🏰 Москва', '🏮 Пекин', '🏯 Гуанчжоу', '🏗 Стройка', '🚀 Корабли', '📦 Ресурсы', '💧 Вода', '🌍 Земля', '🌕 Луна'];
        btns.forEach(function (b) {
            var i = labels.indexOf(b.textContent);
            if (i < 0) return;
            var active = (i === 0 && tab === 'city') || (i === 1 && tab === 'paris') ||
                (i === 2 && tab === 'ny') || (i === 3 && tab === 'moscow') ||
                (i === 4 && tab === 'beijing') || (i === 5 && tab === 'gz') ||
                (i === 6 && tab === 'citymode') || (i === 7 && tab === 'ships') ||
                (i === 8 && tab === 'res') || (i === 9 && tab === 'water') ||
                (i === 10 && world === 'earth') || (i === 11 && world === 'moon');
            b.style.background = active ? 'linear-gradient(#ffe07a,#d8a41c)' : '#2b3238';
            b.style.color = active ? '#2a1f00' : '#e6eaed';
        });
    }

    function orbit(canvas, cam) {
        var drag = false, lx = 0, ly = 0;
        var theta = Math.atan2(cam.position.x, cam.position.z);
        var radius = cam.position.length();
        var phi = Math.acos(cam.position.y / radius);
        canvas.addEventListener('pointerdown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; });
        window.addEventListener('pointerup', function () { drag = false; });
        window.addEventListener('pointermove', function (e) {
            if (!drag) return;
            theta -= (e.clientX - lx) * 0.006;
            phi = Math.max(0.18, Math.min(1.5, phi - (e.clientY - ly) * 0.005));
            lx = e.clientX; ly = e.clientY;
            cam.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.cos(theta));
            cam.lookAt(0, 2, 0);
        });
        canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            radius = Math.max(8, Math.min(90, radius + e.deltaY * 0.05));
            cam.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.cos(theta));
            cam.lookAt(0, 2, 0);
        }, { passive: false });
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('build-btn')) return;
        var b = el('button', 'menu-btn', '🏗 Постройки');
        b.id = 'build-btn';
        b.setAttribute('data-tip', 'Постройки|Все здания, ресурсы и вода из кубиков');
        b.onclick = function () { open('city', 'earth'); };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Build3D = { open: open };

    if (/[?&]build=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(function () {
            ['welcome-screen', 'auth-overlay', 'legend-overlay', 'tut-modal'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
            var mt = location.search.match(/[?&]tab=(paris|ny|moscow|beijing|gz|citymode|ships|city|res|water)/);
            // предустановка вариантов: ?vhouse=3&vpower=3&vfactory=2
            ['house', 'power', 'factory'].forEach(function (k) {
                var m2 = location.search.match(new RegExp('[?&]v' + k + '=([123])'));
                if (m2) cityVariants[k] = parseInt(m2[1], 10);
            });
            if (/[?&]test=1/.test(location.search)) {
                setTimeout(function () {
                    placeAt('house', -6, -4, 0);
                    placeAt('farm', 4, -6, 0);
                    placeAt('market', 0, 5, 0);
                }, 600);
            }
            var mw = location.search.match(/[?&]world=(earth|moon)/);
            open(mt ? mt[1] : 'city', mw ? mw[1] : 'earth');
        }, 1400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
