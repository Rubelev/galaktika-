// Воксельные модели: постройки и корабли из мелких кубиков (0,5 м).
// window.Models3D.build(kind, variant) → THREE.Group из InstancedMesh
(function () {
    'use strict';

    var U = 0.5;   // размер кубика, м

    var C = {
        wall: 0xd9d2c2, wall2: 0xc0b8a6, wall3: 0xa89f8c,
        roof: 0x8a4b3c, roof2: 0x6f3a2e, roof3: 0x3f5a6b,
        steel: 0xa8b2b9, steel2: 0x7d868d, dark: 0x363c42, black: 0x1d2226,
        glass: 0x8fd0ff, glassLit: 0xffd98a, wood: 0xa8743a, wood2: 0x8a5c2c,
        green: 0x3f8a4a, green2: 0x2f6f3a, yellow: 0xd8a41c, red: 0xc9362b,
        white: 0xe8ecef, chrome: 0xc9d2d8, concrete: 0xb8bec2, concrete2: 0x9aa0a4,
        water: 0x3f93cc, sand: 0xb8a878, rust: 0x8a5a3a, copper: 0xb06a3a,
        navy: 0x2f4a6b, space: 0x535e6b, panel: 0x6d777e, gold: 0xd8a41c,
        engine: 0x59b7ff, engineHot: 0xff9a3c, crystal: 0x9ad8f0,
        brick: 0x8d8f92, brick2: 0x77797c, tileGrey: 0x6b7075, tileGrey2: 0x565b60,
        eiffel: 0x8a6a4a, eiffel2: 0x6f5439, zinc: 0x6f7a82, stoneFR: 0xd8cdb8, stoneFR2: 0xc4b8a0,
        copper: 0x5f9a86, copper2: 0x4a8070, granite: 0x9a9a96, granite2: 0x7d7d79,
        kreml: 0xa8352c, kreml2: 0x86261f, gold: 0xd8a41c, gold2: 0xb8860b,
        theatre: 0xe6dcc8, theatre2: 0xcfc3ab, redLacquer: 0xb03a2e, redLacquer2: 0x8c2a20,
        jade: 0x3f7a63, bronze: 0x6b6a4a, curtain: 0x8c1c1c,
        white_stone: 0xe0dcd2, brickRed: 0xb04a3c,
        redCN: 0xb3352c, redCN2: 0x8f2822, goldCN: 0xd8a41c, woodCN: 0x7a3a2a,
        lantern: 0xff4a3a, jade: 0x4a8f6a
    };

    // ---------- воксельный холст ----------
    function Vox(unit) {
        this.map = Object.create(null);
        this.u = unit || U;      // размер кубика у этой модели
    }
    Vox.prototype.add = function (x, y, z, color) {
        this.map[x + '|' + y + '|' + z] = color;
        return this;
    };
    Vox.prototype.box = function (x, y, z, w, h, d, color) {
        for (var i = 0; i < w; i++) {
            for (var j = 0; j < h; j++) {
                for (var k = 0; k < d; k++) {
                    this.map[(x + i) + '|' + (y + j) + '|' + (z + k)] = typeof color === 'function'
                        ? color(i, j, k) : color;
                }
            }
        }
        return this;
    };
    // цвета, которые светятся: окна, фонари, золото
    var GLOW = {};
    GLOW[0xffd98a] = 1.0;   // тёплые окна
    GLOW[0xff4a3a] = 0.9;   // красные фонарики
    GLOW[0xd8a41c] = 0.25;  // золото
    GLOW[0x8fd0ff] = 0.3;   // холодное стекло

    Vox.prototype.toGroup = function (THREE) {
        var g = new THREE.Group();
        var u = this.u;                 // внутри forEach свой this — берём заранее
        var byColor = Object.create(null);
        for (var key in this.map) {
            var c = this.map[key];
            if (!byColor[c]) byColor[c] = [];
            byColor[c].push(key);
        }
        var geo = new THREE.BoxGeometry(u, u, u);
        Object.keys(byColor).forEach(function (c) {
            var list = byColor[c];
            var col = parseInt(c, 10);
            var mat = new THREE.MeshLambertMaterial({ color: col });
            if (GLOW[col] !== undefined) {
                mat.emissive = new THREE.Color(col);
                mat.emissiveIntensity = GLOW[col];
            }
            var mesh = new THREE.InstancedMesh(geo, mat, list.length);
            var m4 = new THREE.Matrix4();
            list.forEach(function (k, i) {
                var p = k.split('|');
                m4.makeTranslation(parseInt(p[0], 10) * u, parseInt(p[1], 10) * u, parseInt(p[2], 10) * u);
                mesh.setMatrixAt(i, m4);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            g.add(mesh);
        });
        return g;
    };

    // ---------- постройки ----------
    var BUILDINGS = {
        // жилой дом: 3 варианта — модуль, трёхэтажный, квартал-город
        house: function (v, variant) {
            if (variant === 3) {
                // квартал: 3 башни по 12 этажей, стилобат, двор
                var towers = [[0, 0], [22, 0], [11, 22]];
                v.box(-2, 0, -2, 40, 2, 44, C.concrete);                 // стилобат
                v.box(-2, 2, -2, 40, 1, 44, C.concrete2);
                towers.forEach(function (t, ti) {
                    var bx0 = t[0], bz = t[1];
                    for (var f = 0; f < 12; f++) {
                        var y = 3 + f * 4;
                        v.box(bx0, y, bz, 12, 3, 12, f % 2 ? C.wall2 : C.wall);
                        // окна по кругу
                        for (var k = 1; k < 11; k += 2) {
                            v.box(bx0 + k, y + 1, bz + 12, 1, 2, 1, C.glassLit);
                            v.box(bx0 + k, y + 1, bz - 1, 1, 2, 1, C.glassLit);
                            v.box(bx0 + 12, y + 1, bz + k, 1, 2, 1, C.glass);
                            v.box(bx0 - 1, y + 1, bz + k, 1, 2, 1, C.glass);
                        }
                        v.box(bx0 - 1, y + 3, bz - 1, 14, 1, 14, C.wall3);   // перекрытие
                    }
                    v.box(bx0 - 1, 51, bz - 1, 14, 1, 14, C.roof);            // крыша
                    v.box(bx0 + 4, 52, bz + 4, 4, 3, 4, C.steel2);            // техэтаж
                    v.box(bx0 + 5, 55, bz + 5, 2, 2, 2, C.glassLit);          // маяк
                });
                // переходы между башнями
                v.box(10, 6, 4, 14, 2, 4, C.steel);
                v.box(10, 6, 18, 2, 2, 14, C.steel);
                // двор
                v.box(13, 2, 8, 8, 1, 12, C.green);
                v.box(14, 2, 10, 6, 1, 8, C.sand);
                return v;
            }
            var big = variant === 2;
            var w = big ? 14 : 10, d = big ? 12 : 9, floors = big ? 3 : 2;
            v.box(0, 0, 0, w + 2, 2, d + 2, C.concrete);                    // фундамент
            for (var f = 0; f < floors; f++) {
                var y = 2 + f * 4;
                v.box(1, y, 1, w, 3, d, f === 0 ? C.wall : C.wall2);        // этаж
                // окна по фасаду и бокам
                for (var x = 2; x < w - 1; x += 3) {
                    v.box(x, y + 1, d, 1, 2, 1, C.glassLit);
                    v.box(x, y + 1, 0, 1, 2, 1, C.glass);
                }
                for (var z = 3; z < d - 2; z += 3) {
                    v.box(w, y + 1, z, 1, 2, 1, C.glass);
                    v.box(0, y + 1, z, 1, 2, 1, C.glass);
                }
                v.box(0, y + 3, 0, w + 2, 1, d + 2, C.wall3);               // межэтажное перекрытие
            }
            // дверь
            v.box(2, 2, d, 2, 3, 1, C.wood);
            // крыша двускатная
            var top = 2 + floors * 4;
            for (var i = 0; i < (big ? 5 : 4); i++) {
                v.box(0 + i, top + i, 0 + i, w + 2 - i * 2, 1, d + 2 - i * 2, i % 2 ? C.roof2 : C.roof);
            }
            // труба и антенна
            v.box(w - 3, top + 2, 3, 1, 3, 1, C.concrete2);
            v.box(w - 3, top + 5, 3, 1, 1, 1, C.dark);
            if (big) v.box(1, top + 6, 1, 1, 3, 1, C.steel2);
            return v;
        },
        farm: function (v) {
            v.box(0, 0, 0, 20, 2, 16, C.green2);                             // поле
            for (var r = 1; r < 15; r += 2) {
                v.box(1, 2, r, 18, 1, 1, C.wood2);                            // грядки
                for (var x = 2; x < 18; x += 2) v.box(x, 3, r, 1, 2, 1, C.green);
            }
            // теплица
            v.box(2, 2, 2, 8, 1, 6, C.steel2);
            v.box(2, 3, 2, 8, 4, 1, C.glass);
            v.box(2, 3, 7, 8, 4, 1, C.glass);
            v.box(2, 3, 3, 1, 4, 4, C.glass);
            v.box(9, 3, 3, 1, 4, 4, C.glass);
            v.box(2, 7, 2, 8, 1, 6, C.steel);
            for (var gx = 3; gx < 9; gx += 2) v.box(gx, 3, 4, 1, 1, 2, C.green);
            // силос
            v.box(14, 2, 11, 4, 8, 4, C.concrete2);
            v.box(13, 10, 10, 6, 2, 6, C.steel);
            v.box(14, 12, 11, 4, 1, 4, C.roof2);
            return v;
        },
        factory: function (v, variant) {
            var big = variant === 2;
            var w = big ? 22 : 18, d = big ? 14 : 12;
            v.box(0, 0, 0, w + 2, 2, d + 2, C.concrete2);                    // плита
            v.box(1, 2, 1, w, 7, d, C.wall2);                                // цех
            // ленточные окна
            for (var x = 2; x < w - 1; x += 2) v.box(x, 5, d, 1, 3, 1, C.glass);
            // ворота
            v.box(3, 2, d, 4, 4, 1, C.dark);
            v.box(3, 6, d, 4, 1, 1, C.steel2);
            // крыша-пила
            for (var i = 0; i < 3; i++) {
                v.box(1 + i * 6, 9, 1, 5, 1, d, C.panel);
                v.box(1 + i * 6, 10, 1, 5, 1, 1, C.glass);
            }
            // трубы
            var pipes = big ? 4 : 3;
            for (var p = 0; p < pipes; p++) {
                var px = 2 + p * 4;
                v.box(px, 9, 3, 2, 9, 2, C.concrete2);
                v.box(px - 1, 18, 2, 4, 1, 4, C.red);
                v.box(px, 19, 3, 2, 1, 2, C.dark);
            }
            // рольганг
            v.box(w - 2, 2, d + 1, 4, 1, 3, C.steel2);
            // резервуар
            v.box(w - 6, 2, -4, 4, 6, 4, C.white);
            v.box(w - 5, 8, -3, 2, 1, 2, C.steel);
            return v;
        },
        mine: function (v) {
            v.box(0, 0, 0, 16, 2, 16, C.rock || C.concrete2);
            v.box(3, 2, 3, 10, 5, 10, C.dark);                               // устье шахты
            v.box(3, 7, 3, 10, 1, 10, C.black);
            // копёр
            [[2, 2], [12, 2], [2, 12], [12, 12]].forEach(function (p) {
                v.box(p[0], 2, p[1], 1, 16, 1, C.steel2);
            });
            v.box(2, 18, 2, 11, 1, 1, C.steel2);
            v.box(2, 18, 12, 11, 1, 1, C.steel2);
            v.box(2, 18, 2, 1, 1, 11, C.steel2);
            v.box(12, 18, 2, 1, 1, 11, C.steel2);
            // шкив
            for (var a = 0; a < 12; a++) {
                var ang = a / 12 * Math.PI * 2;
                var wx = 7 + Math.round(Math.cos(ang) * 3), wy = 19 + Math.round(Math.sin(ang) * 3);
                v.box(wx, wy, 7, 1, 1, 1, C.yellow);
            }
            // вагонетки и отвал
            v.box(14, 2, 4, 2, 2, 2, C.rust);
            v.box(14, 2, 7, 2, 2, 2, C.rust);
            v.box(13, 2, 11, 3, 1, 3, C.copper);
            return v;
        },
        warehouse: function (v) {
            v.box(0, 0, 0, 22, 2, 16, C.concrete);
            v.box(1, 2, 1, 20, 8, 14, C.wall2);
            // крыша
            for (var i = 0; i < 4; i++) v.box(i, 10 + i, i, 22 - i * 2, 1, 16 - i * 2, C.roof);
            // ворота
            for (var g = 0; g < 3; g++) {
                v.box(2 + g * 6, 2, 15, 4, 5, 1, C.dark);
                v.box(2 + g * 6, 7, 15, 4, 1, 1, C.steel2);
            }
            // паллеты у входа
            for (var p = 0; p < 4; p++) {
                v.box(1 + p * 5, 2, 17, 2, 2, 2, C.wood);
                v.box(1 + p * 5, 4, 17, 2, 1, 2, C.wood2);
            }
            return v;
        },
        power: function (v, variant) {
            if (variant === 3) {
                // лунная: реактор + поле радиаторов (воды нет)
                v.box(0, 0, 0, 46, 2, 30, C.concrete2);
                v.box(4, 2, 10, 12, 8, 10, C.white);                       // корпус реактора
                for (var d2 = 0; d2 < 3; d2++) v.box(4 + d2, 10 + d2, 10 + d2, 12 - d2 * 2, 1, 10 - d2 * 2, C.chrome);
                v.box(8, 13, 14, 4, 2, 2, C.steel2);
                // радиаторные панели: 4 ряда по 3
                for (var r = 0; r < 4; r++) {
                    for (var c = 0; c < 3; c++) {
                        var px = 20 + c * 8, pz = 3 + r * 7;
                        v.box(px, 2, pz, 7, 1, 6, C.navy);                 // панель
                        v.box(px + 3, 1, pz + 2, 1, 1, 1, C.steel2);        // стойка
                        v.box(px, 2, pz, 1, 3, 6, C.chrome);                // ребро
                    }
                }
                // трубы теплоносителя
                v.box(16, 3, 14, 6, 1, 1, C.copper);
                v.box(16, 3, 8, 6, 1, 1, C.copper);
                return v;
            }
            var big = variant === 2;
            v.box(0, 0, 0, 20, 2, 20, C.concrete2);
            // реактор
            v.box(5, 2, 5, 10, 8, 10, C.white);
            for (var s = 0; s < 4; s++) v.box(5 + s, 10 + s, 5 + s, 10 - s * 2, 1, 10 - s * 2, C.chrome);
            v.box(9, 14, 9, 2, 2, 2, C.steel2);
            // градирни
            [[2, 14], [15, 14]].forEach(function (p) {
                v.box(p[0], 2, p[1], 4, 6, 4, C.concrete);
                v.box(p[0] - 1, 8, p[1] - 1, 6, 3, 6, C.concrete2);
                v.box(p[0] - 1, 11, p[1] - 1, 6, 1, 6, C.dark);
            });
            // солнечные панели
            var panels = big ? 4 : 2;
            for (var i = 0; i < panels; i++) {
                v.box(1, 3 + i, 1, 3, 1, 6, C.navy);
                v.box(1, 2, 1, 1, 1, 1, C.steel2);
                v.box(1, 2, 6, 1, 1, 1, C.steel2);
            }
            // кабели
            v.box(6, 2, 16, 10, 1, 1, C.black);
            return v;
        },
        defense: function (v) {
            v.box(0, 0, 0, 10, 2, 10, C.concrete2);
            for (var i = 0; i < 8; i++) {
                v.box(1 + (i >> 1), 2 + i, 1 + (i >> 1), 8 - i, 1, 8 - i, i % 2 ? C.steel : C.steel2);
            }
            v.box(2, 11, 2, 6, 1, 6, C.dark);                               // площадка
            v.box(3, 12, 3, 4, 2, 4, C.panel);                              // турель
            v.box(4, 13, 5, 2, 1, 6, C.dark);                               // ствол
            v.box(4, 14, 5, 2, 1, 3, C.black);
            // антенна
            v.box(1, 12, 1, 1, 6, 1, C.chrome);
            v.box(0, 17, 0, 3, 1, 3, C.red);
            // прожектор
            v.box(8, 9, 8, 1, 2, 1, C.steel2);
            v.box(8, 11, 8, 1, 1, 1, C.glassLit);
            return v;
        },
        market: function (v) {
            v.box(0, 0, 0, 18, 1, 12, C.concrete);
            // три павильона
            for (var i = 0; i < 3; i++) {
                var x = 1 + i * 6;
                v.box(x, 1, 2, 5, 1, 4, C.wood);
                v.box(x, 2, 3, 4, 2, 1, C.wood2);
                // столбы
                v.box(x, 1, 1, 1, 4, 1, C.steel2);
                v.box(x + 4, 1, 1, 1, 4, 1, C.steel2);
                v.box(x, 1, 5, 1, 4, 1, C.steel2);
                v.box(x + 4, 1, 5, 1, 4, 1, C.steel2);
                // навес
                var col = i === 0 ? C.red : (i === 1 ? C.yellow : C.green);
                v.box(x - 1, 5, 1, 7, 1, 5, col);
                v.box(x - 1, 6, 1, 7, 1, 1, col);
                // товар
                v.box(x + 1, 2, 3, 1, 1, 1, C.copper);
                v.box(x + 2, 2, 3, 1, 1, 1, C.green);
            }
            // вывеска
            v.box(7, 7, 6, 4, 2, 1, C.yellow);
            return v;
        },
        shipyard: function (v) {
            v.box(0, 0, 0, 24, 2, 18, C.concrete2);
            // стапель
            for (var i = 0; i < 5; i++) {
                v.box(2 + i * 5, 2, 2, 1, 10, 1, C.yellow);
                v.box(2 + i * 5, 2, 15, 1, 10, 1, C.yellow);
            }
            v.box(2, 12, 2, 1, 1, 14, C.yellow);
            v.box(22, 12, 2, 1, 1, 14, C.yellow);
            v.box(2, 12, 8, 21, 1, 1, C.yellow);
            // строящийся корабль (упрощённый)
            v.box(5, 2, 6, 12, 2, 6, C.steel);
            v.box(6, 4, 7, 9, 2, 4, C.white);
            v.box(7, 6, 8, 4, 1, 2, C.glass);
            v.box(16, 3, 7, 2, 2, 4, C.steel2);
            // леса
            v.box(6, 2, 4, 1, 8, 1, C.wood);
            v.box(14, 2, 4, 1, 8, 1, C.wood);
            v.box(6, 8, 4, 9, 1, 1, C.wood2);
            return v;
        },
        spaceport: function (v) {
            v.box(0, 0, 0, 76, 2, 52, C.concrete);                        // перрон
            // разметка стоянок
            for (var i = 0; i < 4; i++) {
                v.box(6 + i * 17, 2, 6, 14, 1, 1, C.yellow);
                v.box(6 + i * 17, 2, 44, 14, 1, 1, C.yellow);
                v.box(6 + i * 17, 2, 6, 1, 1, 38, C.yellow);
            }
            // корабли на стоянках (упрощённые)
            [[8, 10, C.chrome, 12], [25, 10, C.white, 16], [42, 10, C.dark, 18], [59, 10, C.steel, 20]].forEach(function (sh) {
                var x = sh[0], z = sh[1], col = sh[2], len = sh[3];
                v.box(x, 3, z, len, 3, 7, col);
                v.box(x + 2, 6, z + 2, Math.round(len / 2), 2, 3, C.glass);
                v.box(x + len - 1, 4, z + 1, 2, 2, 5, C.steel2);
                v.box(x - 1, 4, z + 2, 1, 2, 3, C.engine);
            });
            // полосы
            v.box(2, 2, 48, 72, 1, 2, C.dark);
            v.box(2, 2, 51, 72, 1, 2, C.dark);
            // диспетчерская
            v.box(60, 2, 40, 8, 22, 8, C.wall2);
            v.box(59, 24, 39, 10, 4, 10, C.glass, { emissive: 0x8fd0ff, intensity: 0.3 });
            v.box(62, 28, 42, 4, 2, 4, C.steel2);
            // ангары ТО
            [[6, 26], [22, 26], [38, 26]].forEach(function (h) {
                v.box(h[0], 2, h[1], 14, 8, 10, C.steel);
                v.box(h[0] + 5, 2, h[1] + 10, 4, 5, 1, C.dark);
                v.box(h[0], 10, h[1], 14, 1, 10, C.panel);
            });
            return v;
        },
        docks: function (v) {
            v.box(0, 0, 0, 84, 2, 56, C.concrete2);                       // территория
            // 4 сухих дока
            for (var d = 0; d < 4; d++) {
                var dx = 4 + d * 20;
                v.box(dx, 2, 6, 16, 6, 34, C.dark);                        // котлован
                v.box(dx, 7, 6, 16, 1, 34, C.black);
                v.box(dx, 8, 6, 1, 10, 34, C.steel2);                      // стенки
                v.box(dx + 15, 8, 6, 1, 10, 34, C.steel2);
                // корабль в доке
                v.box(dx + 3, 7, 12, 11, 3, 12, C.chrome);
                v.box(dx + 5, 10, 15, 6, 2, 6, C.white);
                v.box(dx + 6, 12, 16, 3, 1, 3, C.glass);
                // кран над доком
                v.box(dx + 1, 18, 20, 15, 1, 1, C.yellow);
                v.box(dx + 7, 14, 20, 1, 4, 1, C.yellow);
                v.box(dx + 7, 13, 19, 1, 1, 3, C.dark);
            }
            // мастерские
            v.box(4, 2, 44, 32, 8, 10, C.wall2);
            for (var w = 0; w < 8; w++) v.box(6 + w * 4, 5, 44, 2, 2, 1, C.glassLit);
            // склады
            v.box(40, 2, 44, 22, 10, 10, C.steel);
            v.box(64, 2, 44, 16, 7, 10, C.panel);
            // кран-балка
            v.box(38, 2, 26, 1, 24, 1, C.yellow);
            v.box(46, 2, 26, 1, 24, 1, C.yellow);
            v.box(38, 26, 26, 9, 1, 1, C.yellow);
            return v;
        },
        // сыхэюань: двор, стены, ворота, серая черепица
        siheyuan: function (v) {
            v.box(0, 0, 0, 18, 1, 18, C.brick2);                          // мощение двора
            // внешние стены
            v.box(0, 1, 0, 18, 4, 1, C.brick);
            v.box(0, 1, 17, 18, 4, 1, C.brick);
            v.box(0, 1, 0, 1, 4, 18, C.brick);
            v.box(17, 1, 0, 1, 4, 18, C.brick);
            // крыши по стенам
            v.box(-1, 5, -1, 20, 1, 2, C.tileGrey);
            v.box(-1, 5, 17, 20, 1, 2, C.tileGrey);
            v.box(-1, 5, -1, 2, 1, 20, C.tileGrey);
            v.box(17, 5, -1, 2, 1, 20, C.tileGrey);
            // загнутые края
            v.box(-2, 6, -2, 2, 1, 2, C.tileGrey2);
            v.box(18, 6, -2, 2, 1, 2, C.tileGrey2);
            v.box(-2, 6, 18, 2, 1, 2, C.tileGrey2);
            v.box(18, 6, 18, 2, 1, 2, C.tileGrey2);
            // дом в глубине двора
            v.box(4, 1, 11, 10, 5, 5, C.brick);
            v.box(3, 6, 10, 12, 1, 7, C.tileGrey);
            v.box(2, 7, 9, 2, 1, 9, C.tileGrey2);
            v.box(14, 7, 9, 2, 1, 9, C.tileGrey2);
            for (var w = 0; w < 3; w++) v.box(5 + w * 3, 3, 10, 2, 2, 1, C.woodCN);
            // ворота с красной дверью
            v.box(7, 1, 0, 4, 4, 1, C.redCN);
            v.box(6, 5, -1, 6, 1, 2, C.tileGrey2);
            v.box(8, 2, 0, 2, 2, 1, C.goldCN);
            // дерево во дворе
            v.box(13, 1, 4, 1, 3, 1, C.woodCN);
            v.box(11, 4, 2, 5, 2, 5, C.jade);
            // каменные львы
            v.box(5, 1, 1, 1, 2, 1, C.concrete2);
            v.box(12, 1, 1, 1, 2, 1, C.concrete2);
            return v;
        },
        // пагода: 5 ярусов с нависающими крышами
        pagoda: function (v) {
            v.box(-2, 0, -2, 16, 2, 16, C.brick2);                        // основание
            var y = 2, w = 10;
            for (var i = 0; i < 5; i++) {
                v.box(3, y, 3, w, 3, w, i % 2 ? C.redCN : C.redCN2);      // ярус
                for (var k = 0; k < 3; k++) {
                    v.box(3 + (w >> 1) - 1, y + 1, 3 + k * 3, 1, 2, 1, C.goldCN);
                }
                // крыша с выносом
                v.box(1, y + 3, 1, w + 4, 1, w + 4, C.tileGrey);
                v.box(0, y + 4, 0, w + 6, 1, w + 6, C.tileGrey2);
                // загнутые углы
                v.box(-1, y + 5, -1, 2, 1, 2, C.tileGrey2);
                v.box(w + 3, y + 5, -1, 2, 1, 2, C.tileGrey2);
                v.box(-1, y + 5, w + 3, 2, 1, 2, C.tileGrey2);
                v.box(w + 3, y + 5, w + 3, 2, 1, 2, C.tileGrey2);
                y += 5; w = Math.max(4, w - 2);
            }
            // шпиль
            v.box(6, y, 6, 2, 4, 2, C.goldCN);
            v.box(5, y + 4, 5, 4, 1, 4, C.goldCN);
            v.box(6, y + 5, 6, 2, 2, 2, C.goldCN);
            return v;
        },
        // башня-барабан: красные колонны, двойная крыша
        gate_tower: function (v) {
            v.box(0, 0, 0, 22, 3, 14, C.brick2);                          // каменное основание
            // проезд
            v.box(8, 0, 0, 6, 3, 1, C.dark);
            for (var i = 0; i < 5; i++) {
                v.box(1 + i * 4, 3, 1, 1, 6, 1, C.redCN);                 // колонны
                v.box(1 + i * 4, 3, 12, 1, 6, 1, C.redCN);
            }
            v.box(0, 7, 0, 22, 2, 14, C.redCN2);                          // стены
            for (var w2 = 0; w2 < 4; w2++) v.box(3 + w2 * 5, 8, 13, 2, 2, 1, C.goldCN);
            v.box(-1, 9, -1, 24, 1, 16, C.tileGrey);                      // нижняя крыша
            v.box(-2, 10, -2, 26, 1, 18, C.tileGrey2);
            v.box(4, 11, 3, 14, 4, 8, C.redCN);                           // второй ярус
            v.box(2, 15, 1, 18, 1, 12, C.tileGrey);
            v.box(1, 16, 0, 20, 1, 14, C.tileGrey2);
            v.box(10, 17, 6, 2, 2, 2, C.goldCN);                          // шпиль
            return v;
        },
        // храм: широкий зал с золотой крышей
        temple: function (v) {
            v.box(-2, 0, -2, 26, 2, 16, C.brick2);
            for (var i = 0; i < 6; i++) {
                v.box(1 + i * 4, 2, 1, 1, 6, 1, C.redCN);
                v.box(1 + i * 4, 2, 12, 1, 6, 1, C.redCN);
            }
            v.box(0, 2, 13, 22, 5, 1, C.redCN2);                          // стена
            v.box(9, 2, 13, 4, 4, 1, C.goldCN);                           // двери
            v.box(-3, 8, -3, 28, 1, 18, C.goldCN);                        // крыша
            v.box(-4, 9, -4, 30, 1, 20, C.goldCN);
            v.box(-5, 10, -5, 32, 1, 22, C.goldCN);
            v.box(10, 11, 6, 3, 2, 3, C.goldCN);
            return v;
        },
        // пайфан: арочные ворота
        paifang: function (v) {
            [[0, 0], [10, 0], [20, 0]].forEach(function (p) {
                v.box(p[0], 0, 0, 2, 9, 2, C.redCN);
            });
            v.box(-1, 9, -1, 24, 1, 4, C.redCN2);                         // перекладина
            v.box(-2, 10, -2, 26, 1, 6, C.tileGrey);
            v.box(-1, 11, -1, 24, 1, 4, C.tileGrey2);
            v.box(8, 10, 0, 6, 2, 1, C.goldCN);                           // табличка
            v.box(9, 12, 0, 4, 1, 1, C.goldCN);
            return v;
        },
        // Кантонская башня: скрученная решётка, талия, смотровая площадка
        canton_tower: function (v) {
            var H = 60, seg = 12;
            for (var y = 0; y < H; y++) {
                var t = y / (H - 1);
                // талия по середине: узко на 45 %, шире к низу и верху
                var waist = 1 + Math.sin((t - 0.45) * Math.PI) * 0.55;
                var r = (3.2 + (1 - t) * 3.6) * waist;
                var twist = t * Math.PI * 0.9;              // скрутка
                for (var k = 0; k < seg; k++) {
                    var a = k / seg * Math.PI * 2 + twist;
                    var px = Math.round(Math.cos(a) * r);
                    var pz = Math.round(Math.sin(a) * r);
                    v.add(px, y, pz, y % 6 === 0 ? C.chrome : C.steel);
                }
            }
            // смотровая площадка
            for (var a2 = 0; a2 < 24; a2++) {
                var ang = a2 / 24 * Math.PI * 2;
                v.add(Math.round(Math.cos(ang) * 6), 44, Math.round(Math.sin(ang) * 6), C.glass);
                v.add(Math.round(Math.cos(ang) * 7), 45, Math.round(Math.sin(ang) * 7), C.white);
            }
            // ядро и шпиль
            for (var y2 = 0; y2 < 52; y2++) v.add(0, y2, 0, C.steel2);
            v.box(0, 60, 0, 1, 14, 1, C.chrome);
            v.box(0, 74, 0, 1, 4, 1, C.redCN);
            // основание
            v.box(-5, 0, -5, 11, 2, 11, C.concrete2);
            return v;
        },
        // вантовый мост
        // вантовый мост: полотно с пролётом, два пилона, главный трос и подвесы
        pearl_bridge: function (v) {
            var L = 74;                 // длина основного пролёта (37 м)
            var W = 10;                 // ширина (5 м)
            var DECK = 4;               // высота полотна над землёй
            var PY = 38;                // высота пилона над полотном (19 м)
            var half = Math.floor(W / 2);
            var PYL = [16, L - 20];     // позиции пилонов
            var xm = (PYL[0] + PYL[1]) / 2;

            var deckY = function (x) { return DECK + Math.round(Math.sin(x / L * Math.PI) * 3); };

            // ---- полотно ----
            for (var x = 0; x < L; x++) {
                var y = deckY(x);
                v.box(x, y, -half, 1, 1, W, C.concrete);
                v.box(x, y + 1, -half, 1, 1, 1, C.steel2);
                v.box(x, y + 1, half - 1, 1, 1, 1, C.steel2);
                if (x % 4 < 2) v.box(x, y + 1, 0, 1, 1, 1, C.yellow);
                if (x % 12 === 0) {                       // промежуточные опоры
                    v.box(x, 0, -half + 1, 2, y, 2, C.steel2);
                    v.box(x, 0, half - 2, 2, y, 2, C.steel2);
                }
            }

            // ---- съезды на берега: полотно плавно опускается вниз ----
            [[-1, 0], [1, L - 1]].forEach(function (side) {
                var dir = side[0], x0 = side[1];
                for (var t = 1; t <= 9; t++) {
                    var px = x0 + dir * t;
                    var py = Math.max(1, deckY(0) - t);
                    v.box(px, py, -half, 1, 1, W, C.concrete);
                    v.box(px, py + 1, -half, 1, 1, 1, C.concrete2);
                    v.box(px, py + 1, half - 1, 1, 1, 1, C.concrete2);
                    for (var k = 0; k < py; k++) {           // насыпь под съездом
                        v.box(px, k, -half + 1, 1, 1, W - 2, C.sand);
                    }
                }
            });

            // ---- береговые устои ----
            [0, L - 5].forEach(function (bx2) {
                for (var i = 0; i < 5; i++) {
                    v.box(bx2 + i, 0, -half - 1, 1, deckY(bx2) + 2 - i, W + 2, C.concrete);
                }
            });

            // ---- пилоны ----
            PYL.forEach(function (px) {
                var yT = deckY(px) + PY;
                [-half - 1, half].forEach(function (pz) {
                    v.box(px, deckY(px), pz, 3, PY, 3, C.white);
                    v.box(px, yT, pz, 3, 2, 3, C.redCN);
                });
                v.box(px, yT - 6, -half - 1, 3, 2, W + 4, C.white);       // ригель
                // подкосы пилона к полотну
                for (var t2 = 1; t2 <= 6; t2++) {
                    v.add(px - 3 - t2, deckY(px) + PY - 6 - t2 * 2, -half, C.white);
                    v.add(px + 3 + t2, deckY(px) + PY - 6 - t2 * 2, -half, C.white);
                    v.add(px - 3 - t2, deckY(px) + PY - 6 - t2 * 2, half - 1, C.white);
                    v.add(px + 3 + t2, deckY(px) + PY - 6 - t2 * 2, half - 1, C.white);
                }
            });

            // ---- главный трос: парабола между пилонами с провисом ----
            var yTop = deckY(xm) + PY - 8;
            var span = (PYL[1] - PYL[0]) / 2;
            var cableY = function (x) {
                var t = (x - xm) / Math.max(1, span);
                return yTop - Math.round((1 - t * t) * 10);   // провис 10 кубиков в середине
            };
            for (var cx = 2; cx < L - 2; cx++) {
                var cy = cableY(cx);
                if (cy <= deckY(cx)) continue;
                v.add(cx, cy, -half, C.chrome);
                v.add(cx, cy, half - 1, C.chrome);
            }

            // ---- подвесы каждые 6 кубиков (3 м) ----
            for (var hx = 4; hx < L - 4; hx += 6) {
                var ty = cableY(hx);
                if (ty <= deckY(hx) + 1) continue;
                for (var yy = deckY(hx) + 1; yy < ty; yy++) {
                    v.add(hx, yy, -half, C.chrome);
                    v.add(hx, yy, half - 1, C.chrome);
                }
            }

            // ---- фонари на полотне ----
            for (var lx = 6; lx < L - 6; lx += 9) {
                var ly = deckY(lx) + 1;
                v.box(lx, ly, -half, 1, 2, 1, C.steel2);
                v.box(lx, ly + 2, -half, 1, 1, 1, C.glassLit);
                v.box(lx, ly, half - 1, 1, 2, 1, C.steel2);
                v.box(lx, ly + 2, half - 1, 1, 1, 1, C.glassLit);
            }
            return v;
        },
        // речной трамвайчик
        river_boat: function (v) {
            v.box(0, 0, 0, 10, 2, 4, C.white);
            v.box(1, 2, 0, 6, 2, 3, C.glass);
            v.box(7, 2, 1, 2, 2, 2, C.steel2);
            v.box(0, 2, 1, 1, 1, 1, C.redCN);
            return v;
        },
        // оперный театр: два «камня» с плавными уступами
        opera: function (v) {
            for (var i = 0; i < 6; i++) {
                v.box(2 + i, 0, 2 + i, 18 - i * 2, 1, 12 - i * 2, i % 2 ? C.white : C.chrome);
            }
            v.box(6, 6, 5, 8, 2, 5, C.glass);
            v.box(9, 8, 7, 3, 1, 3, C.goldCN);
            return v;
        },
        // Эйфелева башня: 4 ноги, 3 площадки, арки, шпиль
        eiffel: function (v) {
            var H = 64;
            for (var y = 0; y < H; y++) {
                var t = y / (H - 1);
                // ноги сходятся к центру: от 9 до 1.5
                var spread = 9 - t * 7.5;
                // четыре ноги
                [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
                    var px = Math.round(c[0] * spread);
                    var pz = Math.round(c[1] * spread);
                    v.add(px, y, pz, y % 8 === 0 ? C.eiffel2 : C.eiffel);
                    // толщина ноги у основания
                    if (y < 8) {
                        v.add(px + c[0], y, pz, C.eiffel);
                        v.add(px, y, pz + c[1], C.eiffel);
                    }
                });
                // решётка между ногами
                if (y % 3 === 0 && y > 2) {
                    for (var k = -Math.round(spread); k <= Math.round(spread); k++) {
                        v.add(k, y, Math.round(-spread), C.eiffel);
                        v.add(k, y, Math.round(spread), C.eiffel);
                        v.add(Math.round(-spread), y, k, C.eiffel);
                        v.add(Math.round(spread), y, k, C.eiffel);
                    }
                }
                // арки у основания
                if (y >= 6 && y <= 12) {
                    var archR = 5.5 - Math.abs(y - 9) * 0.7;
                    for (var a = 0; a < 18; a++) {
                        var ang = a / 18 * Math.PI;
                        var ax = Math.round(Math.cos(ang) * archR);
                        var ay = y;
                        v.add(ax, ay, Math.round(-spread), C.eiffel2);
                        v.add(ax, ay, Math.round(spread), C.eiffel2);
                    }
                }
            }
            // площадки: 1-я, 2-я, 3-я
            [[8, 7], [22, 5], [40, 3]].forEach(function (pf) {
                var y = pf[0], r = pf[1];
                for (var x = -r; x <= r; x++) {
                    for (var z = -r; z <= r; z++) {
                        if (x * x + z * z > r * r) continue;
                        v.add(x, y, z, C.eiffel2);
                        if (x * x + z * z <= (r - 1) * (r - 1)) v.add(x, y + 1, z, C.zinc);
                    }
                }
            });
            // верхняя башенка и шпиль
            v.box(-1, H, -1, 3, 2, 3, C.eiffel2);
            v.box(0, H + 2, 0, 1, 10, 1, C.eiffel);
            v.box(0, H + 12, 0, 1, 3, 1, C.redCN);
            // основание
            v.box(-11, 0, -11, 23, 1, 23, C.stoneFR2);
            return v;
        },
        // османовский дом: камень, балконы, цинковая мансарда
        haussmann: function (v) {
            var W = 16, D = 10, F = 5;
            v.box(0, 0, 0, W, 1, D, C.stoneFR2);
            for (var f = 0; f < F; f++) {
                var y = 1 + f * 3;
                v.box(0, y, 0, W, 3, D, C.stoneFR);
                for (var w = 1; w < W - 1; w += 3) {
                    v.box(w, y + 1, D, 1, 2, 1, C.glassLit);
                    v.box(w, y + 1, 0, 1, 2, 1, (w % 2 ? C.glassLit : C.glass));
                }
                // балкон
                if (f === 1 || f === 3) {
                    v.box(0, y, D, W, 1, 1, C.eiffel2);
                }
            }
            // мансарда
            for (var i = 0; i < 3; i++) {
                v.box(i, 1 + F * 3 + i, i, W - i * 2, 1, D - i * 2, C.zinc);
            }
            v.box(2, 1 + F * 3, 2, 3, 2, 2, C.zinc);
            // дымовые трубы
            v.box(3, 1 + F * 3 + 3, 3, 1, 2, 1, C.brick2);
            v.box(W - 4, 1 + F * 3 + 3, 3, 1, 2, 1, C.brick2);
            return v;
        },
        // статуя Свободы: звезда-форт, пьедестал, фигура с факелом
        liberty: function (v) {
            // звезда-основание (11 лучей)
            for (var a = 0; a < 11; a++) {
                var ang = a / 11 * Math.PI * 2;
                for (var r = 4; r <= 9; r++) {
                    v.add(Math.round(Math.cos(ang) * r), 0, Math.round(Math.sin(ang) * r), C.granite2);
                    v.add(Math.round(Math.cos(ang) * r), 1, Math.round(Math.sin(ang) * r), C.granite);
                }
            }
            v.box(-4, 2, -4, 9, 1, 9, C.granite);
            // пьедестал
            for (var y = 3; y < 12; y++) {
                var w = 7 - Math.floor((y - 3) / 3);
                v.box(-w, y, -w, w * 2 + 1, 1, w * 2 + 1, y % 3 === 0 ? C.granite2 : C.granite);
            }
            v.box(-5, 12, -5, 11, 1, 11, C.granite);
            // фигура: складки одежды
            var body = [[0, 13], [0, 14], [1, 15], [1, 16], [1, 17], [1, 18], [1, 19], [1, 20], [2, 21], [2, 22], [2, 23]];
            body.forEach(function (b2) {
                var yy = b2[0] + 13, w2 = 4 - Math.floor(b2[0] / 3);
                if (w2 < 1) w2 = 1;
                v.box(-w2, 13 + b2[0], -w2, w2 * 2 + 1, 1, w2 * 2 + 1, C.copper);
            });
            // голова и корона с семью лучами
            v.box(-1, 24, -1, 3, 2, 3, C.copper2);
            for (var k = 0; k < 7; k++) {
                var ka = (k / 6 - 0.5) * Math.PI * 0.9;
                var rx = Math.round(Math.sin(ka) * 2);
                var ry = 26 + Math.round(Math.cos(ka) * 2);
                v.add(rx, ry, 0, C.gold);
                v.add(rx, ry + 1, 0, C.gold);
            }
            // правая рука с факелом
            v.box(2, 20, 0, 1, 5, 1, C.copper);
            v.box(2, 25, 0, 1, 2, 1, C.gold);
            v.box(2, 27, 0, 1, 2, 1, 0xffb84a);      // пламя
            // левая рука со скрижалью
            v.box(-3, 18, 0, 2, 1, 3, C.copper2);
            v.box(-3, 17, 0, 1, 1, 2, C.granite);
            return v;
        },
        // стена Кремля: зубцы «ласточкин хвост», бойницы
        kremlin_wall: function (v) {
            var L = 40;
            v.box(0, 0, 0, L, 8, 3, C.kreml);
            v.box(0, 0, 0, L, 1, 4, C.kreml2);            // цоколь
            for (var i = 0; i < L; i += 4) {
                v.box(i, 8, 0, 2, 2, 3, C.kreml);          // зубец
                v.box(i + 1, 8, 0, 1, 1, 3, C.kreml2);
            }
            for (var w = 2; w < L - 2; w += 6) {
                v.box(w, 4, 3, 1, 2, 1, C.dark);           // бойница
            }
            v.box(0, 3, 3, L, 1, 1, C.kreml2);             // пояс
            return v;
        },
        // Спасская башня: четверик, часы, шатёр, звезда
        spasskaya: function (v) {
            v.box(-6, 0, -6, 13, 16, 13, C.kreml);          // основание
            v.box(-6, 0, -6, 13, 1, 13, C.kreml2);
            for (var i = 0; i < 13; i += 3) {
                v.box(-6 + i, 16, -6, 2, 2, 13, C.kreml);   // зубцы
                v.box(-6, 16, -6 + i, 13, 2, 2, C.kreml);
            }
            // часы
            v.box(-3, 11, -6, 7, 4, 1, C.white_stone);
            v.box(-1, 12, -7, 3, 2, 1, C.dark);
            v.box(-2, 13, -7, 1, 1, 1, C.gold);
            // шатёр
            for (var t = 0; t < 6; t++) {
                var w = 12 - t * 2;
                if (w < 2) break;
                v.box(-w / 2, 18 + t, -w / 2, w, 1, w, t % 2 ? C.kreml2 : C.kreml);
            }
            // звезда
            v.box(-1, 24, -1, 3, 1, 3, C.gold);
            v.box(0, 25, 0, 1, 2, 1, 0xd43a2c);
            return v;
        },
        // собор: белый объём и золотой «лук»
        cathedral: function (v) {
            v.box(0, 0, 0, 9, 7, 9, C.white_stone);
            v.box(1, 7, 1, 7, 1, 7, C.white_stone);
            for (var i = 0; i < 4; i++) {
                var w = 6 - i;
                v.box(-w / 2 + 4, 8 + i, -w / 2 + 4, w, 1, w, C.gold2);
            }
            v.box(3, 12, 3, 3, 2, 3, C.gold);
            v.box(4, 14, 4, 1, 2, 1, C.gold);
            // крест
            v.box(4, 16, 4, 1, 1, 1, C.gold);
            v.box(3, 16, 4, 3, 1, 1, C.gold);
            return v;
        },
        // колокольня Ивана Великого
        ivan_tower: function (v) {
            v.box(0, 0, 0, 6, 18, 6, C.white_stone);
            v.box(1, 18, 1, 4, 2, 4, C.white_stone);
            for (var i = 0; i < 4; i++) {
                var w = 5 - i;
                v.box(-w / 2 + 2, 20 + i, -w / 2 + 2, w, 1, w, C.gold2);
            }
            v.box(2, 24, 2, 2, 2, 2, C.gold);
            v.box(3, 26, 3, 1, 2, 1, C.gold);
            return v;
        },
        // Большой театр: портик с колоннами, фронтон, квадрига
        bolshoi: function (v) {
            v.box(-9, 0, -7, 19, 1, 15, C.theatre2);        // цоколь
            v.box(-8, 1, -6, 17, 6, 13, C.theatre);         // основной объём
            // колонны портика (8 штук)
            for (var i = 0; i < 8; i++) {
                var cxp = -7 + i * 2;
                v.box(cxp, 1, 7, 1, 6, 1, C.theatre);
                v.box(cxp, 7, 7, 1, 0.5 > 0 ? 1 : 1, 1, C.theatre2);
            }
            v.box(-8, 7, 6, 17, 1, 3, C.theatre2);          // антаблемент
            // фронтон треугольником
            for (var f = 0; f < 3; f++) {
                v.box(-7 + f * 2, 8 + f, 6, 15 - f * 4, 1, 3, C.theatre);
            }
            // квадрига (кони и колесница) на фронтоне
            v.box(-2, 11, 6, 5, 1, 2, C.bronze);
            v.box(-2, 12, 6, 1, 2, 1, C.bronze);
            v.box(2, 12, 6, 1, 2, 1, C.bronze);
            v.box(0, 12, 6, 1, 2, 2, C.bronze);
            // купол
            for (var d = 0; d < 3; d++) {
                v.box(-4 + d, 7, -4 + d, 9 - d * 2, 1, 9 - d * 2, C.theatre2);
            }
            // двери и окна
            [-6, -1, 4].forEach(function (dx) {
                v.box(dx, 1, 7, 2, 3, 1, C.curtain);
            });
            v.box(-8, 4, 7, 17, 1, 1, C.gold);
            return v;
        },
        // Пекинская опера: красные колонны, изогнутая крыша, фонари
        peking_opera: function (v) {
            v.box(-8, 0, -6, 17, 1, 13, C.granite2);
            v.box(-7, 1, -5, 15, 5, 11, C.redLacquer);       // стены
            // колонны
            for (var i = 0; i < 6; i++) {
                v.box(-6 + i * 3, 1, 6, 1, 6, 1, C.redLacquer2);
            }
            // изогнутая крыша: три уступа с выносом
            [[6, 13], [7, 11], [8, 9]].forEach(function (r) {
                v.box(-r[1] / 2 - 1, r[0], -r[1] / 2, r[1] + 2, 1, r[1], C.tileGrey);
                v.box(-r[1] / 2, r[0] + 1, -r[1] / 2 + 1, r[1], 1, r[1] - 2, C.tileGrey2);
            });
            // загнутые углы крыши
            [-1, 1].forEach(function (sx) {
                [-1, 1].forEach(function (sz) {
                    v.box(sx * 7, 8, sz * 5, 1, 1, 1, C.gold);
                    v.box(sx * 7, 9, sz * 5, 1, 1, 1, C.gold2);
                });
            });
            // красные фонари под крышей
            [-5, 0, 5].forEach(function (dx) {
                v.box(dx, 5, 6, 1, 1, 1, C.curtain);
                v.box(dx, 4, 6, 1, 1, 1, C.gold);
            });
            // сцена-вход
            v.box(-3, 1, 6, 7, 3, 1, C.curtain);
            v.box(-2, 2, 6, 5, 2, 1, C.gold2);
            return v;
        },
        // Опера Гарнье: зелёный купол, колоннада, золото
        garnier: function (v) {
            v.box(-8, 0, -7, 17, 1, 14, C.theatre2);
            v.box(-7, 1, -6, 15, 5, 12, C.theatre);
            // колоннада
            for (var i = 0; i < 7; i++) {
                v.box(-6 + i * 2, 1, 6, 1, 5, 1, C.theatre2);
            }
            v.box(-7, 6, 5, 15, 1, 3, C.theatre);
            v.box(-7, 7, 5, 15, 1, 3, C.gold);
            // купол
            for (var d = 0; d < 4; d++) {
                v.box(-5 + d, 7, -3 + d, 11 - d * 2, 1, 7 - d, C.jade);
            }
            v.box(-3, 11, -1, 7, 1, 3, C.jade);
            v.box(-2, 12, 0, 5, 1, 2, C.gold2);
            // скульптуры на крыше
            [-6, 6].forEach(function (dx) {
                v.box(dx, 8, 5, 1, 2, 1, C.bronze);
                v.box(dx, 10, 5, 1, 1, 1, C.gold);
            });
            // вход
            v.box(-2, 1, 7, 5, 3, 1, C.gold2);
            return v;
        },
        lab: function (v) {
            v.box(0, 0, 0, 14, 2, 14, C.concrete);
            // корпус-купол
            for (var r = 0; r < 6; r++) {
                var s = 12 - r * 2;
                if (s <= 0) break;
                v.box(1 + r, 1 + r, 1 + r, s, 1, s, r % 2 ? C.white : C.chrome);
            }
            v.box(6, 8, 6, 2, 3, 2, C.steel2);
            // тарелка
            for (var a = 0; a < 12; a++) {
                var ang = a / 12 * Math.PI * 2;
                v.box(7 + Math.round(Math.cos(ang) * 3), 11 + Math.round(Math.sin(ang) * 2), 7, 1, 1, 1, C.white);
            }
            // приборы
            v.box(11, 2, 11, 2, 2, 2, C.steel);
            v.box(11, 4, 11, 2, 1, 2, C.glassLit);
            v.box(1, 2, 11, 2, 1, 2, C.steel);
            return v;
        }
    };

    // ---------- корабли ----------
    var SHIPS = {
        jet_scout: { name: 'Разведчик «Искра»', len: 11, w: 4, h: 3, hull: C.chrome, accent: C.yellow, cockpit: 1, engines: 2 },
        jet_hauler: { name: 'Тягач «Мул»', len: 15, w: 6, h: 4, hull: C.steel, accent: C.rust, cockpit: 1, engines: 3 },
        ion_courier: { name: 'Курьер «Стриж»', len: 14, w: 5, h: 3, hull: C.white, accent: C.navy, cockpit: 1, engines: 2 },
        ion_corsair: { name: 'Корсар «Клык»', len: 17, w: 6, h: 4, hull: C.dark, accent: C.red, cockpit: 1, engines: 3 },
        ion_prospector: { name: 'Геолог «Бур»', len: 16, w: 7, h: 5, hull: C.yellow, accent: C.dark, cockpit: 1, engines: 2 },
        plasma_interceptor: { name: 'Перехватчик «Сабля»', len: 13, w: 8, h: 3, hull: C.steel2, accent: C.red, cockpit: 1, engines: 2 },
        plasma_lancer: { name: 'Ланцер «Пика»', len: 19, w: 7, h: 4, hull: C.steel, accent: C.engine, cockpit: 1, engines: 3 },
        grav_frigate: { name: 'Фрегат «Щит»', len: 23, w: 9, h: 6, hull: C.space, accent: C.chrome, cockpit: 1, engines: 4 },
        grav_colossus: { name: 'Колосс «Титан»', len: 30, w: 12, h: 8, hull: C.panel, accent: C.gold, cockpit: 1, engines: 6 }
    };

    function shipVox(spec) {
        var v = new Vox();
        var L = spec.len, W = spec.w, H = spec.h;
        var cx = Math.floor(W / 2), cz = Math.floor(H / 2);
        // нос — сужение по длине
        for (var x = 0; x < L; x++) {
            var t = x / (L - 1);
            // нос 0..0,3 — разгон ширины; корма 0,78..1 — сужение
            var prof;
            if (t < 0.3) prof = Math.sin((t / 0.3) * Math.PI / 2);
            else if (t > 0.78) prof = 1 - (t - 0.78) / 0.22 * 0.55;
            else prof = 1;
            var halfW = Math.max(1, Math.round((W / 2) * (0.25 + 0.75 * prof)));
            var halfH = Math.max(1, Math.round((H / 2) * (0.45 + 0.55 * prof)));
            for (var y = -halfH; y <= halfH; y++) {
                for (var z = -halfW; z <= halfW; z++) {
                    var edgeZ = Math.abs(z) === halfW;
                    var color;
                    if (y === halfH && !edgeZ) color = spec.accent;          // палуба
                    else if (edgeZ || Math.abs(y) === halfH) color = spec.hull; // борт
                    else color = spec.hull2 || spec.hull;
                    v.add(x, cz + y, cx + z, color);
                }
            }
        }
        // гребень и киль
        for (var sx = Math.round(L * 0.25); sx < Math.round(L * 0.8); sx++) {
            v.add(sx, cz + Math.floor(H / 2) + 1, cx, spec.accent);
        }
        // кабина
        var cabX = Math.round(L * 0.62);
        for (var i = 0; i < 3; i++) {
            v.box(cabX + i, cz + Math.floor(H / 2), cx - 1, 1, 1, 3, C.glass);
        }
        v.box(cabX - 1, cz + Math.floor(H / 2) + 1, cx - 1, 4, 1, 3, spec.accent);
        // двигатели
        for (var e = 0; e < spec.engines; e++) {
            var ez = Math.round((e - (spec.engines - 1) / 2) * 1.6);
            v.box(L - 2, cz - 1, cx + ez, 2, 2, 2, C.steel2);
            v.box(L, cz - 1, cx + ez, 1, 2, 2, C.engine);
            v.box(L + 1, cz, cx + ez, 1, 1, 1, C.engineHot);
        }
        // крылья
        var wingX = Math.round(L * 0.45);
        for (var w = 1; w <= Math.round(W / 2) + 2; w++) {
            v.box(wingX, cz, cx + w, 3, 1, 1, spec.accent);
            v.box(wingX, cz, cx - w, 3, 1, 1, spec.accent);
        }
        // антенна и мелкие детали
        v.box(Math.round(L * 0.3), cz + Math.floor(H / 2) + 1, cx, 1, 2, 1, C.steel2);
        v.box(1, cz, cx, 2, 1, 1, C.chrome);
        return v;
    }

    // ---------- реальные размеры (по расчёту, см. docs/BUILDINGS-SCALE.md) ----------
    var SCALE = {
        house:     { w: 130, d: 130, h: 60,  rooms: 16900, note: '12 этажей, 3 200 квартир' , modelW: 8 },
        farm:      { w: 400, d: 300, h: 22,  rooms: 60,    note: 'теплицы 12 га, силос 8 шт' , modelW: 10 },
        factory:   { w: 200, d: 200, h: 18,  rooms: 900,   note: '3 смены по 1 000 рабочих' , modelW: 11 },
        mine:      { w: 150, d: 120, h: 90,  rooms: 120,   note: 'копёр 90 м, ствол 400 м' , modelW: 8 },
        warehouse: { w: 300, d: 180, h: 24,  rooms: 90,    note: 'ангар 5,4 га' , modelW: 11 },
        power:     { w: 400, d: 400, h: 120, rooms: 240,   note: '1 ГВт, 4 градирни 120 м' , modelW: 10 },
        defense:   { w: 60,  d: 60,  h: 85,  rooms: 40,    note: 'турель, радар, антенна' , modelW: 5 },
        market:    { w: 200, d: 150, h: 14,  rooms: 300,   note: '3 павильона, 120 лавок' , modelW: 9 },
        shipyard:  { w: 600, d: 400, h: 80,  rooms: 800,   note: 'стапель под колосс 300 м' , modelW: 12 },
        lab:       { w: 180, d: 180, h: 60,  rooms: 260,   note: 'купол 60 м, реактор, тарелка' , modelW: 7 },
        spaceport: { w: 1500, d: 1300, h: 120, rooms: 400,  note: 'перрон 1,2 км², 2 полосы, 4 стоянки', modelW: 38 },
        docks:     { w: 2000, d: 3000, h: 80,  rooms: 1400, note: '4 сухих дока, кран 500 т', modelW: 42 }
    };

    // флот: реальные длины
    var SHIP_SIZE = {
        jet_scout: 30, jet_hauler: 60, ion_courier: 45, ion_corsair: 70,
        ion_prospector: 55, plasma_interceptor: 40, plasma_lancer: 80,
        grav_frigate: 120, grav_colossus: 300
    };

    // ---------- каталоги ----------
    var BUILDING_LIST = [
        { id: 'house', name: 'Жилой модуль', variants: [{ v: 1, label: 'модуль' }, { v: 2, label: 'трёхэтажный' }, { v: 3, label: 'квартал' }] },
        { id: 'farm', name: 'Ферма', variants: [{ v: 1, label: 'с теплицей' }] },
        { id: 'factory', name: 'Завод', variants: [{ v: 1, label: 'цех' }, { v: 2, label: 'крупный' }] },
        { id: 'mine', name: 'Шахта', variants: [{ v: 1, label: 'копёр' }] },
        { id: 'warehouse', name: 'Склад', variants: [{ v: 1, label: 'ангар' }] },
        { id: 'power', name: 'Термоядерная станция', variants: [{ v: 1, label: 'реактор' }, { v: 2, label: 'с панелями' }, { v: 3, label: 'лунная' }] },
        { id: 'defense', name: 'Оборонительная башня', variants: [{ v: 1, label: 'турель' }] },
        { id: 'market', name: 'Рынок', variants: [{ v: 1, label: 'павильоны' }] },
        { id: 'shipyard', name: 'Верфь', variants: [{ v: 1, label: 'стапель' }] },
        { id: 'lab', name: 'Лаборатория', variants: [{ v: 1, label: 'купол' }] },
        { id: 'spaceport', name: 'Космопорт', variants: [{ v: 1, label: 'перрон и полосы' }] },
        { id: 'docks', name: 'Доки', variants: [{ v: 1, label: '4 сухих дока' }] }
    ];

    function build(kind, variant, THREE, unit) {
        var fn = BUILDINGS[kind];
        if (!fn) return null;
        var v = new Vox(unit);
        fn(v, variant || 1);
        var g = v.toGroup(THREE);
        g.userData.kind = kind;
        // ставим модель так, чтобы низ был на нуле
        g.position.y = 0;
        return g;
    }

    function buildShip(id, THREE) {
        var spec = SHIPS[id];
        if (!spec) return null;
        var g = shipVox(spec).toGroup(THREE);
        // центрируем и разворачиваем носом вправо
        g.position.set(-spec.len * U / 2, 0, -spec.w * U / 2);
        g.userData.kind = id;
        return g;
    }

    window.Models3D = {
        scale: SCALE,
        shipSize: SHIP_SIZE,
        build: build,
        buildShip: buildShip,
        buildings: BUILDING_LIST,
        ships: SHIPS,
        unit: U
    };
})();
