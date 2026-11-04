// Система проектирования: параметрические детали → 3D-модель и векторный чертёж (SVG).
// Модель — JSON: { title, parts: [ {type, x,y,z, w,h,d, r, color, rot, label} ] }
// Детали: pad, slab, column, beam, truss, ring, tank, ladder, pipe, cable, antenna, gantry, rail, winch.
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    var THREE = null;
    var renderer = null, scene = null, camera = null;
    var wrap = null, canvas = null;
    var model = null;

    var COLORS = {
        concrete: 0x9aa0a4, steel: 0x8d979e, steel2: 0x6d777e, dark: 0x3a4046,
        yellow: 0xd8a41c, accent: 0x2f7fc4, green: 0x35c46b, red: 0xc9362b,
        glass: 0x8fd0ff, white: 0xd9dee1
    };

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
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

    // ---------- параметрические детали ----------
    function boxPart(p, color) {
        var g = new THREE.BoxGeometry(p.w || 1, p.h || 1, p.d || 1);
        return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: color }));
    }

    function cylPart(p, color) {
        var r = p.r || 0.5;
        var g = new THREE.CylinderGeometry(r, r, p.h || 1, p.seg || 12);
        return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: color }));
    }

    var BUILDERS = {
        pad: function (p) { return boxPart(p, COLORS.concrete); },
        slab: function (p) { return boxPart(p, COLORS.concrete); },
        column: function (p) { return boxPart(p, COLORS.steel); },
        beam: function (p) { return boxPart(p, COLORS.steel2); },
        truss: function (p) {
            var g = new THREE.Group();
            var len = p.w || 8, h = p.h || 1.2;
            var top = boxPart({ w: len, h: 0.25, d: 0.25 }, COLORS.steel2);
            top.position.y = h / 2;
            var bot = boxPart({ w: len, h: 0.25, d: 0.25 }, COLORS.steel2);
            bot.position.y = -h / 2;
            g.add(top, bot);
            var n = Math.max(2, Math.round(len / 1.2));
            for (var i = 0; i <= n; i++) {
                var x = -len / 2 + (len * i / n);
                var v = boxPart({ w: 0.16, h: h, d: 0.16 }, COLORS.steel2);
                v.position.x = x;
                g.add(v);
                if (i < n) {
                    var dg = boxPart({ w: Math.sqrt(Math.pow(len / n, 2) + h * h), h: 0.12, d: 0.12 }, COLORS.steel2);
                    dg.position.x = x + len / n / 2;
                    dg.rotation.z = (i % 2 ? 1 : -1) * Math.atan2(h, len / n);
                    g.add(dg);
                }
            }
            return g;
        },
        ring: function (p) {
            var g = new THREE.Group();
            var r = p.r || 6, steps = 24;
            for (var i = 0; i < steps; i++) {
                var a = i / steps * Math.PI * 2;
                var b = boxPart({ w: 0.5, h: 0.5, d: 0.5 }, p.color !== undefined ? p.color : COLORS.yellow);
                b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
                g.add(b);
            }
            return g;
        },
        tank: function (p) {
            var g = new THREE.Group();
            var body = cylPart({ r: p.r || 2, h: p.h || 6, seg: 18 }, COLORS.white);
            g.add(body);
            var cap = cylPart({ r: (p.r || 2) * 1.05, h: 0.4, seg: 18 }, COLORS.steel2);
            cap.position.y = (p.h || 6) / 2;
            g.add(cap);
            return g;
        },
        ladder: function (p) {
            var g = new THREE.Group();
            var h = p.h || 10;
            for (var s = -1; s <= 1; s += 2) {
                var rail = boxPart({ w: 0.12, h: h, d: 0.12 }, COLORS.yellow);
                rail.position.x = s * 0.35;
                g.add(rail);
            }
            for (var i = 0; i < h; i++) {
                var step = boxPart({ w: 0.8, h: 0.1, d: 0.1 }, COLORS.yellow);
                step.position.y = -h / 2 + i + 0.5;
                g.add(step);
            }
            return g;
        },
        pipe: function (p) {
            var g = new THREE.Group();
            var len = p.h || 4;
            var pipe = cylPart({ r: p.r || 0.3, h: len, seg: 10 }, COLORS.steel2);
            g.add(pipe);
            var flange = cylPart({ r: (p.r || 0.3) * 1.8, h: 0.2, seg: 10 }, COLORS.dark);
            flange.position.y = len / 2;
            g.add(flange);
            return g;
        },
        cable: function (p) {
            return boxPart({ w: p.w || 12, h: 0.16, d: 0.16 }, COLORS.dark);
        },
        antenna: function (p) {
            var g = new THREE.Group();
            var mast = cylPart({ r: 0.18, h: p.h || 8, seg: 8 }, COLORS.steel2);
            g.add(mast);
            for (var i = 0; i < 3; i++) {
                var ring = new THREE.Mesh(new THREE.TorusGeometry(p.r || 1.4, 0.08, 6, 16),
                    new THREE.MeshLambertMaterial({ color: COLORS.steel }));
                ring.rotation.x = Math.PI / 2;
                ring.position.y = -((p.h || 8) / 2) + 1.2 + i * 1.6;
                g.add(ring);
            }
            return g;
        },
        gantry: function (p) {
            var g = new THREE.Group();
            var w = p.w || 16, h = p.h || 10;
            var left = boxPart({ w: 0.6, h: h, d: 0.6 }, COLORS.yellow);
            left.position.set(-w / 2, 0, 0);
            var right = boxPart({ w: 0.6, h: h, d: 0.6 }, COLORS.yellow);
            right.position.set(w / 2, 0, 0);
            var top = boxPart({ w: w + 1, h: 0.6, d: 0.6 }, COLORS.yellow);
            top.position.y = h / 2;
            g.add(left, right, top);
            var trolley = boxPart({ w: 1.4, h: 0.7, d: 1.1 }, COLORS.dark);
            trolley.position.y = h / 2 - 0.7;
            g.add(trolley);
            var hook = boxPart({ w: 0.2, h: 2.4, d: 0.2 }, COLORS.dark);
            hook.position.y = h / 2 - 2.1;
            hook.position.x = (p.offset || 0);
            g.add(hook);
            return g;
        },
        rail: function (p) { return boxPart(p, COLORS.steel); },
        winch: function (p) {
            var g = new THREE.Group();
            g.add(boxPart({ w: 1.6, h: 1.1, d: 1.2 }, COLORS.dark));
            var drum = cylPart({ r: 0.5, h: 1.6, seg: 12 }, COLORS.steel2);
            drum.rotation.z = Math.PI / 2;
            drum.position.y = 0.7;
            g.add(drum);
            return g;
        }
    };

    // ---------- 3D ----------
    function buildScene(m) {
        var group = new THREE.Group();
        (m.parts || []).forEach(function (p) {
            var fn = BUILDERS[p.type];
            if (!fn) return;
            var obj = fn(p);
            var color = p.color !== undefined
                ? (typeof p.color === 'string' ? parseInt(p.color.replace('#', ''), 16) : p.color)
                : null;
            if (color !== null) {
                obj.traverse(function (n) {
                    if (n.isMesh) n.material = new THREE.MeshLambertMaterial({ color: color });
                });
            }
            obj.position.set(p.x || 0, p.y || 0, p.z || 0);
            if (p.rot) {
                if (p.rot[0]) obj.rotation.x = p.rot[0] * Math.PI / 180;
                if (p.rot[1]) obj.rotation.y = p.rot[1] * Math.PI / 180;
                if (p.rot[2]) obj.rotation.z = p.rot[2] * Math.PI / 180;
            }
            group.add(obj);
        });
        return group;
    }

    function open(modelData) {
        model = modelData || defaultModel();
        if (wrap) wrap.remove();
        wrap = el('div');
        wrap.id = 'design-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9860;background:#0a0e12;display:flex;flex-direction:column;' +
            'font:13px/1.4 Inter,system-ui,sans-serif;color:#dce8f7';

        var bar = el('div');
        bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:10px 12px;background:#151a1e;' +
            'border-bottom:2px solid #07090b;flex-wrap:wrap';
        bar.appendChild(el('b', null, '📐 Проектирование')).style.cssText = 'color:#8fd6ff;font-size:14px';

        var tab3d = el('button', null, '3D-модель');
        var tabDwg = el('button', null, 'Чертёж');
        [tab3d, tabDwg].forEach(function (b) {
            b.style.cssText = 'padding:6px 12px;border-radius:7px;border:2px solid #0a0d10;background:#2b3238;' +
                'color:#e6eaed;cursor:pointer;font-size:12px';
        });
        tab3d.style.background = '#2f7fc4';
        bar.appendChild(tab3d);
        bar.appendChild(tabDwg);

        var save = el('button', null, 'Сохранить модель');
        save.style.cssText = 'margin-left:auto;padding:6px 12px;border-radius:8px;border:none;cursor:pointer;' +
            'background:#2ecc71;color:#04121f;font-weight:700;font-size:12px';
        save.onclick = function () {
            api('/api/design/save', { title: model.title || 'Станция', model: model }).then(function (res) {
                if (!res || res.error) { toast(res && res.error ? res.error : 'не сохранилось'); return; }
                toast('Модель сохранена');
            });
        };
        bar.appendChild(save);

        var close = el('button', null, '✕');
        close.style.cssText = 'padding:6px 12px;border-radius:8px;border:none;cursor:pointer;background:#2b3238;color:#fff';
        close.onclick = function () { wrap.remove(); wrap = null; };
        bar.appendChild(close);

        var holder = el('div');
        holder.style.cssText = 'flex:1;position:relative;overflow:auto;background:#0d1216';
        wrap.appendChild(bar);
        wrap.appendChild(holder);
        document.body.appendChild(wrap);

        function show3d() {
            holder.innerHTML = '';
            import('/lib/three/three.module.js').then(function (T) {
                THREE = T;
                if (!renderer) {
                    renderer = new THREE.WebGLRenderer({ antialias: true });
                    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
                }
                scene = new THREE.Scene();
                scene.background = new THREE.Color(0x0d1216);
                scene.add(new THREE.HemisphereLight(0xffffff, 0x30363c, 1.15));
                var dir = new THREE.DirectionalLight(0xffffff, 0.85);
                dir.position.set(18, 30, 12);
                scene.add(dir);

                scene.add(buildScene(model));
                var grid = new THREE.GridHelper(60, 60, 0x263238, 0x1a2026);
                grid.position.y = -0.01;
                scene.add(grid);

                camera = new THREE.PerspectiveCamera(45, holder.clientWidth / Math.max(1, holder.clientHeight), 0.1, 500);
                camera.position.set(62, 46, 74);
                camera.lookAt(0, 20, 0);

                renderer.setSize(holder.clientWidth, holder.clientHeight);
                holder.appendChild(renderer.domElement);
                canvas = renderer.domElement;
                orbit(canvas, camera, new THREE.Vector3(0, 8, 0));
                animate();
            });
        }

        function showDwg() {
            holder.innerHTML = '';
            holder.style.background = '#f6f4ef';
            var svg = blueprint(model);
            holder.innerHTML = svg;
        }

        tab3d.onclick = function () { tab3d.style.background = '#2f7fc4'; tabDwg.style.background = '#2b3238'; show3d(); };
        tabDwg.onclick = function () { tabDwg.style.background = '#2f7fc4'; tab3d.style.background = '#2b3238'; showDwg(); };

        if (/[?&]tab=dwg/.test(location.search)) tabDwg.onclick(); else show3d();
    }

    function orbit(canvasEl, cam, target) {
        var dragging = false, px = 0, py = 0;
        var theta = Math.atan2(cam.position.x, cam.position.z);
        var radius = cam.position.length();
        var phi = Math.acos(cam.position.y / radius);
        canvasEl.addEventListener('pointerdown', function (e) { dragging = true; px = e.clientX; py = e.clientY; });
        window.addEventListener('pointerup', function () { dragging = false; });
        window.addEventListener('pointermove', function (e) {
            if (!dragging || !cam) return;
            theta -= (e.clientX - px) * 0.008;
            phi = Math.max(0.15, Math.min(1.45, phi - (e.clientY - py) * 0.006));
            px = e.clientX; py = e.clientY;
            cam.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.cos(theta));
            cam.lookAt(target);
        });
        canvasEl.addEventListener('wheel', function (e) {
            e.preventDefault();
            radius = Math.max(8, Math.min(160, radius + e.deltaY * 0.05));
            cam.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.cos(theta));
            cam.lookAt(target);
        }, { passive: false });
    }

    function animate() {
        if (!renderer || !scene || !camera) return;
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    // ---------- векторный чертёж ----------
    function bounds(m) {
        var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
        (m.parts || []).forEach(function (p) {
            var w = p.w || (p.r ? p.r * 2 : 1);
            var h = p.h || 1;
            var d = p.d || (p.r ? p.r * 2 : 1);
            minX = Math.min(minX, (p.x || 0) - w / 2); maxX = Math.max(maxX, (p.x || 0) + w / 2);
            minY = Math.min(minY, (p.y || 0) - h / 2); maxY = Math.max(maxY, (p.y || 0) + h / 2);
            minZ = Math.min(minZ, (p.z || 0) - d / 2); maxZ = Math.max(maxZ, (p.z || 0) + d / 2);
        });
        return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ };
    }

    function rectPart(p) {
        var w = p.w || (p.r ? p.r * 2 : 1);
        var h = p.h || (p.r ? p.r * 2 : 1);
        var d = p.d || (p.r ? p.r * 2 : 1);
        return { x: p.x || 0, y: p.y || 0, z: p.z || 0, w: w, h: h, d: d, t: p.type };
    }

    function blueprint(m) {
        var b = bounds(m);
        var W = 1180, H = 780, M = 44;

        var bw = Math.max(1, b.maxX - b.minX);
        var bh = Math.max(1, b.maxY - b.minY);
        var bd = Math.max(1, b.maxZ - b.minZ);

        // панели листа
        var A = { x: M, y: 64, w: 700, h: 372 };        // вид сбоку
        var B = { x: M, y: 470, w: 700, h: 216 };       // вид сверху
        var C = { x: W - 392, y: 470, w: 348, h: 240 }; // штамп
        var D = { x: M, y: 706, w: 380, h: 44 };        // легенда

        var sSide = Math.min((A.w - 150) / bw, (A.h - 70) / bh);
        var sTop = Math.min((B.w - 120) / bw, (B.h - 70) / (bd * 0.6));

        function px(x) { return A.x + 70 + (x - b.minX) * sSide; }
        function py(y) { return A.y + A.h - 34 - (y - b.minY) * sSide; }
        function tx(x) { return B.x + 60 + (x - b.minX) * sTop; }
        function tz(z) { return B.y + B.h - 30 - (z - b.minZ) * sTop * 0.6; }

        var out = [];
        out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" ' +
            'font-family="Inter, Segoe UI, sans-serif">');
        out.push('<defs><pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
            '<line x1="0" y1="0" x2="0" y2="6" stroke="#8f9599" stroke-width="1"/></pattern>' +
            '<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">' +
            '<path d="M20 0H0V20" fill="none" stroke="#e6e2d8" stroke-width="0.7"/></pattern></defs>');
        out.push('<rect width="' + W + '" height="' + H + '" fill="#f7f5f0"/>');
        out.push('<rect width="' + W + '" height="' + H + '" fill="url(#grid)"/>');
        out.push('<rect x="14" y="14" width="' + (W - 28) + '" height="' + (H - 28) + '" fill="none" stroke="#2b3238" stroke-width="2"/>');

        // ---- вид сбоку ----
        out.push('<text x="' + A.x + '" y="' + (A.y - 12) + '" font-size="12" font-weight="700" fill="#22303a" ' +
            'letter-spacing="1">ВИД СБОКУ (X–Y)</text>');
        out.push('<line x1="' + A.x + '" y1="' + (A.y + A.h - 34) + '" x2="' + (A.x + A.w - 30) + '" y2="' +
            (A.y + A.h - 34) + '" stroke="#7d8489" stroke-width="1.6"/>');
        (m.parts || []).forEach(function (p) {
            var r = rectPart(p);
            var x = px(r.x - r.w / 2);
            var y = py(r.y + r.h / 2);
            var w = Math.max(1.2, r.w * sSide);
            var h = Math.max(1.2, r.h * sSide);
            var fill = (p.type === 'pad' || p.type === 'slab') ? 'url(#hatch)'
                : p.type === 'gantry' ? '#ffe9a8'
                : p.type === 'truss' ? '#dfe4e7'
                : p.type === 'ring' ? '#ffd05a'
                : '#cfd6da';
            out.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) +
                '" height="' + h.toFixed(1) + '" fill="' + fill + '" stroke="#2b3238" stroke-width="0.9"/>');
        });

        // осевая и размеры
        var cx = A.x + 70 + (0 - b.minX) * sSide;
        out.push('<line x1="' + cx + '" y1="' + (A.y + 20) + '" x2="' + cx + '" y2="' + (A.y + A.h - 34) +
            '" stroke="#2f7fc4" stroke-width="0.6" stroke-dasharray="10 4 2 4" opacity="0.5"/>');

        var dimX = A.x + A.w - 42;
        out.push('<line x1="' + dimX + '" y1="' + py(b.minY) + '" x2="' + dimX + '" y2="' + py(b.maxY) +
            '" stroke="#2f7fc4" stroke-width="1"/>');
        out.push('<line x1="' + (dimX - 6) + '" y1="' + py(b.minY) + '" x2="' + (dimX + 6) + '" y2="' + py(b.minY) +
            '" stroke="#2f7fc4"/>');
        out.push('<line x1="' + (dimX - 6) + '" y1="' + py(b.maxY) + '" x2="' + (dimX + 6) + '" y2="' + py(b.maxY) +
            '" stroke="#2f7fc4"/>');
        var midY = (py(b.minY) + py(b.maxY)) / 2;
        out.push('<text x="' + (dimX - 8) + '" y="' + midY + '" font-size="11" fill="#2f7fc4" text-anchor="middle" ' +
            'transform="rotate(-90 ' + (dimX - 8) + ' ' + midY + ')">H = ' + (b.maxY - b.minY).toFixed(1) + ' м</text>');

        // горизонтальный размер основания
        var dimY = A.y + A.h - 18;
        out.push('<line x1="' + px(b.minX) + '" y1="' + dimY + '" x2="' + px(b.maxX) + '" y2="' + dimY +
            '" stroke="#2f7fc4" stroke-width="1"/>');
        out.push('<text x="' + ((px(b.minX) + px(b.maxX)) / 2) + '" y="' + (dimY - 5) +
            '" font-size="11" fill="#2f7fc4" text-anchor="middle">L = ' + bw.toFixed(1) + ' м</text>');

        // ---- вид сверху ----
        out.push('<text x="' + B.x + '" y="' + (B.y - 12) + '" font-size="12" font-weight="700" fill="#22303a" ' +
            'letter-spacing="1">ВИД СВЕРХУ (X–Z)</text>');
        out.push('<line x1="' + B.x + '" y1="' + (B.y + B.h - 30) + '" x2="' + (B.x + B.w - 30) + '" y2="' +
            (B.y + B.h - 30) + '" stroke="#7d8489" stroke-width="1.4"/>');
        (m.parts || []).forEach(function (p) {
            var r = rectPart(p);
            var cx2 = tx(r.x);
            var cz2 = tz(r.z);
            var w = Math.max(2, r.w * sTop);
            var d = Math.max(2, r.d * sTop * 0.6);
            var fill = p.type === 'ring' ? 'none' : p.type === 'pad' ? 'url(#hatch)' : '#dfe4e7';
            var stroke = p.type === 'ring' ? '#d8a41c' : '#2b3238';
            out.push('<ellipse cx="' + cx2.toFixed(1) + '" cy="' + cz2.toFixed(1) + '" rx="' + (w / 2).toFixed(1) +
                '" ry="' + (d / 2).toFixed(1) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="0.9"/>');
        });
        out.push('<line x1="' + tx(b.minX) + '" y1="' + (B.y + B.h - 12) + '" x2="' + tx(b.maxX) + '" y2="' +
            (B.y + B.h - 12) + '" stroke="#2f7fc4" stroke-width="1"/>');
        out.push('<text x="' + ((tx(b.minX) + tx(b.maxX)) / 2) + '" y="' + (B.y + B.h - 2) +
            '" font-size="11" fill="#2f7fc4" text-anchor="middle">' + bw.toFixed(1) + ' м</text>');

        // ---- штамп ----
        out.push('<rect x="' + C.x + '" y="' + C.y + '" width="' + C.w + '" height="' + C.h + '" fill="#fff" ' +
            'stroke="#2b3238" stroke-width="1.6"/>');
        var rows = [C.y + 34, C.y + 78, C.y + 122, C.y + 166, C.y + 200];
        rows.forEach(function (y) {
            out.push('<line x1="' + C.x + '" y1="' + y + '" x2="' + (C.x + C.w) + '" y2="' + y + '" stroke="#2b3238" stroke-width="0.8"/>');
        });
        out.push('<text x="' + (C.x + 12) + '" y="' + (C.y + 22) + '" font-size="13" font-weight="700">' +
            (m.title || 'Гравитационная платформа') + '</text>');
        out.push('<text x="' + (C.x + 12) + '" y="' + (C.y + 56) + '" font-size="11">Лист 1 из 1 · стадия П · масштаб 1:' +
            Math.max(1, Math.round(1 / sSide * 100)) + '</text>');
        out.push('<text x="' + (C.x + 12) + '" y="' + (C.y + 98) + '" font-size="11">Габариты: ' + bw.toFixed(1) +
            ' × ' + bd.toFixed(1) + ' × ' + bh.toFixed(1) + ' м</text>');
        out.push('<text x="' + (C.x + 12) + '" y="' + (C.y + 140) + '" font-size="11">Деталей: ' + (m.parts || []).length +
            '</text>');
        out.push('<text x="' + (C.x + 12) + '" y="' + (C.y + 182) + '" font-size="11">Система: каркас, кран, трубопроводы, кабельные трассы</text>');
        out.push('<text x="' + (C.x + 12) + '" y="' + (C.y + 222) + '" font-size="11">Проект «Галактика» · ab@btema.ru</text>');

        // ---- легенда и примечания ----
        out.push('<text x="' + D.x + '" y="' + (D.y - 6) + '" font-size="11" font-weight="700" fill="#22303a">Слои</text>');
        var legend = [['#cfd6da', 'каркас'], ['#ffe9a8', 'кран'], ['url(#hatch)', 'бетон']];
        legend.forEach(function (l, i) {
            var x = D.x + i * 96;
            var y = D.y + 8;
            out.push('<rect x="' + x + '" y="' + (y - 11) + '" width="15" height="11" fill="' + l[0] + '" stroke="#2b3238" stroke-width="0.8"/>');
            out.push('<text x="' + (x + 20) + '" y="' + y + '" font-size="10.5">' + l[1] + '</text>');
        });

        // примечания
        var notes = ['1. Фундамент: 4 сваи 2×2 м, плита 26×26×1 м.',
                     '2. Каркас: 4 колонны 34 м, связи через 8 м.',
                     '3. Кран: пролёт 20 м, высота 12 м.',
                     '4. Шахта лифта 34 м, кольцевые площадки на 10/18/26 м.'];
        out.push('<text x="' + (D.x + 330) + '" y="' + (D.y - 6) + '" font-size="11" font-weight="700" fill="#22303a">Примечания</text>');
        notes.forEach(function (n, i) {
            out.push('<text x="' + (D.x + 330) + '" y="' + (D.y + 8 + i * 13) + '" font-size="9.5" fill="#3a434a">' + n + '</text>');
        });

        out.push('</svg>');
        return out.join('');
    }

    // ---------- модель по умолчанию: гравитационная платформа ----------
    function defaultModel() {
        var parts = [];
        // фундамент: 4 сваи + плита
        [[-9, -9], [9, -9], [-9, 9], [9, 9]].forEach(function (c) {
            parts.push({ type: 'column', x: c[0], y: 1.5, z: c[1], w: 2, h: 3, d: 2 });
        });
        parts.push({ type: 'pad', x: 0, y: 0, z: 0, w: 26, h: 1, d: 26, label: 'фундаментная плита' });

        // несущий каркас: 4 колонны по 34 м
        [[-8, -8], [8, -8], [-8, 8], [8, 8]].forEach(function (c) {
            parts.push({ type: 'column', x: c[0], y: 18, z: c[1], w: 1.6, h: 34, d: 1.6 });
        });

        // балки-связи по высотам
        [8, 16, 24, 34].forEach(function (y) {
            parts.push({ type: 'beam', x: 0, y: y, z: -8, w: 16.5, h: 0.7, d: 0.7 });
            parts.push({ type: 'beam', x: 0, y: y, z: 8, w: 16.5, h: 0.7, d: 0.7 });
            parts.push({ type: 'beam', x: -8, y: y, z: 0, w: 0.7, h: 0.7, d: 16.5 });
            parts.push({ type: 'beam', x: 8, y: y, z: 0, w: 0.7, h: 0.7, d: 16.5 });
        });

        // фермы-раскосы
        parts.push({ type: 'truss', x: 0, y: 12, z: -8, w: 16, h: 1.4, d: 0.6 });
        parts.push({ type: 'truss', x: 0, y: 26, z: 8, w: 16, h: 1.4, d: 0.6 });

        // шахта лифта
        parts.push({ type: 'column', x: 0, y: 18, z: 0, w: 3, h: 34, d: 3 });
        parts.push({ type: 'ladder', x: 2.2, y: 18, z: 0, h: 34 });

        // кольцевые площадки
        [10, 18, 26].forEach(function (y, i) {
            parts.push({ type: 'ring', x: 0, y: y, z: 0, r: 5 + i * 0.6, color: 0xd8a41c });
        });

        // верхняя платформа
        parts.push({ type: 'slab', x: 0, y: 36, z: 0, w: 14, h: 1, d: 14 });
        parts.push({ type: 'ring', x: 0, y: 37, z: 0, r: 6.5, color: 0xffd05a });

        // крановое оборудование
        parts.push({ type: 'gantry', x: 0, y: 44, z: 0, w: 20, h: 12 });
        parts.push({ type: 'winch', x: 0, y: 38.5, z: 0 });

        // технологические трубопроводы
        parts.push({ type: 'pipe', x: 4.5, y: 12, z: 4.5, r: 0.45, h: 24 });
        parts.push({ type: 'pipe', x: -4.5, y: 12, z: 4.5, r: 0.3, h: 24 });

        // резервуары и кабельные трассы
        parts.push({ type: 'tank', x: 11, y: 4, z: -6, r: 2.2, h: 7 });
        parts.push({ type: 'tank', x: 11, y: 4, z: 0, r: 2.2, h: 7 });
        parts.push({ type: 'cable', x: 0, y: 30, z: -8, w: 16, h: 0.2, d: 0.2 });

        // антенна и площадка обслуживания
        parts.push({ type: 'antenna', x: -9, y: 40, z: -9, h: 8, r: 1.2 });
        parts.push({ type: 'rail', x: 0, y: 37.6, z: 7, w: 12, h: 0.3, d: 0.3 });

        return { title: 'Гравитационная платформа «Галактика-1»', parts: parts };
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('design-btn')) return;
        var b = el('button', 'menu-btn', '📐 Проектирование');
        b.id = 'design-btn';
        b.setAttribute('data-tip', 'Проектирование|Параметрическая 3D-модель и векторный чертёж');
        b.onclick = function () {
            api('/api/design/load', null, 'GET').then(function (res) {
                open((res && res.model) ? res.model : defaultModel());
            });
        };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Design3D = { open: open, blueprint: blueprint, model: defaultModel };

    if (/[?&]design=1/.test(location.search)) {
        setTimeout(function () {
            ['welcome-screen', 'auth-overlay', 'legend-overlay', 'tut-modal'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
            open(defaultModel());
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
