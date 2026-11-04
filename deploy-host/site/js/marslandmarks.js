// Достопримечательности Марса: из фантастики и с реальных карт.
// Сцена: ?marslm=1  ·  меню «🔴 Марс: достопримечательности»
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    var U = 1.0, THREE = null, scene = null, camera = null, renderer = null, wrap = null, raf = 0;
    var models = [], spin = true, blockTotal = 0;

    // ---- воксельный холст ----
    function Vox() { this.m = {}; }
    Vox.prototype.add = function (x, y, z, c) { this.m[x + '|' + y + '|' + z] = c; return this; };
    Vox.prototype.box = function (x, y, z, w, h, d, c) {
        for (var i = 0; i < w; i++) for (var j = 0; j < h; j++) for (var k = 0; k < d; k++) {
            this.m[(x + i) + '|' + (y + j) + '|' + (z + k)] = c;
        }
        return this;
    };
    Vox.prototype.group = function (THREE) {
        var g = new THREE.Group(), byColor = {};
        for (var key in this.m) { (byColor[this.m[key]] = byColor[this.m[key]] || []).push(key); }
        var geo = new THREE.BoxGeometry(U * 0.97, U * 0.97, U * 0.97);
        Object.keys(byColor).forEach(function (c) {
            var list = byColor[c];
            var mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: parseInt(c, 10) }), list.length);
            var m4 = new THREE.Matrix4();
            list.forEach(function (k, i) {
                var p = k.split('|');
                m4.makeTranslation(parseInt(p[0], 10) * U, parseInt(p[1], 10) * U, parseInt(p[2], 10) * U);
                mesh.setMatrixAt(i, m4);
            });
            mesh.instanceMatrix.needsUpdate = true;
            g.add(mesh);
        });
        return g;
    };

    var RUST = 0xb4553a, RUST2 = 0x8f3f2a, DUST = 0xd8a888, DARK = 0x5a3a30;
    var METAL = 0x9aa0a4, GLASS = 0x8fd0ff, WHITE = 0xe6eaee, GOLD = 0xd8a41c;

    // ---- архетипы ----
    var A = {
        // вулкан-щит (Олимп): широкий конус с кальдерой
        volcano: function (v, p) {
            var h = p.h || 30, base = p.base || 46, caldera = p.caldera || 6;
            for (var y = 0; y < h; y++) {
                var k = y / h;
                var w = Math.max(3, Math.round(base * (1 - Math.pow(k, 0.6))));
                var r = w / 2;
                for (var x = -Math.ceil(r); x <= Math.ceil(r); x++) {
                    for (var z = -Math.ceil(r); z <= Math.ceil(r); z++) {
                        var d = Math.hypot(x, z);
                        if (d > r) continue;
                        if (y > h - 5 && d < caldera) continue;     // кальдера наверху
                        // склоны: цвет зависит от высоты, без резких полос
                        var shade = d > r - 1 ? RUST2 : RUST;
                        if (y > h - 6) shade = DARK;
                        v.add(x, y, z, shade);
                    }
                }
            }
            return v;
        },
        // каньон: две стены, уступы и дно
        canyon: function (v, p) {
            var len = p.len || 80, depth = p.depth || 16, width = p.width || 22;
            for (var x = 0; x < len; x++) {
                var wobble = Math.round(Math.sin(x * 0.15) * 2);
                for (var y = 0; y < depth; y++) {
                    var step = Math.floor(y / 5);
                    // левая стена
                    v.add(x, y, -Math.floor(width / 2) + step + wobble, y > depth - 4 ? DUST : RUST2);
                    // правая стена
                    v.add(x, y, Math.floor(width / 2) - step + wobble, y > depth - 4 ? DUST : RUST2);
                    // уступы через каждые 5 ярусов
                    if (y % 5 === 0 && y > 0) {
                        for (var t = 0; t < step + 2; t++) {
                            v.add(x, y, -Math.floor(width / 2) + t + wobble, DUST);
                            v.add(x, y, Math.floor(width / 2) - t + wobble, DUST);
                        }
                    }
                }
                // дно каньона
                for (var z2 = -Math.floor(width / 2) + 3; z2 <= Math.floor(width / 2) - 3; z2++) {
                    v.add(x, 0, z2 + wobble, DARK);
                }
            }
            return v;
        },
        // купол обитания (Арес-3)
        dome: function (v, p) {
            var r = p.r || 7, legs = p.legs !== false;
            for (var y = 0; y <= r; y++) {
                var rr = Math.sqrt(Math.max(0, r * r - y * y));
                for (var x = -r; x <= r; x++) for (var z = -r; z <= r; z++) {
                    var d = Math.hypot(x, z);
                    if (d > rr) continue;
                    if (d > rr - 1.3) v.add(x, y, z, y > r * 0.6 ? WHITE : (y % 3 ? WHITE : METAL));
                }
            }
            v.box(-1, 0, r - 1, 3, 2, 1, GLASS);
            if (legs) {
                [[-r, -r], [r, -r], [-r, r], [r, r]].forEach(function (c) {
                    for (var l = 0; l < 3; l++) v.add(c[0], l, c[1], METAL);
                });
            }
            return v;
        },
        // башня космического лифта (Шеффилд) с тросом
        elevator: function (v, p) {
            var h = p.h || 56, w = p.w || 8;
            v.box(-Math.floor(w / 2), 0, -Math.floor(w / 2), w, 4, w, METAL);
            for (var y = 4; y < h; y++) {
                var k = y > h * 0.75 ? 1 : 0;
                v.box(k, y, k, w - k * 2, 1, w - k * 2, y % 6 === 0 ? GOLD : WHITE);
            }
            // трос уходит вверх
            for (var c = 0; c < 26; c++) v.add(2, h + c, 2, c % 8 === 0 ? GLASS : 0xcfd8e0);
            return v;
        },
        // купольный город (Берроуз): несколько куполов и башни
        city: function (v, p) {
            var n = p.domes || 3, r = p.r || 6;
            for (var i = 0; i < n; i++) {
                var ox = (i - (n - 1) / 2) * (r * 2 + 2);
                for (var y = 0; y <= r; y++) {
                    var rr = Math.sqrt(Math.max(0, r * r - y * y));
                    for (var x = -r; x <= r; x++) for (var z = -r; z <= r; z++) {
                        var d = Math.hypot(x, z);
                        if (d > rr || d < rr - 1.2) continue;
                        v.add(ox + x, y, z, y > r * 0.7 ? WHITE : (y % 2 ? WHITE : 0xd0d8de));
                    }
                }
            }
            // башни между куполами
            for (var t = 0; t < n - 1; t++) {
                var tx = (t - (n - 2) / 2) * (r * 2 + 2);
                for (var h = 0; h < r * 3; h++) v.box(tx, h, 0, 2, 1, 2, h % 4 ? METAL : GLASS);
            }
            return v;
        },
        // руины Барсума: колонны и арки
        ruin: function (v, p) {
            var cols = p.cols || 6, h = p.h || 14;
            for (var c = 0; c < cols; c++) {
                var x = (c - (cols - 1) / 2) * 4;
                var broken = (c * 7) % 5 === 0;
                var ch = broken ? Math.floor(h * 0.55) : h;
                for (var y = 0; y < ch; y++) v.box(Math.round(x), y, 0, 2, 1, 2, y % 4 === 0 ? DUST : RUST2);
                if (!broken) v.box(Math.round(x) - 1, ch, -1, 4, 1, 4, DUST);
                if (c < cols - 1 && !broken) {
                    for (var ax = 2; ax < 4; ax++) v.box(Math.round(x) + ax, h - 1, 0, 1, 1, 2, DUST);
                }
            }
            return v;
        },
        // цилиндр марсиан (Война миров): упавший снаряд
        cylinder: function (v, p) {
            var len = p.len || 22, r = p.r || 5;
            for (var x = 0; x < len; x++) {
                for (var y = -r; y <= r; y++) for (var z = -r; z <= r; z++) {
                    var d = Math.hypot(y, z);
                    if (Math.abs(d - r) > 1) continue;
                    v.add(x, y + r, z, (x % 5 === 0) ? DARK : (x < 3 ? 0x8f6b52 : METAL));
                }
            }
            // воронка
            for (var a = 0; a < 40; a++) {
                var ang = a / 40 * Math.PI * 2;
                for (var rr = r + 1; rr < r + 8; rr++) {
                    v.add(Math.round(Math.cos(ang) * rr) + 2, 0, Math.round(Math.sin(ang) * rr), RUST2);
                }
            }
            return v;
        },
        // промышленная база (UAC, Doom): корпуса, трубы, радар
        industrial: function (v, p) {
            v.box(-10, 0, -6, 20, 5, 12, METAL);
            v.box(-8, 5, -4, 6, 4, 8, 0x6f7a82);
            v.box(4, 5, -4, 6, 6, 8, 0x6f7a82);
            for (var y = 0; y < 16; y++) v.box(9, y, 4, 1, 1, 1, DARK);
            v.box(8, 16, 3, 3, 1, 3, GOLD);
            // трубы
            for (var t = 0; t < 3; t++) {
                for (var h = 0; h < 9; h++) v.box(-9 + t * 3, 9 + h, 6, 1, 1, 1, t % 2 ? 0x8a3a2a : METAL);
            }
            // прожекторы
            [[-9, 0], [9, 0]].forEach(function (c) {
                for (var l = 0; l < 7; l++) v.add(c[0], l, -6, METAL);
                v.add(c[0], 7, -6, 0xfff0b0);
            });
            return v;
        },
        // «Лицо Марса» (Кидония): монолит-маска
        face: function (v, p) {
            var w = 16, h = 14;
            v.box(-w / 2, 0, 0, w, h, 6, RUST2);
            // глаза, нос, рот
            v.box(-5, 9, 6, 3, 2, 1, DARK);
            v.box(2, 9, 6, 3, 2, 1, DARK);
            v.box(-1, 6, 6, 2, 3, 1, RUST);
            v.box(-4, 3, 6, 8, 1, 1, DARK);
            // решётка «пирамиды» рядом
            for (var i = 0; i < 3; i++) v.box(10 + i, i, -12 + i * 2, 3, 3 - i, 3, DUST);
            return v;
        },
        // шахта льда: вход, лебёдка, бур
        icemine: function (v, p) {
            v.box(-6, 0, -6, 13, 1, 13, METAL);
            for (var i = 0; i < 4; i++) {
                v.box(-6 + i * 4, 1, -6, 1, 8, 1, METAL);
                v.box(-6 + i * 4, 1, 6, 1, 8, 1, METAL);
            }
            v.box(-6, 9, -6, 13, 1, 13, 0x6f7a82);
            for (var y = 0; y < 12; y++) v.box(0, y, 0, 1, 1, 1, y % 3 ? GOLD : METAL);
            v.box(2, 0, 0, 3, 2, 3, 0x7fd8ff);    // лёд
            return v;
        },
        // ровер и посадочный модуль (Pathfinder / МАВ)
        lander: function (v, p) {
            v.box(-4, 0, -4, 9, 1, 9, METAL);
            for (var i = 0; i < 4; i++) v.box(-4 + (i % 2) * 8, 1, -4 + Math.floor(i / 2) * 8, 1, 5, 1, METAL);
            v.box(-3, 6, -3, 7, 3, 7, WHITE);
            v.box(-1, 9, -1, 3, 1, 3, GOLD);
            // ровер
            v.box(-8, 1, 0, 4, 1, 3, 0xc8a86a);
            [[-8, 0], [-5, 0], [-8, 2], [-5, 2]].forEach(function (c) {
                v.add(c[0], 0, c[1], DARK);
            });
            v.box(-7, 2, 1, 1, 1, 1, GLASS);
            return v;
        },
        // атмосферная станция Барсума: башня с раструбами
        atmosphere: function (v, p) {
            var h = p.h || 34;
            for (var y = 0; y < h; y++) {
                var w = y < h * 0.7 ? 4 : 6;
                v.box(-Math.floor(w / 2), y, -Math.floor(w / 2), w, 1, w, y % 5 === 0 ? RUST2 : DUST);
            }
            for (var i = 0; i < 3; i++) {
                var r = 5 - i;
                for (var a = 0; a < 24; a++) {
                    var ang = a / 24 * Math.PI * 2;
                    v.add(Math.round(Math.cos(ang) * r), h + i * 2, Math.round(Math.sin(ang) * r), i % 2 ? DUST : RUST);
                }
            }
            for (var y2 = h; y2 < h + 6; y2++) v.add(0, y2, 0, GOLD);
            return v;
        }
    };

    // ---- 12 достопримечательностей Марса ----
    var LIST = [
        ['olympus', 'Олимп', 'вулкан 22 км · реальный', 'volcano', { h: 34, base: 52, caldera: 7 }],
        ['marineris', 'Долины Маринер', 'каньон 4 000 км · реальный', 'canyon', { len: 64, depth: 16, width: 18 }],
        ['cydonia', 'Лицо Марса', 'Кидония · городская легенда', 'face', {}],
        ['ares3', 'Арес-3', '«Марсианин» · Энди Вейер', 'dome', { r: 8 }],
        ['mav', 'МАВ и ровер', '«Марсианин» · взлётный модуль', 'lander', {}],
        ['underhill', 'Андерхилл', '«Красный Марс» · первая база', 'dome', { r: 6, legs: false }],
        ['burroughs', 'Берроуз', '«Красный Марс» · купольный город', 'city', { domes: 3, r: 6 }],
        ['sheffield', 'Шеффилд', '«Красный Марс» · космический лифт', 'elevator', { h: 58, w: 8 }],
        ['dorsa', 'Дорса Бревия', '«Красный Марс» · скрытая колония', 'ruin', { cols: 7, h: 12 }],
        ['barsoom', 'Руины Барсума', 'Э. Р. Берроуз · «Принцесса Марса»', 'ruin', { cols: 9, h: 16 }],
        ['barsoomplant', 'Атмосферная станция', 'Барсум · завод атмосферы', 'atmosphere', { h: 36 }],
        ['cylinder', 'Марсианский цилиндр', '«Война миров» · Г. Уэллс', 'cylinder', { len: 24, r: 5 }],
        ['uac', 'База UAC', 'Doom · промышленный форпост', 'industrial', {}],
        ['icemine', 'Ледяная шахта', 'добыча воды · реальная идея', 'icemine', {}]
    ];

    function buildOne(def) {
        var fn = A[def[3]];
        if (!fn) return null;
        var v = new Vox();
        fn(v, def[4] || {});
        return v.group(THREE);
    }

    function open() {
        if (wrap) wrap.remove();
        wrap = document.createElement('div');
        wrap.id = 'mm-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9865;background:#1a0f0a;' +
            'font:13px Inter,system-ui,sans-serif;color:#f2ded4';
        document.body.appendChild(wrap);

        import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.setSize(window.innerWidth, window.innerHeight);
            wrap.appendChild(renderer.domElement);

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xd9a184);
            scene.fog = new THREE.Fog(0xd9a184, 320, 900);
            scene.add(new THREE.HemisphereLight(0xffe6d0, 0x5a3a30, 1.1));
            var dir = new THREE.DirectionalLight(0xffe0c0, 1.0);
            dir.position.set(60, 80, 50);
            scene.add(dir);
            var fill = new THREE.DirectionalLight(0xa88a70, 0.35);
            fill.position.set(-50, 20, -40);
            scene.add(fill);

            var ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800),
                new THREE.MeshLambertMaterial({ color: 0xb4553a }));
            ground.rotation.x = -Math.PI / 2;
            scene.add(ground);

            var cols = 5, gap = 52;
            var rows = Math.ceil(LIST.length / cols);
            models = [];
            LIST.forEach(function (def, i) {
                var g = buildOne(def);
                if (!g) return;
                var cx = (i % cols) - (cols - 1) / 2;
                var cz = Math.floor(i / cols) - (rows - 1) / 2;
                g.position.set(cx * gap, 0, cz * gap);
                scene.add(g);
                g.children.forEach(function (m) { if (m.count) blockTotal += m.count; });
                models.push({ def: def, group: g });
            });

            camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 1400);
            camera.position.set(0, 118, 225);
            camera.lookAt(0, 12, 0);

            var hud = document.createElement('div');
            hud.style.cssText = 'position:absolute;left:0;right:0;top:0;padding:12px 14px;z-index:3;' +
                'display:flex;gap:10px;align-items:center;flex-wrap:wrap;' +
                'background:linear-gradient(rgba(26,15,10,.92),rgba(26,15,10,0))';
            hud.innerHTML = '<b style="color:#ffb48a;font-size:14px">🔴 Достопримечательности Марса</b>' +
                '<span style="padding:5px 10px;border:2px solid #2a140c;border-radius:6px;background:#3a1f14;' +
                'font:700 12px monospace">' + models.length + ' объектов · ' + blockTotal + ' блоков</span>' +
                '<span id="mm-name" style="padding:5px 10px;border:2px solid #2a140c;border-radius:6px;' +
                'background:#3a1f14;font:700 12px monospace;color:#ffd05a">наведи на постройку</span>';
            wrap.appendChild(hud);

            var nav = document.createElement('div');
            nav.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
                'display:flex;gap:8px;z-index:4';
            var spinBtn = document.createElement('button');
            spinBtn.textContent = '⟳ Вращение';
            spinBtn.style.cssText = 'padding:9px 14px;border:3px solid #2a140c;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:linear-gradient(#ffb48a,#c4613a);color:#2a0f04';
            spinBtn.onclick = function () { spin = !spin; };
            nav.appendChild(spinBtn);
            var close = document.createElement('button');
            close.textContent = '✕ Закрыть';
            close.style.cssText = 'padding:9px 14px;border:3px solid #2a140c;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:#4a2a1c;color:#f2ded4';
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
                camera.lookAt(0, 8, 0);
            });
            renderer.domElement.addEventListener('wheel', function (e) {
                e.preventDefault();
                radius = Math.max(40, Math.min(600, radius + e.deltaY * 0.35));
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 8, 0);
            }, { passive: false });

            var ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
            renderer.domElement.addEventListener('pointermove', function (e) {
                var r = renderer.domElement.getBoundingClientRect();
                ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
                ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
                ray.setFromCamera(ptr, camera);
                var objs = models.map(function (m) { return m.group; });
                var hit = ray.intersectObjects(objs, true)[0];
                var label = document.getElementById('mm-name');
                if (!label) return;
                if (hit) {
                    var root = hit.object;
                    while (root.parent && objs.indexOf(root) < 0) root = root.parent;
                    var f = models.filter(function (m) { return m.group === root; })[0];
                    if (f) { label.textContent = f.def[1] + ' · ' + f.def[2]; return; }
                }
                label.textContent = 'наведи на постройку';
            });

            var rotM = location.search.match(/[?&]rotate=(-?\d+)/);
            if (rotM) { scene.rotation.y = parseFloat(rotM[1]) * Math.PI / 180; spin = false; }

            var last = performance.now();
            (function loop(now) {
                raf = requestAnimationFrame(loop);
                var dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                if (spin) scene.rotation.y += dt * 0.05;
                renderer.render(scene, camera);
            })(last);
        }).catch(function (e) {
            var d = document.createElement('div');
            d.textContent = 'Не загрузился 3D: ' + (e && e.message ? e.message : e);
            d.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
            wrap.appendChild(d);
        });
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('mm-btn')) return;
        var b = document.createElement('button');
        b.className = 'menu-btn';
        b.id = 'mm-btn';
        b.textContent = '🔴 Марс: достопримечательности';
        b.setAttribute('data-tip', 'Марс|Олимп, Долины Маринер, Арес-3, Шеффилд, Барсум');
        b.onclick = function () { open(); };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.MarsLandmarks = { open: open, list: LIST };

    if (/[?&]marslm=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(open, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
