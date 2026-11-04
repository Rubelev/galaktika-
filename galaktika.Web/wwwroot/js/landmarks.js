// 100 достопримечательностей планеты: параметрические воксельные модели.
// 15 архетипов × параметры = узнаваемые силуэты. Сцена: ?landmarks=1
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    var U = 1.0;                 // кубик 1 м на витрине
    var scene = null, camera = null, renderer = null, wrap = null, raf = 0;
    var THREE = null, models = [], focus = null;
    var spin = true;

    // ---------- воксельный холст ----------
    function Vox() { this.m = {}; this.u = U; }
    Vox.prototype.add = function (x, y, z, c) { this.m[x + '|' + y + '|' + z] = c; return this; };
    Vox.prototype.box = function (x, y, z, w, h, d, c) {
        for (var i = 0; i < w; i++) for (var j = 0; j < h; j++) for (var k = 0; k < d; k++) {
            this.m[(x + i) + '|' + (y + j) + '|' + (z + k)] = c;
        }
        return this;
    };
    Vox.prototype.group = function (THREE) {
        var g = new THREE.Group();
        var byColor = {};
        for (var key in this.m) {
            var c = this.m[key];
            (byColor[c] = byColor[c] || []).push(key);
        }
        var geo = new THREE.BoxGeometry(this.u * 0.97, this.u * 0.97, this.u * 0.97);
        Object.keys(byColor).forEach(function (c) {
            var list = byColor[c];
            var mat = new THREE.MeshLambertMaterial({ color: parseInt(c, 10) });
            var mesh = new THREE.InstancedMesh(geo, mat, list.length);
            var m4 = new THREE.Matrix4();
            list.forEach(function (k, i) {
                var p = k.split('|');
                m4.makeTranslation(parseInt(p[0], 10) * U, parseInt(p[1], 10) * U, parseInt(p[2], 10) * U);
                mesh.setMatrixAt(i, m4);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            g.add(mesh);
        });
        return g;
    };

    // ---------- архетипы ----------
    var A = {
        // пирамида: ступенчатая или гладкая
        pyramid: function (v, p) {
            var h = p.h || 24, base = p.base || h * 1.6, step = p.step || 1;
            for (var y = 0; y < h; y++) {
                var k = Math.floor(y / step);
                var w = Math.max(1, base - k * 2);
                var off = Math.floor((base - w) / 2);
                v.box(off, y, off, w, 1, w, y % 2 ? (p.c2 || 0xd9c08a) : (p.c1 || 0xe8d9b0));
            }
            if (p.cap) v.box(Math.floor(base / 2), h, Math.floor(base / 2), 1, 2, 1, p.cap);
            return v;
        },
        // обелиск
        obelisk: function (v, p) {
            var h = p.h || 30, w = p.w || 3;
            v.box(0, 0, 0, w + 2, 2, w + 2, p.c1 || 0xb08a4a);
            for (var y = 2; y < h; y++) {
                var k = y > h * 0.82 ? 1 : 0;
                v.box(k, y, k, w - k * 2, 1, w - k * 2, y % 6 === 0 ? (p.c2 || 0xc9a86a) : (p.c1 || 0xb08a4a));
            }
            if (p.tip) v.box(1, h, 1, 1, 2, 1, p.tip);
            return v;
        },
        // купол + минареты (мечети, соборы, дворцы)
        dome: function (v, p) {
            var w = p.w || 18, h = p.h || 12, r = p.dome || 6;
            v.box(0, 0, 0, w, h, w, p.c1 || 0xe6dcc8);
            v.box(0, h, 0, w, 1, w, p.c2 || 0xcfc3ab);
            // барабан и купол
            var cx = Math.floor(w / 2), cz = Math.floor(w / 2);
            v.box(cx - Math.floor(r / 2), h + 1, cz - Math.floor(r / 2), r, 2, r, p.c2 || 0xcfc3ab);
            for (var i = 0; i < Math.ceil(r / 2); i++) {
                var d = r - i * 2;
                if (d < 1) break;
                v.box(cx - Math.floor(d / 2), h + 3 + i, cz - Math.floor(d / 2), d, 1, d, p.domeC || 0xd8a41c);
            }
            v.box(cx, h + 3 + Math.ceil(r / 2), cz, 1, 2, 1, p.cross || 0xd8a41c);
            // минареты
            var n = p.minarets || 0, mh = p.minaretH || h + 10;
            for (var m = 0; m < n; m++) {
                var ang = m / n * Math.PI * 2;
                var mx = cx + Math.round(Math.cos(ang) * (w / 2 + 2));
                var mz = cz + Math.round(Math.sin(ang) * (w / 2 + 2));
                for (var y2 = 1; y2 < mh; y2++) {
                    v.box(mx, y2, mz, 2, 1, 2, y2 % 4 ? (p.c1 || 0xe6dcc8) : (p.c2 || 0xcfc3ab));
                }
                v.box(mx, mh, mz, 2, 1, 2, p.domeC || 0xd8a41c);
            }
            return v;
        },
        // пагода / многоярусная башня
        pagoda: function (v, p) {
            var tiers = p.tiers || 5, w = p.w || 8, th = p.th || 4;
            var y = 0;
            for (var t = 0; t < tiers; t++) {
                var tw = Math.max(3, w - t);
                v.box(-Math.floor(tw / 2), y, -Math.floor(tw / 2), tw, th, tw, t % 2 ? (p.c2 || 0x8c2a20) : (p.c1 || 0xb03a2e));
                v.box(-Math.floor(tw / 2) - 1, y + th, -Math.floor(tw / 2) - 1, tw + 2, 1, tw + 2, p.roof || 0x6b7075);
                y += th + 1;
            }
            v.box(0, y, 0, 1, 3, 1, p.tip || 0xd8a41c);
            return v;
        },
        // небоскрёб
        tower: function (v, p) {
            var w = p.w || 8, h = p.h || 40, taper = p.taper || 0;
            for (var y = 0; y < h; y++) {
                var k = Math.floor(y / Math.max(1, h) * (taper * w));
                var ww = Math.max(2, w - k);
                var off = -Math.floor(ww / 2);
                var c = (y % 4 < 2) ? (p.c1 || 0x8fa4b4) : (p.c2 || 0x5f7080);
                if (p.windows && y % 3 === 1) c = p.windows;
                v.box(off, y, off, ww, 1, ww, c);
            }
            if (p.spire) {
                var top = h;
                for (var s = 0; s < p.spire; s++) {
                    v.box(0, top + s, 0, Math.max(1, 2 - Math.floor(s / 3)), 1, Math.max(1, 2 - Math.floor(s / 3)), p.spireC || 0xc0c8d0);
                }
            }
            return v;
        },
        // решётчатая башня (Эйфель, Останкино, Сидней)
        lattice: function (v, p) {
            var h = p.h || 48, legs = p.legs || 4, spread = p.spread || 10;
            for (var y = 0; y < h; y++) {
                var t = y / h;
                var s = Math.max(1, Math.round(spread * (1 - t * 0.8)));
                var pos = [[-s, -s], [s, -s], [-s, s], [s, s]].slice(0, legs);
                pos.forEach(function (c) {
                    v.add(c[0], y, c[1], y % 8 === 0 ? (p.c2 || 0x6f5439) : (p.c1 || 0x8a6a4a));
                });
                if (y % 4 === 0) {
                    for (var k = -s; k <= s; k++) {
                        v.add(k, y, -s, p.c1 || 0x8a6a4a);
                        v.add(k, y, s, p.c1 || 0x8a6a4a);
                        v.add(-s, y, k, p.c1 || 0x8a6a4a);
                        v.add(s, y, k, p.c1 || 0x8a6a4a);
                    }
                }
                if (p.deck && (y === Math.floor(h * 0.3) || y === Math.floor(h * 0.65))) {
                    for (var d2 = -s; d2 <= s; d2++) {
                        v.add(d2, y + 1, 0, p.deck);
                        v.add(0, y + 1, d2, p.deck);
                    }
                }
            }
            if (p.spire) for (var sp = 0; sp < p.spire; sp++) v.add(0, h + sp, 0, p.spireC || 0xd8a41c);
            return v;
        },
        // арка (Триумфальная, ворота)
        arch: function (v, p) {
            var w = p.w || 16, h = p.h || 20, t = p.t || 3;
            v.box(-Math.floor(w / 2), 0, 0, t, h, t, p.c1 || 0xe6dcc8);
            v.box(Math.floor(w / 2) - t + 1, 0, 0, t, h, t, p.c1 || 0xe6dcc8);
            v.box(-Math.floor(w / 2), h - t, 0, w, t, t, p.c2 || 0xcfc3ab);
            v.box(-Math.floor(w / 2) - 1, h, 0, w + 2, 1, t + 1, p.c1 || 0xe6dcc8);
            if (p.quadriga) {
                v.box(-1, h + 1, 0, 3, 2, 1, 0x6b6a4a);
            }
            return v;
        },
        // амфитеатр / колизей
        colosseum: function (v, p) {
            var r = p.r || 12, tiers = p.tiers || 3;
            for (var t = 0; t < tiers; t++) {
                var rr = r - t;
                for (var a = 0; a < 64; a++) {
                    var ang = a / 64 * Math.PI * 2;
                    var x = Math.round(Math.cos(ang) * rr), z = Math.round(Math.sin(ang) * rr);
                    v.add(x, t * 3, z, a % 4 === 0 ? (p.c2 || 0xb8a888) : (p.c1 || 0xd8cdb8));
                    v.add(x, t * 3 + 1, z, p.c1 || 0xd8cdb8);
                    v.add(x, t * 3 + 2, z, p.c2 || 0xb8a888);
                }
            }
            return v;
        },
        // статуя на пьедестале
        statue: function (v, p) {
            var h = p.h || 20, w = p.w || 6;
            v.box(-Math.floor(w / 2), 0, -Math.floor(w / 2), w, 4, w, p.base || 0x8d9196);
            v.box(-1, 4, -1, 3, Math.floor(h * 0.55), 3, p.c1 || 0x5f9a86);
            v.box(-1, 4 + Math.floor(h * 0.55), -1, 3, 2, 3, p.c1 || 0x5f9a86);
            // рука с факелом/мечом
            v.box(2, 4 + Math.floor(h * 0.5), 0, 1, Math.floor(h * 0.3), 1, p.c1 || 0x5f9a86);
            v.box(2, 4 + Math.floor(h * 0.8), 0, 1, 2, 1, p.flame || 0xffb84a);
            // корона
            for (var k = 0; k < 5; k++) v.add(-2 + k, 4 + Math.floor(h * 0.6) + 2, 0, p.crown || 0xd8a41c);
            return v;
        },
        // мост
        bridge: function (v, p) {
            var span = p.span || 30, h = p.h || 14, deck = p.deck || 4;
            for (var x = 0; x < span; x++) {
                v.box(x, deck, 0, 1, 1, p.w || 6, p.c1 || 0x8d979e);
            }
            for (var t = 0; t < 2; t++) {
                var tx = t ? span - 3 : 2;
                for (var y = 0; y < h; y++) {
                    v.box(tx, y, 0, 2, 1, 2, p.c2 || 0xb04a3c);
                }
                // ванты
                for (var c = 0; c < 8; c++) {
                    var cx = tx + (c - 4) * 3;
                    if (cx < 0 || cx >= span) continue;
                    var steps = Math.abs(c - 4);
                    for (var s = 0; s < h - deck - steps; s++) {
                        v.add(cx, deck + s, 0, p.cable || 0xd8dee2);
                    }
                }
            }
            return v;
        },
        // античный храм
        temple: function (v, p) {
            var w = p.w || 14, h = p.h || 10, cols = p.cols || 6;
            v.box(-1, 0, -1, w + 2, 1, w + 2, p.c2 || 0xcfc3ab);
            for (var c = 0; c < cols; c++) {
                var x = -Math.floor(w / 2) + Math.round(c * (w - 1) / (cols - 1));
                for (var y = 1; y < h; y++) v.box(x, y, Math.floor(w / 2) - 1, 1, 1, 1, p.c1 || 0xe6dcc8);
                for (var y2 = 1; y2 < h; y2++) v.box(x, y2, -Math.floor(w / 2), 1, 1, 1, p.c1 || 0xe6dcc8);
            }
            v.box(-Math.floor(w / 2), h, Math.floor(w / 2) - 1, w, 1, 1, p.c1 || 0xe6dcc8);
            v.box(-Math.floor(w / 2), h, -Math.floor(w / 2), w, 1, 1, p.c1 || 0xe6dcc8);
            v.box(-Math.floor(w / 2), h + 1, -Math.floor(w / 2), w, 1, w, p.c1 || 0xe6dcc8);
            // фронтон
            for (var f = 0; f < 3; f++) v.box(-Math.floor(w / 2) + f, h + 2 + f, -Math.floor(w / 2), w - f * 2, 1, w, p.c1 || 0xe6dcc8);
            return v;
        },
        // крепость
        fort: function (v, p) {
            var w = p.w || 20, h = p.h || 8, t = 2;
            v.box(0, 0, 0, w, h, t, p.c1 || 0xa8352c);
            v.box(0, 0, w - t, t, h, w, p.c1 || 0xa8352c);
            v.box(0, 0, w - t, w, h, t, p.c1 || 0xa8352c);
            for (var i = 0; i < w; i += 3) {
                v.box(i, h, 0, 2, 2, t, p.c1 || 0xa8352c);
                v.box(i, h, w - t, 2, 2, t, p.c1 || 0xa8352c);
                v.box(0, h, i, t, 2, 2, p.c1 || 0xa8352c);
                v.box(w - t, h, i, t, 2, 2, p.c1 || 0xa8352c);
            }
            // башни по углам
            [[0, 0], [w - 4, 0], [0, w - 4], [w - 4, w - 4]].forEach(function (c) {
                v.box(c[0], 0, c[1], 4, h + 6, 4, p.c2 || 0x86261f);
                v.box(c[0] + 1, h + 6, c[1] + 1, 2, 3, 2, p.roof || 0x3f7a63);
            });
            return v;
        },
        // скала / монолит
        monolith: function (v, p) {
            var h = p.h || 20, w = p.w || 6;
            for (var y = 0; y < h; y++) {
                var ww = Math.max(2, w - Math.floor(y / (h / w)));
                var off = -Math.floor(ww / 2);
                v.box(off, y, off, ww, 1, ww, y > h * 0.7 ? (p.c2 || 0x9a8a76) : (p.c1 || 0xb8a892));
            }
            return v;
        },
        // ворота / пагода-вход
        gate: function (v, p) {
            var w = p.w || 14, h = p.h || 12, t = p.t || 2;
            v.box(-Math.floor(w / 2), 0, 0, t, h, t, p.c1 || 0xb03a2e);
            v.box(Math.floor(w / 2) - t + 1, 0, 0, t, h, t, p.c1 || 0xb03a2e);
            for (var r = 0; r < 3; r++) {
                v.box(-Math.floor(w / 2) - 2 + r, h + r, -1, w + 4 - r * 2, 1, t + 2, r % 2 ? (p.c2 || 0x6b7075) : (p.roof || 0x565b60));
            }
            return v;
        }
    };

    // ---------- 100 достопримечательностей ----------
    // [id, название, город · страна, архетип, параметры]
    var LIST = [
        ['giza', 'Пирамиды Гизы', 'Каир · Египет', 'pyramid', { h: 26, base: 40, c1: 0xe8d9b0, c2: 0xd9c08a }],
        ['sphinx', 'Большой Сфинкс', 'Гиза · Египет', 'statue', { h: 12, w: 10, c1: 0xd9c08a, base: 0xc9b08a }],
        ['karnak', 'Карнакский храм', 'Луксор · Египет', 'temple', { w: 18, h: 12, cols: 8, c1: 0xd9c08a, c2: 0xc9b08a }],
        ['abu-simbel', 'Абу-Симбел', 'Асуан · Египет', 'temple', { w: 16, h: 14, cols: 4, c1: 0xe0c8a0, c2: 0xd0b890 }],
        ['kremlin', 'Московский Кремль', 'Москва · Россия', 'fort', { w: 24, h: 10, c1: 0xa8352c, c2: 0x86261f, roof: 0x3f7a63 }],
        ['saint-basil', 'Собор Василия Блаженного', 'Москва · Россия', 'dome', { w: 18, h: 12, dome: 7, domeC: 0xd8a41c, c1: 0xb03a2e, c2: 0xe6dcc8, minarets: 4, minaretH: 20 }],
        ['bolshoi', 'Большой театр', 'Москва · Россия', 'temple', { w: 17, h: 9, cols: 8, c1: 0xe6dcc8, c2: 0xcfc3ab }],
        ['ostankino', 'Останкинская башня', 'Москва · Россия', 'lattice', { h: 54, legs: 4, spread: 8, c1: 0xb8bec2, c2: 0x9aa0a4, deck: 0x8fd0ff }],
        ['peterhof', 'Петергоф', 'Санкт-Петербург · Россия', 'dome', { w: 16, h: 8, dome: 5, domeC: 0xd8a41c, c1: 0xe6dcc8, c2: 0xcfc3ab, minarets: 0 }],
        ['hermitage', 'Эрмитаж', 'Санкт-Петербург · Россия', 'dome', { w: 20, h: 10, dome: 4, domeC: 0x3f7a63, c1: 0xd8e0e6, c2: 0xb8c4cc, minarets: 0 }],
        ['eiffel', 'Эйфелева башня', 'Париж · Франция', 'lattice', { h: 52, legs: 4, spread: 10, c1: 0x8a6a4a, c2: 0x6f5439, deck: 0x6f7a82 }],
        ['notre-dame', 'Нотр-Дам де Пари', 'Париж · Франция', 'dome', { w: 16, h: 12, dome: 5, domeC: 0x8fa4b4, c1: 0xe6dcc8, c2: 0xcfc3ab, minarets: 2, minaretH: 22 }],
        ['louvre', 'Лувр', 'Париж · Франция', 'pyramid', { h: 10, base: 20, c1: 0x9fd0e8, c2: 0x7fc0e0, cap: 0xe8f4ff }],
        ['arc-triomphe', 'Триумфальная арка', 'Париж · Франция', 'arch', { w: 18, h: 20, t: 4, c1: 0xe6dcc8, c2: 0xcfc3ab, quadriga: true }],
        ['sacré-coeur', 'Сакре-Кёр', 'Париж · Франция', 'dome', { w: 14, h: 12, dome: 6, domeC: 0xe8eef2, c1: 0xf0ece0, c2: 0xdcd4c0, minarets: 1, minaretH: 24 }],
        ['colosseum', 'Колизей', 'Рим · Италия', 'colosseum', { r: 14, tiers: 3, c1: 0xd8cdb8, c2: 0xb8a888 }],
        ['pantheon', 'Пантеон', 'Рим · Италия', 'dome', { w: 16, h: 10, dome: 8, domeC: 0x9aa0a4, c1: 0xd8cdb8, c2: 0xc4b8a0, minarets: 0 }],
        ['st-peters', 'Собор Святого Петра', 'Ватикан', 'dome', { w: 20, h: 14, dome: 8, domeC: 0xd8dee2, c1: 0xe6dcc8, c2: 0xcfc3ab, minarets: 0 }],
        ['pisa', 'Пизанская башня', 'Пиза · Италия', 'pagoda', { tiers: 8, w: 8, th: 3, c1: 0xe6dcc8, c2: 0xd8cdb8, roof: 0xcfc3ab }],
        ['duomo-milano', 'Миланский собор', 'Милан · Италия', 'dome', { w: 22, h: 12, dome: 6, domeC: 0xe8e4d8, c1: 0xf0ece0, c2: 0xdcd4c0, minarets: 6, minaretH: 26 }],
        ['venice', 'Венецианский канал', 'Венеция · Италия', 'bridge', { span: 26, h: 10, deck: 3, c1: 0xd8cdb8, c2: 0xb04a3c }],
        ['alhambra', 'Альгамбра', 'Гранада · Испания', 'dome', { w: 20, h: 10, dome: 6, domeC: 0xb04a3c, c1: 0xd8b48a, c2: 0xc09c74, minarets: 4, minaretH: 18 }],
        ['sagrada', 'Саграда Фамилия', 'Барселона · Испания', 'dome', { w: 16, h: 16, dome: 5, domeC: 0xc4b8a0, c1: 0xd8c8a8, c2: 0xbfae90, minarets: 6, minaretH: 34 }],
        ['big-ben', 'Биг-Бен', 'Лондон · Великобритания', 'tower', { w: 6, h: 42, c1: 0xc9a86a, c2: 0xb08a4a, spire: 8, spireC: 0x3f7a63, windows: 0xf0e0b0 }],
        ['tower-bridge', 'Тауэрский мост', 'Лондон · Великобритания', 'bridge', { span: 30, h: 18, deck: 4, c1: 0x8d979e, c2: 0x8fa4b4, cable: 0x5f7080 }],
        ['stonehenge', 'Стоунхендж', 'Солсбери · Великобритания', 'temple', { w: 16, h: 8, cols: 8, c1: 0x9a9a96, c2: 0x7d7d79 }],
        ['buckingham', 'Букингемский дворец', 'Лондон · Великобритания', 'dome', { w: 24, h: 9, dome: 4, domeC: 0xb8bec2, c1: 0xe6dcc8, c2: 0xcfc3ab, minarets: 0 }],
        ['neuschwanstein', 'Нойшванштайн', 'Бавария · Германия', 'dome', { w: 14, h: 16, dome: 4, domeC: 0x8fa4b4, c1: 0xe8e4d8, c2: 0xd0c8b8, minarets: 3, minaretH: 28 }],
        ['cologne', 'Кёльнский собор', 'Кёльн · Германия', 'dome', { w: 18, h: 14, dome: 5, domeC: 0x8a8f94, c1: 0xa8a49a, c2: 0x8f8b82, minarets: 2, minaretH: 44 }],
        ['brandenburg', 'Бранденбургские ворота', 'Берлин · Германия', 'arch', { w: 18, h: 14, t: 3, c1: 0xe6dcc8, c2: 0xcfc3ab, quadriga: true }],
        ['reichtag', 'Рейхстаг', 'Берлин · Германия', 'dome', { w: 22, h: 10, dome: 6, domeC: 0x8fd0ff, c1: 0xd8cdb8, c2: 0xc4b8a0, minarets: 2, minaretH: 14 }],
        ['amsterdam', 'Каналы Амстердама', 'Амстердам · Нидерланды', 'bridge', { span: 24, h: 9, deck: 3, c1: 0x9aa0a4, c2: 0xb04a3c }],
        ['acropolis', 'Акрополь', 'Афины · Греция', 'temple', { w: 18, h: 10, cols: 8, c1: 0xe6dcc8, c2: 0xd0c8b8 }],
        ['santorini', 'Санторини', 'Киклады · Греция', 'dome', { w: 14, h: 6, dome: 5, domeC: 0x5fa0e0, c1: 0xf4f4f0, c2: 0xe8e8e0, minarets: 0 }],
        ['hagia-sophia', 'Собор Святой Софии', 'Стамбул · Турция', 'dome', { w: 20, h: 12, dome: 9, domeC: 0xb8c4cc, c1: 0xd8c8a8, c2: 0xc4b490, minarets: 4, minaretH: 30 }],
        ['pamukkale', 'Памуккале', 'Денизли · Турция', 'monolith', { h: 14, w: 8, c1: 0xf0f4f8, c2: 0xdce8f0 }],
        ['cappadocia', 'Каппадокия', 'Невшехир · Турция', 'monolith', { h: 18, w: 7, c1: 0xd8b48a, c2: 0xc09c74 }],
        ['petra', 'Петра', 'Маан · Иордания', 'monolith', { h: 22, w: 9, c1: 0xb07a5a, c2: 0x8f5f45 }],
        ['burj-khalifa', 'Бурдж-Халифа', 'Дубай · ОАЭ', 'tower', { w: 10, h: 64, taper: 0.8, c1: 0xb8c4cc, c2: 0x9aa6b0, spire: 14, spireC: 0xd8e0e8, windows: 0x8fd0ff }],
        ['burj-al-arab', 'Бурдж-эль-Араб', 'Дубай · ОАЭ', 'tower', { w: 9, h: 44, taper: 0.4, c1: 0xdce8f0, c2: 0xc0d0dc, spire: 8, spireC: 0xffffff }],
        ['masjid-nabawi', 'Мечеть Пророка', 'Медина · Саудовская Аравия', 'dome', { w: 24, h: 10, dome: 8, domeC: 0x3f7a63, c1: 0xe6dcc8, c2: 0xcfc3ab, minarets: 6, minaretH: 28 }],
        ['kaaba', 'Кааба', 'Мекка · Саудовская Аравия', 'dome', { w: 12, h: 14, dome: 1, domeC: 0x2b2b2b, c1: 0x1f1f22, c2: 0x2f2f33, minarets: 4, minaretH: 26 }],
        ['taj-mahal', 'Тадж-Махал', 'Агра · Индия', 'dome', { w: 22, h: 12, dome: 10, domeC: 0xf0f0ec, c1: 0xf4f2ea, c2: 0xe4e0d4, minarets: 4, minaretH: 26 }],
        ['qutub', 'Кутб-Минар', 'Дели · Индия', 'pagoda', { tiers: 6, w: 10, th: 5, c1: 0xc9a86a, c2: 0xb08a4a, roof: 0xa07a3a }],
        ['red-fort', 'Красный форт', 'Дели · Индия', 'fort', { w: 22, h: 10, c1: 0xb04a3c, c2: 0x8f3a2e, roof: 0xd8cdb8 }],
        ['golden-temple', 'Золотой храм', 'Амритсар · Индия', 'dome', { w: 16, h: 8, dome: 7, domeC: 0xd8a41c, c1: 0xf0e8d8, c2: 0xe0d4bc, minarets: 2, minaretH: 18 }],
        ['potala', 'Дворец Потала', 'Лхаса · Китай', 'fort', { w: 24, h: 16, c1: 0xf0ece0, c2: 0xb03a2e, roof: 0xd8a41c }],
        ['forbidden-city', 'Запретный город', 'Пекин · Китай', 'gate', { w: 26, h: 12, t: 3, c1: 0xb03a2e, c2: 0x6b7075, roof: 0xd8a41c }],
        ['great-wall', 'Великая Китайская стена', 'Пекин · Китай', 'fort', { w: 40, h: 7, c1: 0xa8a49a, c2: 0x8f8b82, roof: 0x7d7d79 }],
        ['temple-heaven', 'Храм Неба', 'Пекин · Китай', 'dome', { w: 18, h: 8, dome: 8, domeC: 0x2f6fa8, c1: 0xb03a2e, c2: 0xd8a41c, minarets: 0 }],
        ['terracotta', 'Терракотовая армия', 'Сиань · Китай', 'statue', { h: 10, w: 4, c1: 0xb08a6a, base: 0x9a7a5a }],
        ['canton-tower', 'Кантонская башня', 'Гуанчжоу · Китай', 'lattice', { h: 60, legs: 4, spread: 9, c1: 0x8d979e, c2: 0x6d777e, deck: 0x8fd0ff, spire: 12 }],
        ['oriental-pearl', 'Восточная жемчужина', 'Шанхай · Китай', 'tower', { w: 7, h: 52, taper: 0.2, c1: 0xd8a4c0, c2: 0xb084a0, spire: 10, spireC: 0xff6b9a }],
        ['shanghai-tower', 'Шанхайская башня', 'Шанхай · Китай', 'tower', { w: 9, h: 66, taper: 0.9, c1: 0x9fb8c8, c2: 0x7f98a8, windows: 0x8fd0ff }],
        ['victoria-harbour', 'Гонконг', 'Гонконг · Китай', 'tower', { w: 8, h: 46, taper: 0.5, c1: 0x8fa4b4, c2: 0x6f8494, windows: 0xffe0a0 }],
        ['fuji', 'Фудзи', 'Хонсю · Япония', 'monolith', { h: 30, w: 18, c1: 0x8fa4b4, c2: 0xf0f4f8 }],
        ['kinkakuji', 'Кинкаку-дзи', 'Киото · Япония', 'pagoda', { tiers: 3, w: 10, th: 4, c1: 0xd8a41c, c2: 0xc08c10, roof: 0x6b5a3a }],
        ['skytree', 'Токийское небесное дерево', 'Токио · Япония', 'lattice', { h: 58, legs: 3, spread: 7, c1: 0xc8d0d8, c2: 0xa8b0b8, deck: 0x8fd0ff }],
        ['itsukushima', 'Ицукусима', 'Хиросима · Япония', 'gate', { w: 16, h: 14, t: 2, c1: 0xb03a2e, c2: 0x8c2a20, roof: 0x6b7075 }],
        ['angkor', 'Ангкор-Ват', 'Сиемреап · Камбоджа', 'pagoda', { tiers: 4, w: 14, th: 5, c1: 0xa89878, c2: 0x8f8064, roof: 0x7d7058 }],
        ['bagan', 'Баган', 'Мандалай · Мьянма', 'dome', { w: 14, h: 10, dome: 7, domeC: 0xd8a41c, c1: 0xb08a6a, c2: 0x9a7a5a, minarets: 0 }],
        ['wat-arun', 'Ват Арун', 'Бангкок · Таиланд', 'pagoda', { tiers: 6, w: 9, th: 5, c1: 0xf0ece0, c2: 0xd8d4c8, roof: 0xd8a41c }],
        ['marina-bay', 'Марина-Бэй Сэндс', 'Сингапур', 'tower', { w: 16, h: 34, taper: 0, c1: 0xc8d4dc, c2: 0xa8b4bc, windows: 0x8fd0ff }],
        ['petronas', 'Башни Петронас', 'Куала-Лумпур · Малайзия', 'tower', { w: 8, h: 56, taper: 0.5, c1: 0xb8c8d0, c2: 0x98a8b0, spire: 10, spireC: 0x8fd0ff }],
        ['borobudur', 'Боробудур', 'Ява · Индонезия', 'pagoda', { tiers: 7, w: 16, th: 3, c1: 0x8f8b82, c2: 0x7d7a72, roof: 0x6b6862 }],
        ['uluru', 'Улуру', 'Алис-Спрингс · Австралия', 'monolith', { h: 16, w: 16, c1: 0xb04a3c, c2: 0x8f3a2e }],
        ['sydney-opera', 'Сиднейский оперный театр', 'Сидней · Австралия', 'dome', { w: 22, h: 8, dome: 9, domeC: 0xf4f6f8, c1: 0xe8ecef, c2: 0xd0d8dc, minarets: 0 }],
        ['harbour-bridge', 'Харбор-бридж', 'Сидней · Австралия', 'arch', { w: 34, h: 24, t: 4, c1: 0x6f7a82, c2: 0x5f6a72 }],
        ['matterhorn', 'Маттерхорн', 'Церматт · Швейцария', 'monolith', { h: 34, w: 14, c1: 0x9aa0a4, c2: 0xf0f4f8 }],
        ['mont-saint-michel', 'Мон-Сен-Мишель', 'Нормандия · Франция', 'dome', { w: 14, h: 14, dome: 6, domeC: 0x8fa4b4, c1: 0xd8cdb8, c2: 0xc4b8a0, minarets: 1, minaretH: 30 }],
        ['statue-liberty', 'Статуя Свободы', 'Нью-Йорк · США', 'statue', { h: 30, w: 8, c1: 0x5f9a86, base: 0x9a9a96, flame: 0xffb84a, crown: 0xd8a41c }],
        ['empire-state', 'Эмпайр-стейт-билдинг', 'Нью-Йорк · США', 'tower', { w: 10, h: 58, taper: 0.4, c1: 0xb8bec2, c2: 0x9aa0a4, spire: 12, spireC: 0xc8ced2, windows: 0xffe0a0 }],
        ['brooklyn', 'Бруклинский мост', 'Нью-Йорк · США', 'bridge', { span: 34, h: 18, deck: 4, c1: 0x8d979e, c2: 0xa89878 }],
        ['times-square', 'Таймс-сквер', 'Нью-Йорк · США', 'tower', { w: 14, h: 30, taper: 0, c1: 0x6f7a82, c2: 0x5f6a72, windows: 0xffd05a }],
        ['golden-gate', 'Золотые ворота', 'Сан-Франциско · США', 'bridge', { span: 40, h: 26, deck: 5, c1: 0xd8dee2, c2: 0xb04a3c, cable: 0xd8dee2 }],
        ['white-house', 'Белый дом', 'Вашингтон · США', 'dome', { w: 22, h: 8, dome: 4, domeC: 0xb8bec2, c1: 0xf4f4f0, c2: 0xe4e4dc, minarets: 0 }],
        ['grand-canyon', 'Гранд-Каньон', 'Аризона · США', 'monolith', { h: 20, w: 20, c1: 0xb06a4a, c2: 0x8f5038 }],
        ['chichen', 'Чичен-Ица', 'Юкатан · Мексика', 'pyramid', { h: 20, base: 22, step: 2, c1: 0xd8c8a8, c2: 0xc4b490 }],
        ['teotihuacan', 'Теотиуакан', 'Мехико · Мексика', 'pyramid', { h: 24, base: 32, step: 3, c1: 0xc4b490, c2: 0xb0a080 }],
        ['machu-picchu', 'Мачу-Пикчу', 'Куско · Перу', 'fort', { w: 22, h: 8, c1: 0x8f8b82, c2: 0x7d7a72, roof: 0x6b6862 }],
        ['nazca', 'Линии Наски', 'Наска · Перу', 'monolith', { h: 6, w: 16, c1: 0xa89878, c2: 0x8f8064 }],
        ['christ-redeemer', 'Христос-Искупитель', 'Рио-де-Жанейро · Бразилия', 'statue', { h: 26, w: 6, c1: 0xd8dee2, base: 0x9a9a96, flame: 0xf0f4f8, crown: 0xb8bec2 }],
        ['tikal', 'Тикаль', 'Петен · Гватемала', 'pyramid', { h: 22, base: 20, step: 2, c1: 0xb0a080, c2: 0x9a8a6a }],
        ['moai', 'Моаи', 'Остров Пасхи · Чили', 'statue', { h: 14, w: 5, c1: 0x8f8b82, base: 0x7d7a72 }],
        ['djenne', 'Большая мечеть Дженне', 'Дженне · Мали', 'dome', { w: 18, h: 12, dome: 4, domeC: 0xd8c8a8, c1: 0xc09c74, c2: 0xa88460, minarets: 6, minaretH: 22 }],
        ['lalibela', 'Лалибела', 'Амхара · Эфиопия', 'temple', { w: 16, h: 10, cols: 6, c1: 0xb06a4a, c2: 0x8f5038 }],
        ['kilimanjaro', 'Килиманджаро', 'Килиманджаро · Танзания', 'monolith', { h: 38, w: 18, c1: 0x8a8d85, c2: 0xf0f4f8 }],
        ['luxor', 'Луксорский храм', 'Луксор · Египет', 'temple', { w: 20, h: 12, cols: 10, c1: 0xd9c08a, c2: 0xc9b08a }],
        ['petra-treasury', 'Сокровищница Петры', 'Петра · Иордания', 'temple', { w: 16, h: 16, cols: 6, c1: 0xc08a6a, c2: 0xa8745a }],
        ['masada', 'Масада', 'Мёртвое море · Израиль', 'fort', { w: 20, h: 10, c1: 0xc4b490, c2: 0xa89878, roof: 0x8f8064 }],
        ['baalbek', 'Баальбек', 'Бекаа · Ливан', 'temple', { w: 20, h: 12, cols: 8, c1: 0xd8cdb8, c2: 0xc4b8a0 }],
        ['persepolis', 'Персеполь', 'Фарс · Иран', 'temple', { w: 22, h: 10, cols: 10, c1: 0xc9a86a, c2: 0xb08a4a }],
        ['registan', 'Регистан', 'Самарканд · Узбекистан', 'dome', { w: 22, h: 12, dome: 6, domeC: 0x2f8f8f, c1: 0xd8c8a8, c2: 0xc4b490, minarets: 4, minaretH: 26 }],
        ['bukhara', 'Бухара', 'Бухара · Узбекистан', 'dome', { w: 18, h: 10, dome: 6, domeC: 0x2f8f8f, c1: 0xc9a86a, c2: 0xb08a4a, minarets: 2, minaretH: 24 }],
        ['kathmandu', 'Ступа Боднатх', 'Катманду · Непал', 'dome', { w: 20, h: 8, dome: 10, domeC: 0xf0ece0, c1: 0xe0d8c8, c2: 0xd0c8b4, minarets: 0 }],
        ['everest', 'Эверест', 'Гималаи · Непал', 'monolith', { h: 44, w: 20, c1: 0x9aa0a4, c2: 0xf0f4f8 }],
        ['thai-palace', 'Большой дворец', 'Бангкок · Таиланд', 'pagoda', { tiers: 5, w: 12, th: 5, c1: 0xd8a41c, c2: 0xc08c10, roof: 0xb03a2e }],
        ['hanoi', 'Храм Литературы', 'Ханой · Вьетнам', 'gate', { w: 16, h: 10, t: 2, c1: 0xb03a2e, c2: 0x6b7075, roof: 0xd8a41c }],
        ['seoul-palace', 'Кёнбоккун', 'Сеул · Корея', 'gate', { w: 20, h: 12, t: 3, c1: 0xb03a2e, c2: 0x3f7a63, roof: 0x565b60 }],
        ['taipei', 'Тайбэй 101', 'Тайбэй · Тайвань', 'tower', { w: 9, h: 62, taper: 0.3, c1: 0x9fb8a8, c2: 0x7f9888, spire: 10, spireC: 0xd8a41c, windows: 0x8fd0ff }]
    ];

    function buildOne(def) {
        var v = new Vox();
        var fn = A[def[3]];
        if (!fn) return null;
        fn(v, def[4] || {});
        return v.group(THREE);
    }

    // ---------- сцена ----------
    function open(initialFocus) {
        if (wrap) wrap.remove();
        wrap = document.createElement('div');
        wrap.id = 'lm-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9860;background:#070b0f;' +
            'font:13px Inter,system-ui,sans-serif;color:#dce8f7';
        document.body.appendChild(wrap);

        import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.shadowMap.enabled = false;   // 100 моделей: тени отключаем ради скорости
            renderer.setSize(window.innerWidth, window.innerHeight);
            wrap.appendChild(renderer.domElement);

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x8fb4d0);
            scene.fog = new THREE.Fog(0x9fc4dc, 260, 900);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5358, 1.05));
            var dir = new THREE.DirectionalLight(0xfff4e0, 1.05);
            dir.position.set(60, 90, 40);
            dir.castShadow = false;
            scene.add(dir);
            // второй свет снизу-справа, чтобы силуэты читались
            var fill = new THREE.DirectionalLight(0xbcd4ea, 0.35);
            fill.position.set(-50, 30, -40);
            scene.add(fill);

            // земля
            var ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700),
                new THREE.MeshLambertMaterial({ color: 0x5b8a42 }));
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = false;
            scene.add(ground);

            var blockTotal = 0;
            // сетка витрины: 10 × 10
            var cols = 10, gap = 42;
            models = [];
            LIST.forEach(function (def, i) {
                var g = buildOne(def);
                if (!g) return;
                var cx = (i % cols) - (cols - 1) / 2;
                var cz = Math.floor(i / cols) - (cols - 1) / 2;
                g.position.set(cx * gap, 0, cz * gap);
                scene.add(g);
                g.children.forEach(function (m) { if (m.count) blockTotal += m.count; });
                models.push({ def: def, group: g });
            });

            camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 1600);
            camera.position.set(0, 250, 430);
            camera.lookAt(0, 10, 0);

            // HUD
            var hud = document.createElement('div');
            hud.style.cssText = 'position:absolute;left:0;right:0;top:0;padding:12px 14px;z-index:3;' +
                'display:flex;gap:10px;align-items:center;flex-wrap:wrap;' +
                'background:linear-gradient(rgba(7,11,15,.92),rgba(7,11,15,0))';
            hud.innerHTML = '<b style="color:#8fd6ff;font-size:14px">🗺 Достопримечательности планеты</b>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#23262a;' +
                'font:700 12px monospace">' + models.length + ' объектов · ' + blockTotal + ' блоков</span>' +
                '<span id="lm-name" style="padding:5px 10px;border:2px solid #101214;border-radius:6px;' +
                'background:#23262a;font:700 12px monospace;color:#ffd05a">наведи на модель</span>' +
                '<span style="flex:1"></span>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#23262a;' +
                'font:700 11.5px monospace">колесо — зум · ЛКМ — вращение</span>';
            wrap.appendChild(hud);

            var nav = document.createElement('div');
            nav.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
                'display:flex;gap:8px;z-index:4';
            var spinBtn = document.createElement('button');
            spinBtn.textContent = '⟳ Вращение';
            spinBtn.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;' +
                'box-shadow:0 4px 0 #101214';
            spinBtn.onclick = function () { spin = !spin; };
            nav.appendChild(spinBtn);
            var close = document.createElement('button');
            close.textContent = '✕ Закрыть';
            close.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:#3b4348;color:#e6eaed;box-shadow:0 4px 0 #101214';
            close.onclick = function () { cancelAnimationFrame(raf); wrap.remove(); wrap = null; };
            nav.appendChild(close);
            wrap.appendChild(nav);

            var drag = false, px = 0, py = 0;
            var theta = Math.atan2(camera.position.x, camera.position.z);
            var radius = camera.position.length();
            var phi = Math.acos(camera.position.y / radius);
            renderer.domElement.addEventListener('pointerdown', function (e) { drag = true; px = e.clientX; py = e.clientY; });
            window.addEventListener('pointerup', function () { drag = false; });
            window.addEventListener('pointermove', function (e) {
                if (!drag) return;
                theta -= (e.clientX - px) * 0.005;
                phi = Math.max(0.12, Math.min(1.35, phi - (e.clientY - py) * 0.004));
                px = e.clientX; py = e.clientY;
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 0, 0);
            });
            renderer.domElement.addEventListener('wheel', function (e) {
                e.preventDefault();
                radius = Math.max(40, Math.min(700, radius + e.deltaY * 0.4));
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 0, 0);
            }, { passive: false });

            // подсветка ближайшей модели к курсору
            var ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
            renderer.domElement.addEventListener('pointermove', function (e) {
                var r = renderer.domElement.getBoundingClientRect();
                ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
                ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
                ray.setFromCamera(ptr, camera);
                var objs = models.map(function (m) { return m.group; });
                var hit = ray.intersectObjects(objs, true)[0];
                var label = document.getElementById('lm-name');
                if (!label) return;
                if (hit) {
                    var root = hit.object;
                    while (root.parent && objs.indexOf(root) < 0) root = root.parent;
                    var found = models.filter(function (m) { return m.group === root; })[0];
                    if (found) {
                        label.textContent = found.def[1] + ' · ' + found.def[2];
                        return;
                    }
                }
                label.textContent = 'наведи на модель';
            });

            var rotM = location.search.match(/[?&]rotate=(-?\d+)/);
            if (rotM) { scene.rotation.y = parseFloat(rotM[1]) * Math.PI / 180; spin = false; }

            var last = performance.now();
            (function loop(now) {
                raf = requestAnimationFrame(loop);
                var dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                if (spin) {
                    scene.rotation.y += dt * 0.06;
                }
                renderer.render(scene, camera);
            })(last);
        }).catch(function (e) {
            var d = document.createElement('div');
            d.textContent = 'Не загрузился 3D: ' + (e && e.message ? e.message : e);
            d.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
            wrap.appendChild(d);
        });
    }

    // кнопка в меню
    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('lm-btn')) return;
        var b = document.createElement('button');
        b.className = 'menu-btn';
        b.id = 'lm-btn';
        b.textContent = '🗺 Достопримечательности';
        b.setAttribute('data-tip', '100 объектов|Пирамиды, Кремль, Эйфель, Тадж-Махал и другие');
        b.onclick = function () { open(); };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Landmarks = { open: open, list: LIST, count: LIST.length };

    if (/[?&]landmarks=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(function () { open(); }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
