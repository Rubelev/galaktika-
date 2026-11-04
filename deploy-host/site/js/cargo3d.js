// Погрузка на гравитационную платформу: сцена из кубиков, анимация цикла.
// Земля и Луна: разная палитра, небо и грунт.  ?cargo=earth | ?cargo=moon
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    var WORLDS = {
        earth: {
            name: 'Земля', sky: 0x9fc0da, fog: 0xa9c6dd, fogNear: 40, fogFar: 130,
            ground: 0x4f7a3a, ground2: 0x5b8a42, pad: 0x8d979e, pad2: 0x6d777e,
            crate: 0xc98d4a, crate2: 0xa8743a, light: 0xfff4e0, stars: false, dust: 0
        },
        moon: {
            name: 'Луна', sky: 0x05070a, fog: 0x0c1014, fogNear: 30, fogFar: 110,
            ground: 0x8d9196, ground2: 0x7c8085, pad: 0x9aa4ab, pad2: 0x747d84,
            crate: 0xb8bec2, crate2: 0x8f979d, light: 0xe8f0ff, stars: true, dust: 1
        }
    };

    var THREE = null, renderer = null, scene = null, camera = null;
    var wrap = null, world = 'earth', profile = null;
    var state = { crates: [], stacked: 0, phase: 0, liftY: 0, sent: 0, mode: 'load' };
    var crane = null, trolley = null, hook = null, liftPlate = null;
    var clock = 0;
    var raf = 0;

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    function box(w, h, d, color, x, y, z) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
            new THREE.MeshLambertMaterial({ color: color }));
        m.position.set(x || 0, y || 0, z || 0);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    }

    function stars() {
        var g = new THREE.BufferGeometry();
        var n = 700, pos = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
            var r = 220 + Math.random() * 120;
            var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
            pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * 0.9;
            pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, fog: false }));
    }

    function buildGround() {
        var g = new THREE.Group();
        var size = 34;
        for (var x = -size / 2; x < size / 2; x += 2) {
            for (var z = -size / 2; z < size / 2; z += 2) {
                var c = ((Math.abs(x + z) / 2) | 0) % 2 ? profile.ground : profile.ground2;
                var tile = box(2, 0.4, 2, c, x + 1, -0.2, z + 1);
                tile.castShadow = false;
                g.add(tile);
            }
        }
        // бетонная площадка под платформу
        for (var px = -9; px <= 9; px += 3) {
            for (var pz = -9; pz <= 9; pz += 3) {
                g.add(box(3, 0.3, 3, Math.abs(px) === 9 || Math.abs(pz) === 9 ? profile.pad2 : profile.pad, px, 0.15, pz));
            }
        }
        // разметка
        g.add(box(12, 0.06, 0.3, 0xffd05a, 0, 0.34, 2.4));
        g.add(box(12, 0.06, 0.3, 0xffd05a, 0, 0.34, -2.4));
        return g;
    }

    function buildTower() {
        var g = new THREE.Group();
        // шахта
        for (var y = 0; y < 8; y++) {
            g.add(box(0.6, 1, 0.6, profile.pad2, -2.2, y + 1.5, -2.2));
            g.add(box(0.6, 1, 0.6, profile.pad2, 2.2, y + 1.5, -2.2));
            g.add(box(0.6, 1, 0.6, profile.pad2, -2.2, y + 1.5, 2.2));
            g.add(box(0.6, 1, 0.6, profile.pad2, 2.2, y + 1.5, 2.2));
            if (y % 3 === 2) {
                g.add(box(5, 0.35, 0.35, 0xffd05a, 0, y + 1.5, -2.2));
                g.add(box(5, 0.35, 0.35, 0xffd05a, 0, y + 1.5, 2.2));
            }
        }
        // площадка лифта
        liftPlate = new THREE.Group();
        liftPlate.add(box(4.4, 0.35, 4.4, profile.pad, 0, 0, 0));
        liftPlate.add(box(4.6, 0.12, 0.3, 0xffd05a, 0, 0.24, 0));
        liftPlate.position.set(0, 0.6, 0);
        g.add(liftPlate);
        return g;
    }

    // козловой кран: рельсы вдоль Z, мост едет по Z, тельфер — по X
    var bridge = null, bridgeZ = 0, trolleyX = 0, hookY = 0;

    function buildCrane() {
        var g = new THREE.Group();
        // четыре опоры и рельсы
        [[-7, -8], [7, -8], [-7, 8], [7, 8]].forEach(function (p) {
            g.add(box(0.55, 10, 0.55, 0xd8a41c, p[0], 5, p[1]));
        });
        g.add(box(0.45, 0.45, 17, 0x9aa4ab, -7, 10.2, 0));
        g.add(box(0.45, 0.45, 17, 0x9aa4ab, 7, 10.2, 0));

        // мост
        bridge = new THREE.Group();
        bridge.add(box(15, 0.55, 0.55, 0xd8a41c, 0, 10.7, 0));
        bridge.add(box(15, 0.25, 0.25, 0xd8a41c, 0, 9.9, 0));
        for (var i = 0; i < 8; i++) {
            var dg = box(1.9, 0.14, 0.14, 0xd8a41c, -6.5 + i * 1.85, 10.3, 0);
            dg.rotation.z = i % 2 ? 0.35 : -0.35;
            bridge.add(dg);
        }
        // тельфер
        trolley = new THREE.Group();
        trolley.add(box(1.5, 0.85, 1.3, 0x3a4046, 0, 0, 0));
        trolley.add(box(1.7, 0.2, 1.5, 0xd8a41c, 0, 0.5, 0));
        hook = new THREE.Group();
        hook.add(box(0.16, 4.0, 0.16, 0x2b3238, 0, -2.0, 0));
        hook.add(box(0.8, 0.35, 0.8, 0x3a4046, 0, -4.1, 0));
        trolley.add(hook);
        bridge.add(trolley);
        g.add(bridge);
        bridgeZ = 3;
        trolleyX = 6;
        bridge.position.z = bridgeZ;
        trolley.position.x = trolleyX;
        return g;
    }

    function buildTruck() {
        var g = new THREE.Group();
        var cab = box(2.2, 1.6, 2.4, 0x2f7fc4, -14.5, 1.1, 3);
        var body = box(5.4, 1.4, 2.6, 0x3a4046, -10.6, 1.0, 3);
        g.add(cab, body);
        g.add(box(5.4, 0.3, 2.6, 0x6d777e, -10.6, 1.85, 3));
        [[-13.2, 2.2], [-9.0, 2.2]].forEach(function (w) {
            var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12),
                new THREE.MeshLambertMaterial({ color: 0x14181c }));
            wh.rotation.x = Math.PI / 2;
            wh.position.set(w[0], 0.6, w[1]);
            g.add(wh);
        });
        return g;
    }

    function buildConveyor() {
        var g = new THREE.Group();
        for (var i = 0; i < 10; i++) {
            g.add(box(1.2, 0.25, 1.7, 0x4a5157, -12 + i * 1.35, 1.1, 3));
            if (i % 3 === 0) {
                g.add(box(0.2, 1.1, 0.2, 0x2b3238, -12 + i * 1.35, 0.55, 3));
            }
        }
        g.add(box(13, 0.16, 0.16, 0x2b3238, -6.6, 1.36, 2.2));
        g.add(box(13, 0.16, 0.16, 0x2b3238, -6.6, 1.36, 3.8));
        return g;
    }

    function makeCrate() {
        var c = new THREE.Group();
        c.add(box(1.1, 1.1, 1.1, profile.crate, 0, 0.55, 0));
        c.add(box(1.16, 0.12, 1.16, profile.crate2, 0, 1.1, 0));
        c.add(box(1.16, 0.12, 0.14, profile.crate2, 0, 0.55, 0.57));
        c.add(box(1.16, 0.12, 0.14, profile.crate2, 0, 0.55, -0.57));
        c.add(box(0.14, 0.12, 1.16, profile.crate2, 0.57, 0.55, 0));
        c.add(box(1.2, 0.08, 0.2, 0x2b3238, 0, 1.18, 0));
        return c;
    }

    function buildScene() {
        scene = new THREE.Scene();
        profile = WORLDS[world];
        scene.background = new THREE.Color(profile.sky);
        scene.fog = new THREE.Fog(profile.fog, profile.fogNear, profile.fogFar);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x2b3136, profile.stars ? 0.85 : 0.95));
        var dir = new THREE.DirectionalLight(profile.light, profile.stars ? 1.35 : 0.95);
        dir.position.set(12, 20, 10);
        dir.castShadow = true;
        dir.shadow.mapSize.set(1024, 1024);
        dir.shadow.camera.left = -22; dir.shadow.camera.right = 22;
        dir.shadow.camera.top = 22; dir.shadow.camera.bottom = -22;
        scene.add(dir);
        if (profile.stars) scene.add(stars());

        scene.add(buildGround());
        scene.add(buildTower());
        crane = buildCrane();
        scene.add(crane);
        scene.add(buildConveyor());
        scene.add(buildTruck());

        camera = new THREE.PerspectiveCamera(52, 1, 0.1, 500);
        camera.position.set(19, 14, 24);
        camera.lookAt(0, 4, 0);

        state.crates = [];
        state.stacked = 0;
        state.sent = 0;
        state.liftY = 0.6;
        state.phase = 0;
        clock = 0;
        cycle.phase = 'idle';
        cycle.crate = null;
        if (state.mode === 'load') {
            for (var i = 0; i < 3; i++) spawnCrate(-11 + i * 2.2, 0);
        } else {
            for (var j = 0; j < 4; j++) {
                var c = makeCrate();
                c.position.set(0, state.liftY + j * 1.2, 0);
                c.userData = { phase: 'stacked', t: 0 };
                scene.add(c);
                state.crates.push(c);
                state.stacked++;
            }
        }
    }

    function spawnCrate(x, z) {
        var c = makeCrate();
        c.position.set(x, 0.25, 3 + (z || 0));
        c.userData = { x: x, phase: 'conveyor', t: 0 };
        scene.add(c);
        state.crates.push(c);
        return c;
    }

    var cycle = { phase: 'idle', t: 0, crate: null };

    function loadMode() { return state.mode !== 'unload'; }
    function pickupPoint() { return loadMode() ? { x: 6, z: 3 } : { x: 0, z: 0 }; }
    function dropPoint() { return loadMode() ? { x: 0, z: 0 } : { x: 6, z: 3 }; }

    function nextWaiting() {
        var pick = pickupPoint();
        var best = null;
        state.crates.forEach(function (c) {
            if (c.userData.phase !== 'waiting') return;
            if (!best || Math.abs(c.position.x - pick.x) < Math.abs(best.position.x - pick.x)) best = c;
        });
        return best;
    }

    function topStacked() {
        var top = null;
        state.crates.forEach(function (c) {
            if (c.userData.phase !== 'stacked') return;
            if (!top || c.position.y > top.position.y) top = c;
        });
        return top;
    }

    function animate(t) {
        raf = window.requestAnimationFrame(animate);
        var dt = Math.min(0.05, clock ? (t - clock) / 1000 : 0.016);
        clock = t;
        stepWorld(dt);
        renderer.render(scene, camera);
    }

    function stepWorld(dt) {
        var pick = pickupPoint(), drop = dropPoint();

        // ---- конвейер ----
        state.crates.forEach(function (c) {
            if (c.userData.phase === 'conveyor') {
                c.position.x += dt * 1.5 * (loadMode() ? 1 : -1);
                if (loadMode() && c.position.x >= pick.x) { c.position.x = pick.x; c.userData.phase = 'waiting'; }
                if (!loadMode() && c.position.x <= -13) {
                    scene.remove(c); c.userData.dead = true; state.sent++;
                    updateHud();
                }
            }
            if (c.userData.phase === 'toTruck') {
                c.position.x -= dt * 2.2;
                if (c.position.x <= -13) { scene.remove(c); c.userData.dead = true; state.sent++; updateHud(); }
            }
        });

        var waiting = nextWaiting();
        cycle.t += dt;

        switch (cycle.phase) {
            case 'idle': {
                // груз: на линии или на площадке
                var candidate = loadMode() ? waiting : topStacked();
                if (candidate) {
                    cycle.crate = candidate;
                    cycle.phase = 'approach';
                    cycle.t = 0;
                }
                break;
            }
            case 'approach': {
                var tx = loadMode() ? pickupPoint().x : 0;
                var tz = loadMode() ? pickupPoint().z : 0;
                trolleyX += (tx - trolleyX) * Math.min(1, dt * 4);
                bridgeZ += (tz - bridgeZ) * Math.min(1, dt * 4);
                if (Math.abs(trolleyX - tx) < 0.15 && Math.abs(bridgeZ - tz) < 0.15 && cycle.t > 0.5) {
                    cycle.phase = 'lower'; cycle.t = 0;
                }
                break;
            }
            case 'lower':
                hookY -= dt * 5;
                if (hookY <= -3.3) { hookY = -3.3; cycle.phase = 'grab'; cycle.t = 0; }
                break;
            case 'grab':
                if (cycle.crate) cycle.crate.userData.phase = 'carried';
                if (cycle.t > 0.2) { cycle.phase = 'raise'; cycle.t = 0; }
                break;
            case 'raise':
                hookY += dt * 4;
                if (cycle.crate) cycle.crate.position.set(trolleyX, hookY + 5.0, bridgeZ);
                if (hookY >= 0) { hookY = 0; cycle.phase = 'carry'; cycle.t = 0; }
                break;
            case 'carry':
                trolleyX += (drop.x - trolleyX) * Math.min(1, dt * 3);
                bridgeZ += (drop.z - bridgeZ) * Math.min(1, dt * 3);
                if (cycle.crate) cycle.crate.position.set(trolleyX, 5.0, bridgeZ);
                if (Math.abs(trolleyX - drop.x) < 0.2 && Math.abs(bridgeZ - drop.z) < 0.2 && cycle.t > 0.7) {
                    cycle.phase = 'place'; cycle.t = 0;
                }
                break;
            case 'place': {
                if (loadMode()) {
                    var targetY = state.liftY + state.stacked * 1.2 + 0.05;
                    if (cycle.crate) cycle.crate.position.set(0, Math.max(targetY, cycle.crate.position.y - dt * 5), 0);
                    if (cycle.crate && cycle.crate.position.y <= targetY + 0.02) {
                        cycle.crate.position.set(0, targetY, 0);
                        cycle.crate.userData.phase = 'stacked';
                        state.stacked++;
                        updateHud();
                        if (state.stacked >= 4) {
                            state.sent += 4; state.stacked = 0;
                            state.crates.forEach(function (k) {
                                if (k.userData.phase === 'stacked') { k.userData.phase = 'fading'; k.userData.t = 0; }
                            });
                        }
                        cycle.phase = 'idle'; cycle.t = 0; cycle.crate = null;
                    }
                } else {
                    // разгрузка: ставим на конвейер
                    if (cycle.crate) {
                        cycle.crate.position.set(6, Math.max(0.25, cycle.crate.position.y - dt * 5), 3);
                        if (cycle.crate.position.y <= 0.3) {
                            cycle.crate.position.set(6, 0.25, 3);
                            cycle.crate.userData.phase = 'toTruck';
                            state.stacked = Math.max(0, state.stacked - 1);
                            updateHud();
                            cycle.phase = 'idle'; cycle.t = 0; cycle.crate = null;
                        }
                    }
                }
                break;
            }
        }

        bridge.position.z = bridgeZ;
        trolley.position.x = trolleyX;
        hook.position.y = hookY;
        if (liftPlate) liftPlate.position.y = state.liftY;

        state.crates.forEach(function (c) {
            if (c.userData.phase !== 'fading') return;
            c.userData.t += dt;
            c.position.y += dt * 4;
            c.children.forEach(function (m) {
                if (m.material) { m.material.transparent = true; m.material.opacity = Math.max(0, 1 - c.userData.t); }
            });
            if (c.userData.t > 1) { scene.remove(c); c.userData.dead = true; }
        });
        state.crates = state.crates.filter(function (c) { return !c.userData.dead; });

        // ---- лифт ----
        if (loadMode()) {
            var busy = state.crates.some(function (c) {
                return c.userData.phase !== 'fading' && c.userData.phase !== 'stacked';
            });
            if (!busy && state.crates.length <= 3) {
                state.liftY = Math.min(4.6, state.liftY + dt * 1.1);
                if (state.liftY >= 4.5) {
                    state.liftY = 0.6; state.crates = [];
                    for (var i = 0; i < 3; i++) spawnCrate(-12 + i * 1.6, 0);
                }
            }
            var onLine = state.crates.filter(function (c) {
                return c.userData.phase === 'conveyor' || c.userData.phase === 'waiting';
            }).length;
            if (onLine < 3 && state.crates.length < 6) spawnCrate(-12.5, 0);
        } else {
            // разгрузка: когда площадка пуста — новая партия
            var empty = !state.crates.some(function (c) {
                return c.userData.phase === 'stacked' || c.userData.phase === 'carried';
            });
            if (empty && cycle.phase === 'idle') {
                state.liftY = 0.6;
                state.stacked = 0;
                for (var j = 0; j < 4; j++) {
                    var cr = makeCrate();
                    cr.position.set(0, state.liftY + j * 1.2, 0);
                    cr.userData = { phase: 'stacked', t: 0 };
                    scene.add(cr);
                    state.crates.push(cr);
                    state.stacked++;
                }
                updateHud();
            }
        }
    }

    function updateHud() {
        var c = document.getElementById('cg-count');
        if (c) c.textContent = state.sent + state.stacked;
        var bar = document.getElementById('cg-bar');
        if (bar) bar.style.width = Math.min(100, (state.stacked / 4) * 100) + '%';
        var w = document.getElementById('cg-world');
        if (w) w.textContent = WORLDS[world].name;
        var dbg = document.getElementById('cg-dbg');
        if (dbg && liftPlate) {
            var st = state.crates.filter(function (c) { return c.userData.phase === 'stacked'; })[0];
            dbg.textContent = 'plate=' + liftPlate.position.x.toFixed(1) + ',' +
                liftPlate.position.y.toFixed(1) + ',' + liftPlate.position.z.toFixed(1) +
                ' stack=' + (st ? st.position.x.toFixed(1) + ',' + st.position.y.toFixed(1) + ',' + st.position.z.toFixed(1) : 'нет') +
                ' mode=' + state.mode + ' stackN=' + state.stacked;
        }
        var m = document.getElementById('cg-mode');
        if (m) m.textContent = state.mode === 'load' ? 'погрузка' : 'разгрузка';
    }

    function open(initial) {
        if (initial) world = initial;
        if (wrap) wrap.remove();
        wrap = el('div');
        wrap.id = 'cg-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9870;background:#070b0e;font:13px Inter,system-ui,sans-serif;color:#dce8f7';
        document.body.appendChild(wrap);

        import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.shadowMap.enabled = true;
            renderer.setSize(window.innerWidth, window.innerHeight);
            wrap.appendChild(renderer.domElement);

            if (/[?&]mode=unload/.test(location.search)) state.mode = 'unload';
            buildScene();
            if (/[?&]top=1/.test(location.search)) {
                camera.position.set(0.01, 34, 0.01);
                camera.lookAt(0, 0, 0);
            }
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();

            // HUD
            var hud = el('div');
            hud.style.cssText = 'position:absolute;left:0;right:0;top:0;display:flex;gap:10px;align-items:center;' +
                'padding:12px 14px;background:linear-gradient(rgba(7,11,14,.9),rgba(7,11,14,0));z-index:3;flex-wrap:wrap';
            hud.innerHTML = '<b style="color:#8fd6ff;font-size:14px">📦 ПОГРУЗКА НА ПЛАТФОРМУ</b>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#23262a;font:700 12px monospace">' +
                'мир: <span id="cg-world">' + WORLDS[world].name + '</span> · ' +
                '<span id="cg-mode">' + (state.mode === 'load' ? 'погрузка' : 'разгрузка') + '</span></span>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#23262a;font:700 12px monospace">' +
                'контейнеров: <b id="cg-count" style="color:#ffd05a">0</b></span>' +
                '<span style="flex:1;min-width:80px;height:12px;border:2px solid #101214;border-radius:3px;background:#1a1d20;overflow:hidden">' +
                '<span id="cg-dbg" style="font:11px monospace;color:#7f97ad;display:' +
                (/[?&]dbg=1/.test(location.search) ? 'inline' : 'none') + '"></span>' +
                '<i id="cg-bar" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#3ec97a,#ffd05a);transition:width .3s"></i></span>';
            wrap.appendChild(hud);

            var nav = el('div');
            nav.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:4';
            [['earth', '🌍 Земля'], ['moon', '🌕 Луна']].forEach(function (w) {
                var b = el('button', null, w[1]);
                b.style.cssText = 'padding:9px 16px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                    'font:800 13px Inter,system-ui,sans-serif;box-shadow:0 4px 0 #101214;' +
                    (w[0] === world ? 'background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00' : 'background:#2b3238;color:#e6eaed');
                b.onclick = function () { world = w[0]; rebuild(); };
                nav.appendChild(b);
            });
            var modeBtn = el('button', null, '📥 Погрузка / 📤 Разгрузка');
            modeBtn.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:linear-gradient(#8fd6ff,#2f9fe0);color:#04223a;box-shadow:0 4px 0 #101214';
            modeBtn.onclick = function () {
                state.mode = state.mode === 'load' ? 'unload' : 'load';
                rebuild();
            };
            nav.appendChild(modeBtn);

            var close = el('button', null, '✕ Закрыть');
            close.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:#3b4348;color:#e6eaed;box-shadow:0 4px 0 #101214';
            close.onclick = function () { cancelAnimationFrame(raf); wrap.remove(); wrap = null; };
            nav.appendChild(close);
            wrap.appendChild(nav);

            orbit(renderer.domElement, camera);

            var pre = location.search.match(/[?&]t=(\d+)/);
            if (pre) {
                var secs = Math.min(120, parseInt(pre[1], 10));
                for (var i = 0; i < secs * 60; i++) stepWorld(1 / 60);
            }
            raf = window.requestAnimationFrame(animate);
            updateHud();
        }).catch(function (e) {
            var d = el('div', null, 'Не загрузился 3D: ' + (e && e.message ? e.message : e));
            d.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
            wrap.appendChild(d);
        });
    }

    function rebuild() {
        if (renderer) { renderer.dispose(); renderer = null; }
        if (wrap) {
            var cv = wrap.querySelector('canvas');
            if (cv) cv.remove();
        }
        buildScene();
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.shadowMap.enabled = true;
        renderer.setSize(window.innerWidth, window.innerHeight);
        wrap.appendChild(renderer.domElement);
        orbit(renderer.domElement, camera);
        cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(animate);
        updateHud();
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
            phi = Math.max(0.2, Math.min(1.45, phi - (e.clientY - ly) * 0.005));
            lx = e.clientX; ly = e.clientY;
            cam.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.cos(theta));
            cam.lookAt(0, 3, 0);
        });
        canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            radius = Math.max(10, Math.min(70, radius + e.deltaY * 0.04));
            cam.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.cos(theta));
            cam.lookAt(0, 3, 0);
        }, { passive: false });
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('cargo-btn')) return;
        var b = el('button', 'menu-btn', '📦 Погрузка на платформу');
        b.id = 'cargo-btn';
        b.setAttribute('data-tip', 'Погрузка|Контейнеры, кран и лифт из кубиков');
        b.onclick = function () { open('earth'); };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Cargo3D = { open: open };

    if (/[?&]cargo=/.test(location.search)) {
        setTimeout(function () {
            ['welcome-screen', 'auth-overlay', 'legend-overlay', 'tut-modal'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
            var m = location.search.match(/[?&]cargo=(earth|moon)/);
            open(m ? m[1] : 'earth');
        }, 1400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
