// Поселение на астероиде: несколько куполов, стеклянные трубы-дороги над
// поверхностью и туннели под ней. Сцена: ?asteroid=1
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    var U = 1.0, THREE = null, scene = null, camera = null, renderer = null, wrap = null, raf = 0;
    var spin = true, blocks = 0, glassMeshes = [];

    // ---- воксельный холст ----
    function Vox() { this.m = {}; }
    Vox.prototype.add = function (x, y, z, c) { this.m[Math.round(x) + '|' + Math.round(y) + '|' + Math.round(z)] = c; return this; };
    Vox.prototype.box = function (x, y, z, w, h, d, c) {
        for (var i = 0; i < w; i++) for (var j = 0; j < h; j++) for (var k = 0; k < d; k++) {
            this.m[(x + i) + '|' + (y + j) + '|' + (z + k)] = c;
        }
        return this;
    };
    Vox.prototype.group = function (THREE, opaqueOnly) {
        var g = new THREE.Group(), byColor = {};
        for (var key in this.m) {
            var c = this.m[key];
            if (opaqueOnly && GLASS[c]) continue;
            if (!opaqueOnly && !GLASS[c]) continue;
            (byColor[c] = byColor[c] || []).push(key);
        }
        var geo = new THREE.BoxGeometry(U, U, U);
        Object.keys(byColor).forEach(function (c) {
            var list = byColor[c];
            var mat = GLASS[c]
                ? new THREE.MeshLambertMaterial({
                    color: parseInt(c, 10), transparent: true, opacity: 0.16,
                    emissive: new THREE.Color(parseInt(c, 10)), emissiveIntensity: 0.35,
                    depthWrite: false
                })
                : new THREE.MeshLambertMaterial({ color: parseInt(c, 10) });
            var mesh = new THREE.InstancedMesh(geo, mat, list.length);
            var m4 = new THREE.Matrix4();
            list.forEach(function (k, i) {
                var p = k.split('|');
                m4.makeTranslation(parseInt(p[0], 10) * U, parseInt(p[1], 10) * U, parseInt(p[2], 10) * U);
                mesh.setMatrixAt(i, m4);
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (GLASS[c]) mesh.renderOrder = 2;
            g.add(mesh);
        });
        return g;
    };

    // палитра
    var ROCK = 0x6f6a66, ROCK2 = 0x565350, ROCK3 = 0x8a857f, ICE = 0xb8d4e0;
    var GLASS = {}; var GLASS_C = 0x9fe0ff; GLASS[GLASS_C] = true;
    var METAL = 0x9aa0a4, WHITE = 0xe6eaee, LIGHT = 0xffe0a0, GREEN = 0x3f7a63, PANEL = 0x7f8a92;

    function noise(x, y, z) {
        return Math.sin(x * 0.21 + 1.3) * Math.cos(y * 0.17) * Math.sin(z * 0.19 - 0.7) * 2.4
            + Math.sin(x * 0.07 - 0.4) * Math.cos(z * 0.09 + 0.9) * 3.2;
    }

    // ---- астероид: неровный эллипсоид ----
    function asteroid(v, R) {
        var a = R * 1.25, b = R * 0.85, c = R * 1.0;
        for (var x = -a; x <= a; x++) {
            for (var y = -b; y <= b * 0.55; y++) {
                for (var z = -c; z <= c; z++) {
                    var d = (x * x) / (a * a) + (y * y) / (b * b) + (z * z) / (c * c);
                    var n = noise(x, y, z) / 22;
                    if (d > 1 + n) continue;
                    var deep = Math.abs(y) > b * 0.35;
                    var col = d > 0.86 ? ROCK3 : (deep ? ROCK2 : ROCK);
                    if (Math.abs(d - 0.95) < 0.02 && Math.sin(x * 0.5) > 0.6) col = ICE;
                    v.add(x, y, z, col);
                }
            }
        }
    }

    // ---- купол: каркас + стекло ----
    function dome(v, cx, cy, cz, r, tall) {
        var h = tall ? r * 1.15 : r * 0.85;
        for (var y = 0; y <= h; y++) {
            var rr = r * Math.sqrt(Math.max(0, 1 - (y / h) * (y / h)));
            for (var a = 0; a < 72; a++) {
                var ang = a / 72 * Math.PI * 2;
                var x = Math.round(Math.cos(ang) * rr), z = Math.round(Math.sin(ang) * rr);
                // рёбра жёсткости каждые 6 секторов — металл, остальное стекло
                var rib = (a % 6 === 0 || a % 6 === 1);
                v.add(cx + x, cy + y, cz + z, rib ? METAL : GLASS_C);
            }
        }
        // основание и свет внутри
        for (var a2 = 0; a2 < 48; a2++) {
            var ang2 = a2 / 48 * Math.PI * 2;
            v.add(cx + Math.round(Math.cos(ang2) * r), cy, cz + Math.round(Math.sin(ang2) * r), PANEL);
        }
        for (var i = 0; i < 6; i++) {
            var ang3 = i / 6 * Math.PI * 2;
            v.add(cx + Math.round(Math.cos(ang3) * r * 0.45), cy + 1, cz + Math.round(Math.sin(ang3) * r * 0.45), LIGHT);
        }
        // верхний фонарь
        v.add(cx, cy + h, cz, LIGHT);
        v.add(cx, cy + h + 1, cz, METAL);
    }

    // ---- стеклянная труба между куполами (над поверхностью) ----
    function glassTube(v, x1, y1, z1, x2, y2, z2, rad) {
        var len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
        var steps = Math.ceil(len);
        for (var s = 0; s <= steps; s++) {
            var t = s / steps;
            var px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t, pz = z1 + (z2 - z1) * t;
            // дуга провисания
            var sag = Math.sin(t * Math.PI) * 1.6;
            py -= sag;
            for (var a = 0; a < 24; a++) {
                var ang = a / 24 * Math.PI * 2;
                var x = Math.round(px + Math.cos(ang) * rad);
                var y = Math.round(py + Math.sin(ang) * rad);
                // кольцо жёсткости каждые 5 блоков
                var rib = (s % 5 === 0);
                v.add(x, y, Math.round(pz), rib ? METAL : GLASS_C);
            }
            // дорожка и подсветка внутри
            if (s % 2 === 0) v.add(Math.round(px), Math.round(py - rad + 1), Math.round(pz), PANEL);
            if (s % 6 === 0) v.add(Math.round(px), Math.round(py + rad - 1), Math.round(pz), LIGHT);
        }
    }

    // ---- туннель под поверхностью (виден в разрезе) ----
    function tunnel(v, x1, y1, z1, x2, y2, z2, rad) {
        var len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
        var steps = Math.ceil(len);
        for (var s = 0; s <= steps; s++) {
            var t = s / steps;
            var px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t, pz = z1 + (z2 - z1) * t;
            for (var a = 0; a < 20; a++) {
                var ang = a / 20 * Math.PI * 2;
                var x = Math.round(px + Math.cos(ang) * rad);
                var y = Math.round(py + Math.sin(ang) * rad);
                v.add(x, y, Math.round(pz), a % 4 === 0 ? 0xc8d4dc : METAL);   // обделка
            }
            // освещение и пол
            if (s % 3 === 0) v.add(Math.round(px), Math.round(py + rad - 1), Math.round(pz), LIGHT);
            if (s % 3 === 0) v.add(Math.round(px) + 1, Math.round(py + rad - 1), Math.round(pz), LIGHT);
            v.add(Math.round(px), Math.round(py - rad), Math.round(pz), 0x3a4046);
        }
    }

    // ---- посадочная площадка и роверы ----
    function pad(v, cx, cy, cz) {
        for (var x = -5; x <= 5; x++) for (var z = -5; z <= 5; z++) {
            if (Math.hypot(x, z) > 5) continue;
            v.add(cx + x, cy, cz + z, (x + z) % 4 === 0 ? LIGHT : 0x4a5157);
        }
        for (var k = 0; k < 4; k++) {
            var ang = k / 4 * Math.PI * 2 + Math.PI / 4;
            v.add(cx + Math.round(Math.cos(ang) * 6), cy + 1, cz + Math.round(Math.sin(ang) * 6), LIGHT);
        }
        // ровер
        v.box(cx + 7, cy + 1, cz + 7, 3, 1, 2, 0xc8a86a);
        v.add(cx + 8, cy + 2, cz + 7, GLASS_C);
        v.add(cx + 8, cy + 2, cz + 8, GLASS_C);
    }

    // =====================================================================
    function open() {
        if (wrap) wrap.remove();
        wrap = document.createElement('div');
        wrap.id = 'ab-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9868;background:#05070c;' +
            'font:13px Inter,system-ui,sans-serif;color:#dce8f7';
        document.body.appendChild(wrap);

        import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.setSize(window.innerWidth, window.innerHeight);
            wrap.appendChild(renderer.domElement);

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x05070c);
            scene.add(new THREE.HemisphereLight(0xa8c4e0, 0x20181a, 0.65));
            var sun = new THREE.DirectionalLight(0xfff2dd, 1.25);
            sun.position.set(70, 60, 40);
            scene.add(sun);
            var fill = new THREE.DirectionalLight(0x6f8fb0, 0.4);
            fill.position.set(-60, -20, -50);
            scene.add(fill);

            // звёзды
            var starGeo = new THREE.BufferGeometry();
            var n = 900, pos = new Float32Array(n * 3);
            for (var i = 0; i < n; i++) {
                var r = 320 + Math.random() * 120;
                var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
                pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
                pos[i * 3 + 1] = r * Math.cos(ph);
                pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
            }
            starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false })));

            // ---- строим поселение ----
            var v = new Vox();
            var R = 16;
            asteroid(v, R);
            var rockKeys = {};
            Object.keys(v.m).forEach(function (k) { rockKeys[k] = true; });

            // купола на верхней части астероида
            var domes = [[-7, 10, 2, 7, false], [4, 11, -5, 8, true], [9, 9, 8, 6, false]];
            domes.forEach(function (d) { dome(v, d[0], d[1], d[2], d[3], d[4]); });

            // стеклянные дороги над поверхностью (идут по нижнему краю куполов)
            glassTube(v, -7, 9, 2, 4, 10, -5, 2.2);
            glassTube(v, 4, 10, -5, 9, 8, 8, 2.0);
            glassTube(v, 9, 8, 8, -7, 9, 2, 1.9);   // замыкаем кольцо

            // туннели под поверхностью (часть видна в разрезе справа)
            tunnel(v, -7, 8, 2, 4, 8, -5, 2.2);
            tunnel(v, 4, 8, -5, 9, 7, 8, 2.0);
            tunnel(v, 9, 7, 8, -7, 8, 2, 1.8);
            // порталы-входы
            [[-7, 10, 2], [4, 11, -5], [9, 9, 8]].forEach(function (c) {
                v.box(c[0] - 1, c[1] - 3, c[2] - 1, 3, 3, 3, METAL);
                v.add(c[0], c[1] - 2, c[2], LIGHT);
            });

            // разрезаем астероид: убираем блоки в секторе, чтобы увидеть туннели
            var cut = {};
            for (var key in v.m) {
                if (!rockKeys[key]) continue;          // режем только породу
                var p = key.split('|');
                var x = +p[0], y = +p[1], z = +p[2];
                if (z > 2 && x > -8 && y < 11 && y > -12) cut[key] = true;
            }
            // на срезе рисуем светлую кромку, чтобы читался разрез
            var edge = {};
            for (var key2 in cut) {
                var pp = key2.split('|');
                var x2 = +pp[0], y2 = +pp[1], z2 = +pp[2];
                if (z2 === 2 && v.m[(x2) + '|' + (y2) + '|' + (z2 + 1)]) edge[key2] = true;
            }
            Object.keys(cut).forEach(function (k) { delete v.m[k]; });
            Object.keys(edge).forEach(function (k) { v.m[k] = 0x8a857f; });

            pad(v, -2, 12, 12);

            blocks = Object.keys(v.m).length;
            scene.add(v.group(THREE, true));
            var glassG = v.group(THREE, false);
            scene.add(glassG);

            camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 1200);
            camera.position.set(52, 30, 58);
            camera.lookAt(0, 6, 0);

            // HUD
            var hud = document.createElement('div');
            hud.style.cssText = 'position:absolute;left:0;right:0;top:0;padding:12px 14px;z-index:3;' +
                'display:flex;gap:10px;align-items:center;flex-wrap:wrap;' +
                'background:linear-gradient(rgba(5,7,12,.92),rgba(5,7,12,0))';
            hud.innerHTML = '<b style="color:#9fe0ff;font-size:14px">☄️ Поселение на астероиде</b>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#161f28;' +
                'font:700 12px monospace">' + blocks + ' блоков</span>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#161f28;' +
                'font:700 12px monospace;color:#ffd05a">3 купола · 3 стеклянные трубы · 3 туннеля</span>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#161f28;' +
                'font:700 11.5px monospace">слева — разрез породы</span>';
            wrap.appendChild(hud);

            var nav = document.createElement('div');
            nav.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
                'display:flex;gap:8px;z-index:4';
            var spinBtn = document.createElement('button');
            spinBtn.textContent = '⟳ Вращение';
            spinBtn.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:linear-gradient(#9fe0ff,#3f93cc);color:#04223a';
            spinBtn.onclick = function () { spin = !spin; };
            nav.appendChild(spinBtn);

            var cutBtn = document.createElement('button');
            cutBtn.textContent = '✂ Разрез';
            cutBtn.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:#2b4a6e;color:#dce8f7';
            cutBtn.onclick = function () {
                // двигаем камеру внутрь разреза
                camera.position.set(6, 16, 30);
                camera.lookAt(0, 5, 0);
            };
            nav.appendChild(cutBtn);

            var close = document.createElement('button');
            close.textContent = '✕ Закрыть';
            close.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:#3b4348;color:#e6eaed';
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
                phi = Math.max(0.05, Math.min(1.4, phi - (e.clientY - py) * 0.004));
                px = e.clientX; py = e.clientY;
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 6, 0);
            });
            renderer.domElement.addEventListener('wheel', function (e) {
                e.preventDefault();
                radius = Math.max(25, Math.min(220, radius + e.deltaY * 0.12));
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 6, 0);
            }, { passive: false });

            var rotM = location.search.match(/[?&]rotate=(-?\d+)/);
            var zoomM = location.search.match(/[?&]zoom=(\d+)/);
            if (zoomM) radius = parseInt(zoomM[1], 10);
            if (rotM) {
                scene.rotation.y = parseFloat(rotM[1]) * Math.PI / 180;
                spin = false;
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
            }

            var last = performance.now();
            (function loop(now) {
                raf = requestAnimationFrame(loop);
                var dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                if (spin) scene.rotation.y += dt * 0.08;
                glassG.rotation.y = scene.rotation.y;
                glassG.rotation.x = scene.rotation.x;
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
        if (!box || document.getElementById('ab-btn')) return;
        var b = document.createElement('button');
        b.className = 'menu-btn';
        b.id = 'ab-btn';
        b.textContent = '☄️ Астероид: купола';
        b.setAttribute('data-tip', 'Астероид|Купола, стеклянные дороги и туннели');
        b.onclick = function () { open(); };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.AsteroidBase = { open: open };

    if (/[?&]asteroid=1/.test(location.search)) {
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
