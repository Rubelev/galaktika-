// Стройка из кубиков: кран, леса, рабочие и дроны.
// Земля — люди в касках и жилетах + дроны.  Луна — люди в скафандрах + дроны.
// ?site=earth | ?site=moon  ·  &sim=N — прокрутить стройку на N секунд
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    var THREE = null, renderer = null, scene = null, camera = null, wrap = null;
    var world = 'earth', time = 0, simOffset = 0, raf = 0, tab = 'earth';
    var TOTAL = 0, placed = 0, blockMesh = null, blockMat = null;
    var hook = null, hookLine = null, craneJib = null, trolley = null;
    var workers = [], drones = [], scaffold = [], stacks = [], stars = null;
    var CYCLE = 120;                       // секунд на весь дом в ускоренной съёмке
    var U = 2;                             // кубик 2 м
    var W = 8, D = 8, H = 26;              // дом 16×16×52 м
    var SCAFFOLD_STEP = 3;

    var WORLDS = {
        earth: {
            name: 'Земля', sky: 0x9ec2dc, fog: 0xb2cbe0, fogNear: 90, fogFar: 320,
            ground: 0x4f7a3a, ground2: 0x5b8a42, suit: 'vest',
            dust: 0xc9b58e, light: 0xfff4e0, lightI: 1.0, hemiI: 0.9, stars: false
        },
        moon: {
            name: 'Луна', sky: 0x05070a, fog: 0x0a0e12, fogNear: 70, fogFar: 260,
            ground: 0x8d9196, ground2: 0x7c8085, suit: 'spacesuit',
            dust: 0xb8bcc0, light: 0xfffaf0, lightI: 1.35, hemiI: 0.55, stars: true
        }
    };

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    function box(w, h, d, color, x, y, z, opt) {
        var mat = new THREE.MeshLambertMaterial({ color: color });
        if (opt && opt.emissive) {
            mat.emissive = new THREE.Color(opt.emissive);
            mat.emissiveIntensity = opt.intensity || 0.8;
        }
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        return m;
    }

    // ---------- окружение ----------
    function groundGroup() {
        var g = new THREE.Group();
        var p = WORLDS[world];
        for (var x = -34; x < 34; x += 2) {
            for (var z = -34; z < 34; z += 2) {
                if (x * x + z * z > 33 * 33) continue;
                var c = ((Math.abs(x + z) / 2) | 0) % 2 ? p.ground : p.ground2;
                var t = box(2, 0.4, 2, c, x + 1, -0.2, z + 1);
                t.castShadow = false;
                g.add(t);
            }
        }
        return g;
    }

    function starsGroup() {
        var geo = new THREE.BufferGeometry();
        var n = 700, pos = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
            var r = 240 + Math.random() * 90;
            var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
            pos[i * 3 + 1] = Math.abs(r * Math.cos(ph));
            pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false }));
        return stars;
    }

    // ---------- фундамент и дом ----------
    function foundation() {
        var g = new THREE.Group();
        for (var x = -W - 2; x < W + 2; x += 2) {
            for (var z = -D - 2; z < D + 2; z += 2) {
                g.add(box(2, 0.6, 2, 0x6f7478, x + 1, 0.3, z + 1));
            }
        }
        // пятна разметки
        [0xffd05a, 0xd8dee2].forEach(function (c, i) {
            for (var k = -W; k < W; k += 4) {
                g.add(box(1.6, 0.06, 0.5, c, k + 0.8, 0.64, i ? D + 1 : -D - 1));
            }
        });
        return g;
    }

    function buildBlocks() {
        TOTAL = W * D * H;
        var geo = new THREE.BoxGeometry(U * 0.96, U * 0.96, U * 0.96);
        blockMat = new THREE.MeshLambertMaterial({ color: 0xc9c3b4 });
        blockMesh = new THREE.InstancedMesh(geo, blockMat, TOTAL);
        blockMesh.count = TOTAL;
        blockMesh.castShadow = true;
        blockMesh.receiveShadow = true;
        var m4 = new THREE.Matrix4();
        for (var i = 0; i < TOTAL; i++) {
            m4.makeTranslation(0, -999, 0);   // спрятаны до установки
            blockMesh.setMatrixAt(i, m4);
        }
        blockMesh.instanceMatrix.needsUpdate = true;
        return blockMesh;
    }

    function blockPos(i) {
        var x = i % W;
        var z = Math.floor(i / W) % D;
        var y = Math.floor(i / (W * D));
        return { x: (x - W / 2 + 0.5) * U, y: 1 + y * U, z: (z - D / 2 + 0.5) * U };
    }

    function placeBlock(i, color) {
        var p = blockPos(i);
        var m4 = new THREE.Matrix4();
        m4.makeTranslation(p.x, p.y, p.z);
        blockMesh.setMatrixAt(i, m4);
        blockMesh.setColorAt(i, new THREE.Color(color || 0xc9c3b4));
        blockMesh.instanceMatrix.needsUpdate = true;
        if (blockMesh.instanceColor) blockMesh.instanceColor.needsUpdate = true;
    }

    // ---------- леса ----------
    function buildScaffold() {
        var g = new THREE.Group();
        scaffold = [];
        for (var y = 1; y < H; y += SCAFFOLD_STEP) {
            var lvl = new THREE.Group();
            [-W / 2 - 1, W / 2 + 1].forEach(function (x) {
                [-D / 2 - 1, D / 2 + 1].forEach(function (z) {
                    // стойки
                    for (var k = 0; k < SCAFFOLD_STEP; k++) {
                        lvl.add(box(0.32, U / SCAFFOLD_STEP * 1.05, 0.32, 0x8a6a3a,
                            x * U / 2, 1 + (y + k) * U, z * U / 2));
                    }
                });
            });
            // перекладины по периметру
            for (var t = -W / 2 - 1; t <= W / 2 + 1; t += 1) {
                lvl.add(box(0.22, 0.22, 0.22, 0xa07c46, t * U / 2, 1 + (y + SCAFFOLD_STEP) * U, (-D / 2 - 1) * U / 2));
                lvl.add(box(0.22, 0.22, 0.22, 0xa07c46, t * U / 2, 1 + (y + SCAFFOLD_STEP) * U, (D / 2 + 1) * U / 2));
            }
            // настил
            lvl.add(box(W * U + 2 * U, 0.18, 1.4, 0xb08a4a, 0, 1 + (y + SCAFFOLD_STEP) * U, (-D / 2 - 1) * U / 2));
            lvl.visible = false;
            scaffold.push({ y: y, group: lvl });
            g.add(lvl);
        }
        return g;
    }

    // ---------- башенный кран ----------
    function crane() {
        var g = new THREE.Group();
        var MAST = 34;
        for (var y = 0; y < MAST; y += 2) {
            g.add(box(1.6, 2, 0.3, 0xd8a41c, 12, y + 1, 10));
            g.add(box(0.3, 2, 1.6, 0xd8a41c, 12, y + 1, 10));
        }
        // кабина
        g.add(box(2.4, 2, 2.4, 0x2f6fa8, 12, MAST + 1, 10));
        // стрела
        craneJib = new THREE.Group();
        craneJib.position.set(12, MAST + 2.4, 10);
        craneJib.add(box(20, 0.6, 0.6, 0xd8a41c, 10, 0, 0));
        craneJib.add(box(0.3, 3.4, 0.3, 0xd8a41c, 20, 1.4, 0));
        // противовес
        craneJib.add(box(4, 1.6, 2, 0x3a4046, -4, -0.4, 0));
        // трос и крюк
        trolley = new THREE.Group();
        trolley.position.set(10, 0, 0);
        trolley.add(box(1.4, 0.6, 1.4, 0x3a4046, 0, 0, 0));
        hookLine = box(0.12, 10, 0.12, 0x22282c, 0, -5, 0);
        trolley.add(hookLine);
        hook = new THREE.Group();
        hook.position.set(0, -10, 0);
        hook.add(box(1.4, 0.5, 1.4, 0x6f7478, 0, 0, 0));
        var load = box(U * 0.95, U * 0.95, U * 0.95, 0xc9c3b4, 0, -1.4, 0);
        load.name = 'load';
        hook.add(load);
        trolley.add(hook);
        craneJib.add(trolley);
        g.add(craneJib);
        return g;
    }

    // ---------- рабочие ----------
    function workerMesh() {
        var p = WORLDS[world];
        var g = new THREE.Group();
        var suitColor = p.suit === 'spacesuit' ? 0xe8ecf0 : 0x2f4a6b;
        var accent = p.suit === 'spacesuit' ? 0xd8dee2 : 0xf0a02a;
        // ноги
        var legL = box(0.5, 1.1, 0.5, suitColor, -0.32, 0.55, 0);
        var legR = box(0.5, 1.1, 0.5, suitColor, 0.32, 0.55, 0);
        legL.name = 'legL'; legR.name = 'legR';
        g.add(legL); g.add(legR);
        // корпус
        g.add(box(1.1, 1.3, 0.7, suitColor, 0, 1.75, 0));
        // жилет/баллон
        g.add(box(1.2, 0.8, 0.8, accent, 0, 1.9, 0));
        if (p.suit === 'spacesuit') {
            g.add(box(1.3, 1.3, 0.6, 0xbfc7ce, 0, 1.9, -0.55));   // ранец
            g.add(box(1.0, 1.0, 1.0, 0xdfe6ec, 0, 2.9, 0));        // шлем
            g.add(box(0.7, 0.4, 0.1, 0x7fd8ff, 0, 2.95, 0.5, { emissive: 0x7fd8ff, intensity: 0.6 }));
        } else {
            g.add(box(1.0, 0.5, 1.0, 0xf0c419, 0, 2.65, 0));       // каска
            g.add(box(0.9, 0.35, 0.9, 0xf0a02a, 0, 2.42, 0));
        }
        // руки с инструментом
        g.add(box(0.35, 1.0, 0.35, suitColor, -0.75, 1.8, 0));
        g.add(box(0.35, 1.0, 0.35, suitColor, 0.75, 1.8, 0));
        g.add(box(0.25, 0.9, 0.25, 0xd8a41c, 0.9, 2.3, 0.2));
        return g;
    }

    function makeWorkers(n) {
        var g = new THREE.Group();
        workers = [];
        for (var i = 0; i < n; i++) {
            var w = workerMesh();
            var ground = i < Math.ceil(n * 0.6);
            w.userData = {
                ground: ground,
                phase: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 0.5,
                lvl: ground ? 0 : 2 + (i % 4) * 3,
                radius: 10 + Math.random() * 4,
                a: Math.random() * Math.PI * 2
            };
            g.add(w);
            workers.push(w);
        }
        return g;
    }

    // ---------- дроны ----------
    function droneMesh() {
        var g = new THREE.Group();
        g.add(box(1.0, 0.3, 1.0, 0x2b3238, 0, 0, 0));
        g.add(box(0.5, 0.2, 0.5, 0x8fd6ff, 0, 0.2, 0, { emissive: 0x8fd6ff, intensity: 0.5 }));
        // лучи и винты
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
            g.add(box(0.9, 0.1, 0.14, 0x3a4046, c[0] * 0.6, 0, c[1] * 0.6));
            var rotor = box(0.9, 0.04, 0.16, 0x9aa0a4, c[0] * 1.0, 0.12, c[1] * 1.0);
            rotor.name = 'rotor';
            g.add(rotor);
        });
        var load = box(U * 0.8, U * 0.8, U * 0.8, 0xc9c3b4, 0, -0.9, 0);
        load.name = 'load';
        g.add(load);
        return g;
    }

    function makeDrones(n) {
        var g = new THREE.Group();
        drones = [];
        for (var i = 0; i < n; i++) {
            var d = droneMesh();
            d.userData = {
                a: i / n * Math.PI * 2,
                r: 9 + (i % 3) * 3,
                h: 6 + i * 3,
                speed: 0.5 + Math.random() * 0.4
            };
            g.add(d);
            drones.push(d);
        }
        return g;
    }

    // ---------- склад кубиков ----------
    function stacksGroup() {
        var g = new THREE.Group();
        stacks = [];
        for (var s = 0; s < 3; s++) {
            var st = new THREE.Group();
            st.position.set(-18 + s * 3, 0, 18);
            for (var i = 0; i < 9; i++) {
                st.add(box(U * 0.95, U * 0.95, U * 0.95, 0xc9c3b4,
                    (i % 3) * U, 0.6 + Math.floor(i / 3) * U, 0));
            }
            g.add(st);
            stacks.push(st);
        }
        return g;
    }

    // ---------- анимация ----------
    function updateSite() {
        var t = (time + simOffset) % CYCLE;
        var progress = Math.min(1, t / CYCLE);
        var want = Math.floor(progress * TOTAL);

        // ставим недостающие кубики
        while (placed < want) {
            var idx = placed;
            var y = Math.floor(idx / (W * D));
            var color = y < 2 ? 0x9aa0a4 : (y > H - 6 ? 0xd8dee2 : (idx % 7 === 0 ? 0xb8c4cc : 0xc9c3b4));
            placeBlock(idx, color);
            placed++;
        }
        if (want < placed) {   // откат при сбросе времени
            var m4 = new THREE.Matrix4();
            for (var i = want; i < placed; i++) {
                m4.makeTranslation(0, -999, 0);
                blockMesh.setMatrixAt(i, m4);
            }
            blockMesh.instanceMatrix.needsUpdate = true;
            placed = want;
        }

        var height = Math.floor(placed / (W * D));

        // леса растут вместе с домом
        scaffold.forEach(function (s) {
            s.group.visible = height >= s.y - 1;
        });

        // кран: поворот стрелы, тележка, крюк с грузом
        if (craneJib) {
            craneJib.rotation.y = Math.sin(t * 0.35) * 0.9 + 0.4;
            if (trolley) {
                var tp = 6 + Math.sin(t * 0.5) * 6;
                trolley.position.x = tp;
                var lineH = 6 + Math.abs(Math.sin(t * 0.9)) * (height * U * 0.6 + 4);
                hookLine.scale.y = lineH / 10;
                hookLine.position.y = -lineH / 2;
                hook.position.y = -lineH;
                var ld = hook.getObjectByName('load');
                if (ld) ld.visible = progress < 0.97;
            }
        }

        // рабочие
        workers.forEach(function (w, i) {
            var u = w.userData;
            if (u.ground) {
                u.a += 0.008 * u.speed;
                var r = u.radius + Math.sin(u.phase + time) * 1.2;
                w.position.set(Math.cos(u.a) * r, 0.6, Math.sin(u.a) * r);
                w.rotation.y = -u.a + Math.PI / 2;
            } else {
                var y = 1 + Math.min(H, u.lvl) * U;
                w.position.set(-W / 2 - 1.6, y, -D / 2 + (i % 3) * 2);
                w.rotation.y = Math.PI / 2 + Math.sin(time * 0.6 + i) * 0.3;
            }
            // шаг: качаем ногами и корпусом
            var swing = Math.sin(time * 6 * u.speed + u.phase) * 0.4;
            var legL = w.getObjectByName('legL');
            var legR = w.getObjectByName('legR');
            if (legL) legL.rotation.x = swing;
            if (legR) legR.rotation.x = -swing;
            w.position.y += u.ground ? Math.abs(Math.sin(time * 6 * u.speed)) * 0.12 : 0;
        });

        // дроны: летают кругами, несут кубики, винты крутятся
        drones.forEach(function (d, i) {
            var u = d.userData;
            var a = u.a + time * u.speed * 0.5;
            var y = u.h + Math.sin(time * 1.2 + i) * 0.8 + Math.min(H, height) * U * 0.35;
            d.position.set(Math.cos(a) * u.r, y, Math.sin(a) * u.r);
            d.rotation.y = -a;
            d.rotation.z = Math.sin(time * 2 + i) * 0.08;
            var load = d.getObjectByName('load');
            if (load) load.visible = progress < 0.95;
            d.children.forEach(function (c) {
                if (c.name === 'rotor') c.rotation.y = time * 40;
            });
        });

        hud(progress, height);
    }

    function hud(progress, height) {
        var pct = Math.round(progress * 100);
        var bar = document.getElementById('bs-bar');
        if (bar) bar.style.width = pct + '%';
        var pc = document.getElementById('bs-pct');
        if (pc) pc.textContent = pct + ' %';
        var bl = document.getElementById('bs-blocks');
        if (bl) bl.textContent = placed + ' / ' + TOTAL + ' кубиков';
        var hh = document.getElementById('bs-height');
        if (hh) hh.textContent = (height * U) + ' м';
        var ph = document.getElementById('bs-phase');
        if (ph) {
            ph.textContent = progress < 0.12 ? '🪨 фундамент и первый ярус'
                : progress < 0.55 ? '🏗 каркас и леса'
                : progress < 0.9 ? '🧱 обшивка и кровля'
                : '✅ отделка, кран уходит';
        }
    }

    // ---------- запуск ----------
    function open(initial) {
        world = initial || 'earth';
        if (wrap) wrap.remove();
        wrap = el('div');
        wrap.id = 'buildsite-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9870;background:#070b0e;' +
            'font:13px Inter,system-ui,sans-serif;color:#dce8f7';
        document.body.appendChild(wrap);

        import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            placed = 0; time = 0;
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.shadowMap.enabled = true;
            renderer.setSize(window.innerWidth, window.innerHeight);
            wrap.appendChild(renderer.domElement);

            scene = new THREE.Scene();
            var p = WORLDS[world];
            scene.background = new THREE.Color(p.sky);
            scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x51565c, p.hemiI * 1.25));
            var dir = new THREE.DirectionalLight(p.light, p.lightI);
            dir.position.set(40, 60, 30);
            dir.castShadow = true;
            dir.shadow.mapSize.set(2048, 2048);
            dir.shadow.camera.left = -60; dir.shadow.camera.right = 60;
            dir.shadow.camera.top = 60; dir.shadow.camera.bottom = -60;
            dir.shadow.normalBias = 0.06;
            scene.add(dir);
            if (p.stars) scene.add(starsGroup());

            scene.add(groundGroup());
            scene.add(foundation());
            scene.add(buildBlocks());
            scene.add(buildScaffold());
            scene.add(crane());
            scene.add(makeWorkers(8));
            scene.add(makeDrones(4));
            scene.add(stacksGroup());

            camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 600);
            camera.position.set(56, 36, 58);
            camera.lookAt(0, 19, 0);

            // HUD
            var hudEl = el('div');
            hudEl.style.cssText = 'position:absolute;left:0;right:0;top:0;display:flex;gap:10px;' +
                'align-items:center;padding:12px 14px;flex-wrap:wrap;' +
                'background:linear-gradient(rgba(7,11,14,.92),rgba(7,11,14,0));z-index:3';
            hudEl.innerHTML =
                '<b style="color:#8fd6ff;font-size:14px">🏗 Стройка из кубиков</b>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#23262a;' +
                'font:700 12px monospace">планета: ' + p.name + '</span>' +
                '<span id="bs-phase" style="padding:5px 10px;border:2px solid #101214;border-radius:6px;' +
                'background:#23262a;font:700 12px monospace;color:#ffd05a">старт</span>' +
                '<span id="bs-blocks" style="padding:5px 10px;border:2px solid #101214;border-radius:6px;' +
                'background:#23262a;font:700 12px monospace">0 кубиков</span>' +
                '<span id="bs-height" style="padding:5px 10px;border:2px solid #101214;border-radius:6px;' +
                'background:#23262a;font:700 12px monospace">0 м</span>' +
                '<span id="bs-pct" style="padding:5px 10px;border:2px solid #101214;border-radius:6px;' +
                'background:#23262a;font:700 12px monospace;color:#3ec97a">0 %</span>' +
                '<span style="flex:1;min-width:90px;height:12px;border:2px solid #101214;border-radius:3px;' +
                'background:#1a1d20;overflow:hidden"><i id="bs-bar" style="display:block;height:100%;width:0;' +
                'background:linear-gradient(90deg,#3ec97a,#ffd05a);transition:width .15s"></i></span>' +
                '<span style="padding:5px 10px;border:2px solid #101214;border-radius:6px;background:#23262a;' +
                'font:700 11.5px monospace">' +
                (p.suit === 'spacesuit' ? '👨‍🚀 8 скафандров · 🚁 4 дрона' : '👷 8 рабочих · 🚁 4 дрона') +
                '</span>';
            wrap.appendChild(hudEl);

            // переключатель планеты
            var nav = el('div');
            nav.style.cssText = 'position:absolute;bottom:14px;left:50%;transform:translateX(-50%);' +
                'display:flex;gap:8px;z-index:4';
            [['earth', '🌍 Земля · люди и дроны'], ['moon', '🌕 Луна · скафандры и дроны']].forEach(function (w2) {
                var b = el('button', null, w2[1]);
                b.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                    'font:800 13px Inter,system-ui,sans-serif;box-shadow:0 4px 0 #101214;' +
                    (w2[0] === world ? 'background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00'
                        : 'background:#2b3238;color:#e6eaed');
                b.onclick = function () { cancelAnimationFrame(raf); wrap.remove(); wrap = null; open(w2[0]); };
                nav.appendChild(b);
            });
            var cl = el('button', null, '✕ Закрыть');
            cl.style.cssText = 'padding:9px 14px;border:3px solid #101214;border-radius:9px;cursor:pointer;' +
                'font:800 13px Inter,system-ui,sans-serif;background:#3b4348;color:#e6eaed;box-shadow:0 4px 0 #101214';
            cl.onclick = function () { cancelAnimationFrame(raf); wrap.remove(); wrap = null; };
            nav.appendChild(cl);
            wrap.appendChild(nav);

            var simM = location.search.match(/[?&]sim=(\d+)/);
            if (simM) simOffset = Math.min(6000, parseInt(simM[1], 10));

            var last = performance.now();
            (function loop(now) {
                raf = requestAnimationFrame(loop);
                var dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                time += dt;
                updateSite();
                renderer.render(scene, camera);
            })(last);

            // орбита мышью
            var drag = false, ox = 0, oy = 0;
            var theta = Math.atan2(camera.position.x, camera.position.z);
            var radius = camera.position.length();
            var phi = Math.acos(camera.position.y / radius);
            renderer.domElement.addEventListener('pointerdown', function (e) { drag = true; ox = e.clientX; oy = e.clientY; });
            window.addEventListener('pointerup', function () { drag = false; });
            window.addEventListener('pointermove', function (e) {
                if (!drag) return;
                theta -= (e.clientX - ox) * 0.006;
                phi = Math.max(0.15, Math.min(1.45, phi - (e.clientY - oy) * 0.005));
                ox = e.clientX; oy = e.clientY;
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 14, 0);
            });
            renderer.domElement.addEventListener('wheel', function (e) {
                e.preventDefault();
                radius = Math.max(22, Math.min(160, radius + e.deltaY * 0.06));
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 14, 0);
            }, { passive: false });
        }).catch(function (e) {
            var d = el('div', null, 'Не загрузился 3D: ' + (e && e.message ? e.message : e));
            d.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)';
            wrap.appendChild(d);
        });
    }

    function addMenuButton() {
        var box2 = document.getElementById('left-menu-items');
        if (!box2 || document.getElementById('buildsite-btn')) return;
        var b = el('button', 'menu-btn', '🏗 Стройка из кубиков');
        b.id = 'buildsite-btn';
        b.setAttribute('data-tip', 'Стройка|Кран, леса, рабочие и дроны: Земля и Луна');
        b.onclick = function () { open('earth'); };
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box2) box2.insertBefore(b, anchor);
        else box2.appendChild(b);
    }

    window.BuildSite = { open: open };

    if (/[?&]site=/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(function () {
            var m = location.search.match(/[?&]site=(earth|moon)/);
            open(m ? m[1] : 'earth');
        }, 1400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
