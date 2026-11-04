// Стартовая площадка гравитационной платформы: текстура бетона/реголита,
// цикл «старт → посадка».  ?pad=earth | ?pad=moon  ·  &sim=N — сдвиг анимации
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    var THREE = null, renderer = null, scene = null, camera = null, wrap = null;
    var world = 'earth', raf = 0, time = 0, simOffset = 0;
    var plat = null, plume = null, dust = [], lamps = [], padMesh = null;

    var WORLDS = {
        earth: {
            name: 'Земля', sky: 0x9fc0da, fog: 0xa9c6dd, fogNear: 70, fogFar: 260,
            ground: 0x4f7a3a, ground2: 0x5b8a42, padBase: '#9aa0a4', padDark: '#7d8489',
            paint: '#e8c14a', paint2: '#f2f6f8', dustColor: 0xbfae8c, stars: false
        },
        moon: {
            name: 'Луна', sky: 0x05070a, fog: 0x0c1014, fogNear: 60, fogFar: 220,
            ground: 0x8d9196, ground2: 0x7c8085, padBase: '#8d9196', padDark: '#6f7478',
            paint: '#d8e8f4', paint2: '#eef6fb', dustColor: 0xb8bcc0, stars: true
        }
    };

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    // ---------- текстура площадки ----------
    function padTexture(p) {
        var S = 1024;
        var cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        var g = cv.getContext('2d');

        // основа
        g.fillStyle = p.padBase;
        g.fillRect(0, 0, S, S);

        // плиты: сетка швов
        var tiles = 8, step = S / tiles;
        g.strokeStyle = p.padDark;
        g.lineWidth = 3;
        for (var i = 0; i <= tiles; i++) {
            g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, S); g.stroke();
            g.beginPath(); g.moveTo(0, i * step); g.lineTo(S, i * step); g.stroke();
        }

        // неровности и выбоины
        for (var k = 0; k < 1400; k++) {
            var x = Math.random() * S, y = Math.random() * S;
            var a = 0.03 + Math.random() * 0.07;
            g.fillStyle = 'rgba(20,24,28,' + a.toFixed(3) + ')';
            var r = 1 + Math.random() * 4;
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
        // для Луны — кратеры
        if (world === 'moon') {
            for (var c = 0; c < 40; c++) {
                var cx = Math.random() * S, cy = Math.random() * S;
                var cr = 6 + Math.random() * 26;
                g.fillStyle = 'rgba(30,34,38,0.18)';
                g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fill();
                g.strokeStyle = 'rgba(230,240,248,0.18)';
                g.lineWidth = 2;
                g.beginPath(); g.arc(cx, cy, cr * 0.85, 0, Math.PI * 2); g.stroke();
            }
        }

        // кольцо посадки
        var cx0 = S / 2, cy0 = S / 2;
        g.strokeStyle = p.paint;
        g.lineWidth = 18;
        g.beginPath(); g.arc(cx0, cy0, S * 0.39, 0, Math.PI * 2); g.stroke();
        g.lineWidth = 8;
        g.beginPath(); g.arc(cx0, cy0, S * 0.30, 0, Math.PI * 2); g.stroke();

        // штрихи-секторы на кольце
        for (var s2 = 0; s2 < 24; s2++) {
            var a2 = s2 / 24 * Math.PI * 2;
            g.strokeStyle = p.paint2;
            g.lineWidth = 6;
            g.beginPath();
            g.moveTo(cx0 + Math.cos(a2) * S * 0.40, cy0 + Math.sin(a2) * S * 0.40);
            g.lineTo(cx0 + Math.cos(a2) * S * 0.45, cy0 + Math.sin(a2) * S * 0.45);
            g.stroke();
        }

        // перекрестие
        g.strokeStyle = p.paint2;
        g.lineWidth = 10;
        g.beginPath(); g.moveTo(cx0 - S * 0.12, cy0); g.lineTo(cx0 + S * 0.12, cy0); g.stroke();
        g.beginPath(); g.moveTo(cx0, cy0 - S * 0.12); g.lineTo(cx0, cy0 + S * 0.12); g.stroke();
        g.lineWidth = 4;
        g.beginPath(); g.arc(cx0, cy0, S * 0.12, 0, Math.PI * 2); g.stroke();

        // уголки-указатели
        [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]].forEach(function (c2) {
            g.strokeStyle = p.paint;
            g.lineWidth = 12;
            var x0 = c2[0] * S, y0 = c2[1] * S, L = 70, dx = c2[0] < 0.5 ? 1 : -1, dy = c2[1] < 0.5 ? 1 : -1;
            g.beginPath(); g.moveTo(x0, y0 + dy * L); g.lineTo(x0, y0); g.lineTo(x0 + dx * L, y0); g.stroke();
        });

        // номер площадки и надпись
        g.fillStyle = p.paint;
        g.font = 'bold 120px Inter, Arial';
        g.textAlign = 'center';
        g.fillText('01', cx0, S * 0.20);
        g.font = 'bold 44px Inter, Arial';
        g.fillStyle = p.paint2;
        g.fillText(world === 'moon' ? 'ЛУНА · ПЛОЩАДКА A' : 'ЗЕМЛЯ · ПЛОЩАДКА A', cx0, S * 0.84);

        // следы техники
        if (world === 'earth') {
            g.strokeStyle = 'rgba(30,34,38,0.25)';
            g.lineWidth = 14;
            [-0.2, 0.2].forEach(function (o) {
                g.beginPath();
                g.moveTo(cx0 + o * S, 0);
                g.quadraticCurveTo(cx0 + o * S * 1.4, S * 0.5, cx0 + o * S, S);
                g.stroke();
            });
        }

        var tex = new THREE.CanvasTexture(cv);
        tex.anisotropy = 4;
        return tex;
    }

    // ---------- сцена ----------
    function ground() {
        var g = new THREE.Group();
        var p = WORLDS[world];
        for (var x = -60; x < 60; x += 2) {
            for (var z = -60; z < 60; z += 2) {
                if (x * x + z * z > 58 * 58) continue;
                var c = ((Math.abs(x + z) / 2) | 0) % 2 ? p.ground : p.ground2;
                var tile = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 2),
                    new THREE.MeshLambertMaterial({ color: c }));
                tile.position.set(x + 1, -0.2, z + 1);
                tile.receiveShadow = true;
                g.add(tile);
            }
        }
        return g;
    }

    function padGroup() {
        var g = new THREE.Group();
        var p = WORLDS[world];
        // сама площадка с текстурой
        var geo = new THREE.CircleGeometry(22, 64);
        var mat = new THREE.MeshLambertMaterial({ map: padTexture(p) });
        padMesh = new THREE.Mesh(geo, mat);
        padMesh.rotation.x = -Math.PI / 2;
        padMesh.position.y = 0.06;
        padMesh.receiveShadow = true;
        g.add(padMesh);

        // бетонный бортик
        for (var a = 0; a < 64; a++) {
            var ang = a / 64 * Math.PI * 2;
            var bx2 = Math.cos(ang) * 22.6, bz2 = Math.sin(ang) * 22.6;
            var curb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1),
                new THREE.MeshLambertMaterial({ color: world === 'earth' ? 0xb8bec2 : 0x9aa0a4 }));
            curb.position.set(bx2, 0.25, bz2);
            curb.rotation.y = -ang;
            g.add(curb);
        }

        // огни по кольцу
        for (var L = 0; L < 16; L++) {
            var la = L / 16 * Math.PI * 2;
            var lx = Math.cos(la) * 24.5, lz = Math.sin(la) * 24.5;
            var post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3),
                new THREE.MeshLambertMaterial({ color: 0x3a4046 }));
            post.position.set(lx, 0.6, lz);
            g.add(post);
            var lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7),
                new THREE.MeshLambertMaterial({
                    color: 0xffe0a8, emissive: new THREE.Color(0xffe0a8), emissiveIntensity: 1
                }));
            lamp.position.set(lx, 1.4, lz);
            g.add(lamp);
            lamps.push(lamp);
        }
        return g;
    }

    // платформа: основание, шахта, кольца, верхняя тарелка
    function platformMesh() {
        var g = new THREE.Group();
        var steel = new THREE.MeshLambertMaterial({ color: 0x8d979e });
        var dark = new THREE.MeshLambertMaterial({ color: 0x3a4046 });
        var yellow = new THREE.MeshLambertMaterial({ color: 0xd8a41c });

        var base = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 9), dark);
        base.position.y = 0.9;
        g.add(base);

        for (var i = 0; i < 4; i++) {
            var leg = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 1), steel);
            leg.position.set(i < 2 ? -3.4 : 3.4, 4.4, i % 2 ? 3.4 : -3.4);
            g.add(leg);
        }
        var shaft = new THREE.Mesh(new THREE.BoxGeometry(3.4, 16, 3.4), steel);
        shaft.position.y = 9;
        g.add(shaft);
        // кольца
        [5, 9, 13, 17].forEach(function (y) {
            var ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.22, 6, 20), yellow);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = y;
            g.add(ring);
        });
        // верхняя тарелка
        var top = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.4, 1, 16), steel);
        top.position.y = 18;
        g.add(top);
        var beacon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6),
            new THREE.MeshLambertMaterial({ color: 0xff4a3a, emissive: new THREE.Color(0xff4a3a), emissiveIntensity: 1 }));
        beacon.position.y = 18.8;
        g.add(beacon);
        // сопла
        for (var n = 0; n < 4; n++) {
            var na = n / 4 * Math.PI * 2;
            var noz = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 1.2, 12), dark);
            noz.position.set(Math.cos(na) * 2.2, 0.6, Math.sin(na) * 2.2);
            g.add(noz);
        }
        g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return g;
    }

    function plumeMesh() {
        var g = new THREE.Group();
        var core = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 16, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0x9fd8ff, transparent: true, opacity: 0.85,
                blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
            }));
        core.rotation.x = Math.PI;
        core.position.y = 3;
        g.add(core);
        var glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12),
            new THREE.MeshBasicMaterial({
                color: 0xcfe8ff, transparent: true, opacity: 0.7,
                blending: THREE.AdditiveBlending, depthWrite: false
            }));
        glow.position.y = 0.4;
        g.add(glow);
        g.position.y = 0.2;
        return g;
    }

    function dustRing() {
        var g = new THREE.Group();
        var p = WORLDS[world];
        for (var i = 0; i < 22; i++) {
            var a = i / 22 * Math.PI * 2;
            var m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4),
                new THREE.MeshLambertMaterial({ color: p.dustColor, transparent: true, opacity: 0 }));
            m.userData.ang = a;
            dust.push(m);
            g.add(m);
        }
        g.position.y = 0.6;
        return g;
    }

    function stars() {
        var geo = new THREE.BufferGeometry();
        var n = 600, pos = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
            var r = 220 + Math.random() * 80;
            var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
            pos[i * 3 + 1] = Math.abs(r * Math.cos(ph));
            pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false
        }));
    }

    // ---------- цикл анимации ----------
    // 0–2 с: зажигание, 2–9 с: подъём, 9–11 с: ушла, 11–18 с: спуск, 18–21 с: пыль, 21–26 с: покой
    var CYCLE = 26;

    function platformState(t) {
        t = t % CYCLE;
        if (t < 2) return { y: 0, phase: 'ignition', power: t / 2 };
        if (t < 9) {
            var k = (t - 2) / 7;
            return { y: Math.pow(k, 1.8) * 120, phase: 'ascent', power: 1 };
        }
        if (t < 11) return { y: 120, phase: 'gone', power: 0.2 };
        if (t < 18) {
            var k2 = (t - 11) / 7;
            return { y: 120 * (1 - Math.pow(k2, 0.8)), phase: 'descent', power: 0.9 };
        }
        if (t < 21) return { y: 0, phase: 'landed', power: Math.max(0, 1 - (t - 18) / 3) };
        return { y: 0, phase: 'idle', power: 0 };
    }

    function updateScene(dt) {
        time += dt;
        var st = platformState(time + simOffset);
        if (plat) {
            plat.position.y = st.y;
            plat.position.x = 0;
            plat.position.z = 0;
        }
        if (plume) {
            plume.visible = st.power > 0.05 && st.phase !== 'gone';
            plume.scale.set(1, 0.6 + st.power * 1.4, 1);
            plume.position.y = plat ? plat.position.y + 0.2 : 0.2;
            plume.children.forEach(function (c) {
                if (c.material) c.material.opacity = (c.material.opacity > 0.75 ? 0.85 : 0.7) * st.power;
            });
        }
        // пыль при посадке
        var dustK = (st.phase === 'landed') ? Math.min(1, (time % CYCLE - 18) / 1.2) : 0;
        dust.forEach(function (m) {
            var r = 6 + dustK * 22;
            m.position.set(Math.cos(m.userData.ang) * r, dustK * 2.2, Math.sin(m.userData.ang) * r);
            m.material.opacity = dustK * 0.65;
            m.scale.setScalar(1 + dustK * 1.6);
        });
        // мигание огней площадки
        var on = Math.sin(time * 3) > 0;
        lamps.forEach(function (l, i) {
            l.material.emissiveIntensity = ((i % 2 === 0) === on) ? 1.2 : 0.15;
        });
        hudUpdate(st);
    }

    function hudUpdate(st) {
        var lab = document.getElementById('pad-phase');
        if (lab) {
            var names = {
                ignition: '🔥 ЗАЖИГАНИЕ', ascent: '🚀 ПОДЪЁМ', gone: '🌌 УШЛА НА ОРБИТУ',
                descent: '⬇ СПУСК', landed: '💨 ПОСАДКА · ПЫЛЬ', idle: '⏸ ГОТОВА К СТАРТУ'
            };
            lab.textContent = names[st.phase] || st.phase;
        }
        var alt = document.getElementById('pad-alt');
        if (alt) alt.textContent = Math.round(st.y * 5) + ' м';
        var bar = document.getElementById('pad-bar');
        if (bar) bar.style.width = Math.min(100, (st.y / 120) * 100) + '%';
    }

    function open(initialWorld) {
        world = initialWorld || world;
        if (wrap) wrap.remove();
        wrap = el('div');
        wrap.id = 'pad-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9875;background:#070b0e;' +
            'font:13px Inter,system-ui,sans-serif;color:#dce8f7';
        document.body.appendChild(wrap);

        import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.shadowMap.enabled = true;
            renderer.setSize(window.innerWidth, window.innerHeight);
            wrap.appendChild(renderer.domElement);

            scene = new THREE.Scene();
            var p = WORLDS[world];
            scene.background = new THREE.Color(p.sky);
            scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x2b3136, world === 'moon' ? 0.7 : 0.9));
            var dir = new THREE.DirectionalLight(0xfff4e0, world === 'moon' ? 1.3 : 0.95);
            dir.position.set(30, 50, 20);
            dir.castShadow = true;
            dir.shadow.mapSize.set(1024, 1024);
            dir.shadow.camera.left = -50; dir.shadow.camera.right = 50;
            dir.shadow.camera.top = 50; dir.shadow.camera.bottom = -50;
            scene.add(dir);
            if (p.stars) scene.add(stars());

            scene.add(ground());
            scene.add(padGroup());
            plat = platformMesh();
            scene.add(plat);
            plume = plumeMesh();
            scene.add(plume);
            scene.add(dustRing());

            camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
            camera.position.set(34, 16, 40);
            camera.lookAt(0, 10, 0);

            // HUD
            var hud = el('div');
            hud.style.cssText = 'position:absolute;left:0;right:0;top:0;display:flex;gap:10px;align-items:center;' +
                'padding:12px 14px;background:linear-gradient(rgba(7,11,14,.9),rgba(7,11,14,0));z-index:3;flex-wrap:wrap';
            hud.innerHTML = '<b style="color:#8fd6ff;font-size:14px">🚀 СТАРТ И ПОСАДКА</b>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#23262a;' +
                'font:700 12px monospace">площадка: ' + p.name + '</span>' +
                '<span id="pad-phase" style="padding:5px 10px;border:2px solid #101214;border-radius:6px;' +
                'background:#23262a;font:700 12px monospace;color:#ffd05a">готовность</span>' +
                '<span id="pad-alt" style="padding:5px 10px;border:2px solid #101214;border-radius:6px;' +
                'background:#23262a;font:700 12px monospace">0 м</span>' +
                '<span style="flex:1;min-width:90px;height:12px;border:2px solid #101214;border-radius:3px;' +
                'background:#1a1d20;overflow:hidden"><i id="pad-bar" style="display:block;height:100%;width:0;' +
                'background:linear-gradient(90deg,#3ec97a,#ffd05a);transition:width .2s"></i></span>';
            wrap.appendChild(hud);

            var nav = el('div');
            nav.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
                'display:flex;gap:8px;z-index:4';
            [['earth', '🌍 Земля'], ['moon', '🌕 Луна']].forEach(function (w) {
                var b = el('button', null, w[1]);
                b.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                    'font:800 13px Inter,system-ui,sans-serif;box-shadow:0 4px 0 #101214;' +
                    (w[0] === world ? 'background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00'
                        : 'background:#2b3238;color:#e6eaed');
                b.onclick = function () {
                    cancelAnimationFrame(raf);
                    wrap.remove();
                    wrap = null;
                    open(w[0]);
                };
                nav.appendChild(b);
            });
            var close = el('button', null, '✕ Закрыть');
            close.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:#3b4348;color:#e6eaed;box-shadow:0 4px 0 #101214';
            close.onclick = function () { cancelAnimationFrame(raf); wrap.remove(); wrap = null; };
            nav.appendChild(close);
            wrap.appendChild(nav);

            var simM = location.search.match(/[?&]sim=(\d+)/);
            if (simM) simOffset = Math.min(600, parseInt(simM[1], 10));

            var last = performance.now();
            (function loop(now) {
                raf = requestAnimationFrame(loop);
                var dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                updateScene(dt);
                renderer.render(scene, camera);
            })(last);

            var orbitDrag = false, ox = 0, oy = 0;
            var theta = Math.atan2(camera.position.x, camera.position.z);
            var radius = camera.position.length();
            var phi = Math.acos(camera.position.y / radius);
            renderer.domElement.addEventListener('pointerdown', function (e) { orbitDrag = true; ox = e.clientX; oy = e.clientY; });
            window.addEventListener('pointerup', function () { orbitDrag = false; });
            window.addEventListener('pointermove', function (e) {
                if (!orbitDrag) return;
                theta -= (e.clientX - ox) * 0.006;
                phi = Math.max(0.2, Math.min(1.45, phi - (e.clientY - oy) * 0.005));
                ox = e.clientX; oy = e.clientY;
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 10, 0);
            });
            renderer.domElement.addEventListener('wheel', function (e) {
                e.preventDefault();
                radius = Math.max(20, Math.min(140, radius + e.deltaY * 0.05));
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 10, 0);
            }, { passive: false });
        }).catch(function (e) {
            var d = el('div', null, 'Не загрузился 3D: ' + (e && e.message ? e.message : e));
            d.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
            wrap.appendChild(d);
        });
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('pad-btn')) return;
        var b = el('button', 'menu-btn', '🚀 Старт и посадка');
        b.id = 'pad-btn';
        b.setAttribute('data-tip', 'Площадка|Текстура бетона и реголита, цикл старта и посадки');
        b.onclick = function () { open('earth'); };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Pad3D = { open: open };

    if (/[?&]pad=/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(function () {
            var m = location.search.match(/[?&]pad=(earth|moon)/);
            open(m ? m[1] : 'earth');
        }, 1400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
