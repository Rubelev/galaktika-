// Квест «Авария на станции» — вид от первого лица в комнате, собранной из блоков (three.js).
// Логика шагов и награды на сервере: reactor_start / reactor_step / reactor_hint.
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    // отсеки: позиция в комнате (x,z), угол поворота (yaw, рад)
    var STATIONS = [
        { id: 'gate', name: 'ШЛЮЗ', x: -7, z: -9, face: 0 },
        { id: 'gas', name: 'ВПРЫСК', x: -2.5, z: -9, face: 0 },
        { id: 'valve', name: 'КЛАПАН', x: 9.2, z: -3, face: -Math.PI / 2 },
        { id: 'coolant', name: 'ХЛАДАГЕНТ', x: -9.2, z: 2, face: Math.PI / 2 },
        { id: 'coil', name: 'КАТУШКА', x: 4.5, z: 9, face: Math.PI },
        { id: 'core', name: 'ЯДРО', x: -2, z: 9, face: Math.PI }
    ];

    var THREE = null;
    var renderer = null, scene = null, camera = null, raycaster = null;
    var consoleMeshes = [];
    var state = null;
    var yaw = 0, pitch = 0, keys = {};
    var wrapper = null, hud = null, prompt = null;

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined && text !== null) d.textContent = text;
        return d;
    }

    function token() {
        try { return localStorage.getItem('galaktika_token') || ''; } catch (e) { return ''; }
    }

    function api(path, body) {
        return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token() },
            body: JSON.stringify(body || {})
        }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }

    function toast(t) { if (typeof window.notify === 'function') window.notify(t); }

    function styles() {
        if (document.getElementById('rbx-style')) return;
        var s = document.createElement('style');
        s.id = 'rbx-style';
        s.textContent = [
            '.rq{position:fixed;inset:0;z-index:9800;background:#070b0e;font:13px Inter,system-ui,sans-serif;color:#e6eaed;'+
            'display:flex;align-items:center;justify-content:center}',
            '.rq canvas{display:block;width:100%;height:100%}',
            '.rq-hud{position:absolute;left:0;right:0;top:0;display:flex;gap:8px;align-items:center;padding:10px 12px;',
            'background:linear-gradient(rgba(8,12,16,.92),rgba(8,12,16,0));z-index:3;flex-wrap:wrap}',
            '.rq-chip{background:#23262a;border:2px solid #101214;border-radius:4px;padding:5px 10px;',
            'font:700 12px monospace;color:#d7dbdd;box-shadow:inset 0 0 8px rgba(0,0,0,.6)}',
            '.rq-chip b{color:#ffd05a}',
            '.rq-bar{flex:1;min-width:80px;height:12px;border-radius:3px;background:#1a1d20;border:2px solid #101214;overflow:hidden}',
            '.rq-bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#35c46b,#e0c12d,#d43a2c)}',
            '.rq-cross{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;z-index:3;',
            'pointer-events:none;border:2px solid rgba(255,255,255,.65);border-radius:50%}',
            '.rq-cross:after{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;',
            'background:#fff;border-radius:50%}',
            '.rq-cross.on{border-color:#ffd05a;box-shadow:0 0 14px rgba(255,208,90,.9)}',
            '.rq-prompt{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);z-index:4;padding:9px 18px;',
            'border:3px solid #101214;border-radius:8px;background:#2b3238;color:#9aa4ab;font-weight:800;',
            'letter-spacing:.04em;text-transform:uppercase;box-shadow:0 5px 0 #101214;font-size:13px}',
            '.rq-prompt.on{background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;cursor:pointer;',
            'animation:rqPulse 1.2s ease-in-out infinite}',
            '@keyframes rqPulse{0%,100%{box-shadow:0 5px 0 #101214,0 0 0 rgba(255,208,90,.4)}',
            '50%{box-shadow:0 5px 0 #101214,0 0 22px rgba(255,208,90,.8)}}',
            '.rq-btn{position:absolute;padding:9px 16px;border-radius:8px;border:3px solid #101214;cursor:pointer;',
            'font:800 13px Inter,system-ui,sans-serif;background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00;',
            'box-shadow:0 5px 0 #101214;z-index:4}',
            '.rq-hint{bottom:18px;right:14px}',
            '.rq-exit{bottom:18px;left:14px;background:#3b4348;color:#e6eaed}',
            '.rq-note{position:absolute;left:14px;bottom:74px;z-index:4;max-width:56%;background:rgba(10,14,18,.85);',
            'border:2px solid #101214;border-radius:6px;padding:7px 11px;font-size:12px;color:#cfd6da}',
            '.rq-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:6;width:min(540px,92vw);',
            'background:#151a1e;border:4px solid #101214;border-radius:12px;padding:20px;text-align:center}',
            '.rq-card h2{margin:0 0 8px;font-size:22px;color:#ffd05a}',
            '.rq-card p{margin:6px 0;color:#cfd6da;font-size:13.5px}',
            '.rq-stars{font-size:26px;letter-spacing:6px;color:#ffd05a;margin:8px 0}',
            '.rq-reward{margin:10px 0;padding:9px;border:2px solid #101214;border-radius:6px;background:#0e1317;',
            'font:700 13px monospace;color:#8cf7b6}',
            '.rq-body{padding:16px;text-align:center;background:#0b1014;border:4px solid #101214;border-radius:12px;',
            'width:min(560px,94vw)}',
            '.rq-body h2{margin:0 0 10px;color:#ff8a70;font-size:22px}',
            '.rq-body p{margin:6px 0;color:#cfd6da;font-size:13.5px;line-height:1.5}',
            '.rq-go{margin-top:14px;padding:11px 22px;border-radius:9px;border:3px solid #101214;cursor:pointer;',
            'font:800 14px Inter,system-ui,sans-serif;background:linear-gradient(#6cf0a8,#12c46b);color:#06231a;',
            'box-shadow:0 5px 0 #101214}'
        ].join('');
        document.head.appendChild(s);
    }

    // ---------- комната из блоков ----------
    function block(w, h, d, color, x, y, z, rotY) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
            new THREE.MeshLambertMaterial({ color: color }));
        m.position.set(x, y, z);
        if (rotY) m.rotation.y = rotY;
        return m;
    }

    function ledPanel(width, height, x, y, z, rotY) {
        var g = new THREE.Group();
        var base = block(width, height, 0.24, 0x22262a, 0, 0, 0);
        g.add(base);
        var cols = Math.max(4, Math.round(width / 0.22));
        var rows = Math.max(3, Math.round(height / 0.22));
        for (var i = 0; i < cols; i++) {
            for (var j = 0; j < rows; j++) {
                var palette = [0x35c46b, 0xd43a2c, 0xe0c12d, 0x3a8cd4, 0x2c3136];
                var c = palette[Math.floor(Math.random() * palette.length)];
                var led = block(0.12, 0.12, 0.06, c,
                    -width / 2 + 0.14 + i * (width - 0.28) / (cols - 1 || 1),
                    -height / 2 + 0.14 + j * (height - 0.28) / (rows - 1 || 1),
                    0.16);
                led.material.emissive = new THREE.Color(c);
                led.material.emissiveIntensity = 0.35;
                g.add(led);
            }
        }
        g.position.set(x, y, z);
        if (rotY) g.rotation.y = rotY;
        return g;
    }

    function labelSprite(text) {
        var cv = document.createElement('canvas');
        cv.width = 256; cv.height = 64;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = 'rgba(8,12,16,0.88)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.strokeStyle = '#3a4348';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 252, 60);
        ctx.fillStyle = '#e6eaed';
        ctx.font = 'bold 30px Inter, Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 34);
        var tex = new THREE.CanvasTexture(cv);
        var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
        spr.scale.set(2.6, 0.65, 1);
        return spr;
    }

    function buildConsole(st, isNext) {
        var g = new THREE.Group();
        // корпус
        g.add(block(2.0, 1.0, 0.8, 0x4a5157, 0, 0.5, 0));
        g.add(block(2.2, 0.12, 1.0, 0x2b3238, 0, 1.06, 0.06));
        // наклонная панель с индикаторами
        var panel = ledPanel(1.7, 0.7, 0, 1.35, 0.12);
        panel.rotation.x = -0.5;
        g.add(panel);
        // тумба и кабель
        g.add(block(1.8, 0.5, 0.6, 0x373f45, 0, 0.25, -0.1));
        g.add(block(0.12, 0.9, 0.12, 0x1b1f22, 0.8, 0.45, -0.2));
        // шильдик
        var spr = labelSprite(st.name);
        spr.position.set(0, 2.05, 0);
        g.add(spr);

        if (isNext) {
            var glow = block(2.1, 0.06, 1.0, 0xffd05a, 0, 1.12, 0.05);
            glow.material.emissive = new THREE.Color(0xffd05a);
            glow.material.emissiveIntensity = 0.9;
            g.add(glow);
        }

        g.position.set(st.x, 0, st.z);
        g.rotation.y = st.face;
        g.userData.station = st.id;
        g.traverse(function (n) { if (n.isMesh) n.userData.station = st.id; });
        return g;
    }

    function buildRoom() {
        var room = new THREE.Group();
        var W = 24, D = 24, H = 6;

        // пол
        var tileColors = [0xb8bec2, 0xaab0b4, 0xc2c8cc];
        for (var x = -W / 2; x < W / 2; x += 2) {
            for (var z = -D / 2; z < D / 2; z += 2) {
                var c = tileColors[(Math.abs(x + z) / 2) % 3 | 0];
                room.add(block(2, 0.2, 2, c, x + 1, -0.1, z + 1));
            }
        }
        // потолок с лампами
        room.add(block(W, 0.3, D, 0x2b3136, 0, H, 0));
        for (var lx = -8; lx <= 8; lx += 8) {
            for (var lz = -8; lz <= 8; lz += 8) {
                var lamp = block(4, 0.14, 1.2, 0xfffbe8, lx, H - 0.2, lz);
                lamp.material.emissive = new THREE.Color(0xfff6d8);
                lamp.material.emissiveIntensity = 1.1;
                room.add(lamp);
            }
        }
        // стены с панелями
        var wallColor = 0x9aa2a8;
        room.add(block(W, H, 0.4, wallColor, 0, H / 2, -D / 2));
        room.add(block(W, H, 0.4, wallColor, 0, H / 2, D / 2));
        room.add(block(0.4, H, D, wallColor, -W / 2, H / 2, 0));
        room.add(block(0.4, H, D, wallColor, W / 2, H / 2, 0));

        // приборные щиты на стенах
        for (var px = -9; px <= 9; px += 4.5) {
            room.add(ledPanel(3.2, 1.6, px, 3.4, -D / 2 + 0.25));
            room.add(ledPanel(3.2, 1.6, px, 3.4, D / 2 - 0.25));
        }

        // трубы по потолку
        for (var pz = -8; pz <= 8; pz += 8) {
            var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, D - 1, 10),
                new THREE.MeshLambertMaterial({ color: 0x7d868c }));
            pipe.rotation.x = Math.PI / 2;
            pipe.position.set(-10, H - 0.7, pz);
            room.add(pipe);
        }

        // аварийная подсветка
        var red = new THREE.PointLight(0xff4a32, 1.6, 26);
        red.position.set(0, H - 1, 0);
        room.add(red);

        // отсеки
        STATIONS.forEach(function (st) {
            var next = state && !state.done.length && st.id === STATIONS[0].id;
            room.add(buildConsole(st, next));
        });

        // ящики и огнетушители для «обжитости»
        [[-10, -6], [-10, 6], [10, 5]].forEach(function (p) {
            room.add(block(1.2, 1.2, 1.2, 0x6d777e, p[0], 0.6, p[1]));
            room.add(block(1.2, 0.12, 1.2, 0x8d979e, p[0], 1.24, p[1]));
        });

        return room;
    }

    var fx = { smoke: [], sparks: [], alarmLight: null, vignette: null, leak: null };

    function buildEffects(room) {
        // пар из лопнувшей трубы у контура охлаждения
        var steamMat = new THREE.MeshLambertMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.55 });
        for (var i = 0; i < 30; i++) {
            var puff = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), steamMat.clone());
            puff.position.set(-8.9 + Math.random() * 0.5, 2.4 + Math.random() * 1.6, 2 + Math.random() * 0.5);
            puff.userData.life = Math.random();
            puff.userData.speed = 0.16 + Math.random() * 0.22;
            room.add(puff);
            fx.smoke.push(puff);
        }

        // искры у магнитной катушки и ядра
        var sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd05a });
        [[4.5, 1.6, 9], [-2, 1.6, 9], [-9.2, 1.7, 2]].forEach(function (pos) {
            for (var j = 0; j < 8; j++) {
                var sp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), sparkMat.clone());
                sp.position.set(pos[0] + (Math.random() - 0.5) * 0.7, pos[1] + 0.3 + Math.random() * 0.6,
                    pos[2] + (Math.random() - 0.5) * 0.7);
                sp.userData.vy = 0.6 + Math.random() * 1.4;
                sp.userData.life = Math.random();
                room.add(sp);
                fx.sparks.push(sp);
            }
        });

        // аварийная лампа на стене
        var alarmBox = block(1.1, 0.5, 0.3, 0x8e1d17, 0, 4.4, -10.6);
        room.add(alarmBox);
        var alarm = new THREE.PointLight(0xff3b25, 1.2, 18, 2);
        alarm.position.set(0, 4.4, -10.2);
        room.add(alarm);
        fx.alarmLight = alarm;

        // красная винт-подсветка по краям экрана (в HTML)
        var vig = document.createElement('div');
        vig.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2;' +
            'box-shadow:inset 0 0 120px 30px rgba(220,40,25,0.0);transition:box-shadow .4s';
        var w = document.getElementById('rq-wrap');
        if (w) w.appendChild(vig);
        fx.vignette = vig;
    }

    function updateEffects(t, leftSec) {
        // пар поднимается и растворяется
        fx.smoke.forEach(function (p) {
            p.position.y += p.userData.speed * 0.06;
            var k = (p.position.y - 2.2) / 3.2;
            p.material.opacity = Math.max(0, 0.42 * (1 - k));
            p.scale.setScalar(1 + k * 0.9);
            p.rotation.y += 0.01;
            if (p.position.y > 4.8) {
                p.position.y = 2.4;
                p.scale.setScalar(1);
                p.material.opacity = 0.42;
            }
        });
        // искры прыгают
        fx.sparks.forEach(function (sp) {
            sp.position.y += sp.userData.vy * 0.02;
            sp.userData.vy -= 0.04;
            sp.material.opacity = 1;
            if (sp.position.y < 1.2) {
                sp.position.y = 1.6 + Math.random() * 0.5;
                sp.userData.vy = 0.6 + Math.random() * 1.4;
            }
            sp.visible = Math.random() > 0.15;
        });
        // мигание: чем меньше времени, тем чаще
        var hz = leftSec > 60 ? 1.1 : (leftSec > 30 ? 2.2 : 4);
        var on = Math.sin(t * hz * Math.PI) > 0;
        if (fx.alarmLight) fx.alarmLight.intensity = on ? 1.6 : 0.25;
        if (fx.vignette) {
            var danger = Math.max(0, Math.min(1, 1 - leftSec / 60));
            fx.vignette.style.boxShadow = 'inset 0 0 120px ' + (20 + danger * 60) + 'px rgba(220,40,25,' +
                (0.10 + danger * (on ? 0.38 : 0.12)).toFixed(2) + ')';
        }
    }

    function initThree(holder) {
        return import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0b1014);
            scene.fog = new THREE.Fog(0x0b1014, 18, 42);

            scene.add(new THREE.HemisphereLight(0xffffff, 0x2b3136, 0.75));
            var dir = new THREE.DirectionalLight(0xfff4e0, 0.75);
            dir.position.set(8, 14, 6);
            dir.castShadow = true;
            dir.shadow.mapSize.set(1024, 1024);
            dir.shadow.camera.left = -16;
            dir.shadow.camera.right = 16;
            dir.shadow.camera.top = 16;
            dir.shadow.camera.bottom = -16;
            dir.shadow.camera.near = 1;
            dir.shadow.camera.far = 40;
            dir.shadow.bias = -0.0015;
            scene.add(dir);

            // точечные лампы под потолком — дают пятна света на полу
            [[-6, -6], [6, -6], [-6, 6], [6, 6]].forEach(function (p) {
                var lampLight = new THREE.PointLight(0xfff0d0, 0.55, 16, 2);
                lampLight.position.set(p[0], 5.4, p[1]);
                scene.add(lampLight);
            });

            var room = buildRoom();
            buildEffects(room);
            room.traverse(function (n) {
                if (n.isMesh) {
                    n.castShadow = true;
                    n.receiveShadow = true;
                }
            });
            scene.add(room);
            consoleMeshes = [];
            room.traverse(function (n) { if (n.isMesh && n.userData.station) consoleMeshes.push(n); });

            camera = new THREE.PerspectiveCamera(72, holder.clientWidth / holder.clientHeight, 0.1, 200);
            camera.position.set(0, 1.7, 9.5);
        // параметры для съёмки кадров: ?px=..&pz=..&yaw=..&pitch=..
        var mm = location.search.match(/[?&]px=(-?\d+(?:\.\d+)?)/);
        if (mm) camera.position.x = parseFloat(mm[1]);
        mm = location.search.match(/[?&]pz=(-?\d+(?:\.\d+)?)/);
        if (mm) camera.position.z = parseFloat(mm[1]);
        mm = location.search.match(/[?&]yaw=(-?\d+(?:\.\d+)?)/);
        if (mm) yaw = parseFloat(mm[1]) * Math.PI / 180;
        mm = location.search.match(/[?&]pitch=(-?\d+(?:\.\d+)?)/);
        if (mm) pitch = parseFloat(mm[1]) * Math.PI / 180;
            camera.rotation.order = 'YXZ';

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.setSize(holder.clientWidth, holder.clientHeight);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            holder.appendChild(renderer.domElement);

            raycaster = new THREE.Raycaster();
            bindInput(renderer.domElement);
            animate();
        });
    }

    function animate() {
        if (!renderer) return;
        requestAnimationFrame(animate);
        // движение
        var speed = 0.09;
        var forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        var right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        if (keys.w) camera.position.addScaledVector(forward, speed);
        if (keys.s) camera.position.addScaledVector(forward, -speed);
        if (keys.a) camera.position.addScaledVector(right, -speed);
        if (keys.d) camera.position.addScaledVector(right, speed);
        // не выходим из комнаты
        camera.position.x = Math.max(-10.8, Math.min(10.8, camera.position.x));
        camera.position.z = Math.max(-10.8, Math.min(10.8, camera.position.z));
        camera.position.y = 1.7;

        camera.rotation.y = yaw;
        camera.rotation.x = pitch;

        focusCheck();
        if (state && !state.over) {
            var leftSec = Math.max(0, state.limit - (Date.now() - state.started) / 1000);
            updateEffects(Date.now() / 1000, leftSec);
        }
        renderer.render(scene, camera);
    }

    function focusCheck() {
        if (!raycaster || !camera) return;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        var hits = raycaster.intersectObjects(consoleMeshes, false);
        var target = hits.length && hits[0].distance < 6 ? hits[0].object.userData.station : null;
        if (target !== focusId) {
            focusId = target;
            updatePrompt();
        }
    }

    var focusId = null;

    function updatePrompt() {
        var p = document.getElementById('rq-prompt');
        var cross = document.getElementById('rq-cross');
        if (!p) return;
        var st = STATIONS.filter(function (s) { return s.id === focusId; })[0];
        if (st) {
            p.textContent = 'ВЗАИМОДЕЙСТВОВАТЬ: ' + st.name + ' (E)';
            p.classList.add('on');
            if (cross) cross.classList.add('on');
        } else {
            p.textContent = 'НАВЕДИТЕ ПРИЦЕЛ НА ПУЛЬТ';
            p.classList.remove('on');
            if (cross) cross.classList.remove('on');
        }
    }

    function bindInput(canvas) {
        var drag = false, lx = 0, ly = 0;
        canvas.addEventListener('pointerdown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; });
        window.addEventListener('pointerup', function () { drag = false; });
        window.addEventListener('pointermove', function (e) {
            if (!drag) return;
            yaw -= (e.clientX - lx) * 0.004;
            pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - ly) * 0.003));
            lx = e.clientX; ly = e.clientY;
        });
        document.addEventListener('keydown', function (e) {
            var k = e.key.toLowerCase();
            if (['w', 'a', 's', 'd', 'ц', 'ф', 'ы', 'в', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) {
                if (k === 'arrowup') keys.w = true;
                else if (k === 'arrowdown') keys.s = true;
                keys[k] = true;
                e.preventDefault();
            }
            if (k === 'e' || k === 'у') { if (focusId) pick(focusId); e.preventDefault(); }
        });
        document.addEventListener('keyup', function (e) {
            var k = e.key.toLowerCase();
            keys[k] = false;
            if (k === 'arrowup') keys.w = false;
            if (k === 'arrowdown') keys.s = false;
        });
    }

    // ---------- звук (WebAudio, без файлов) ----------
    var AU = { ctx: null, hum: null, humGain: null, enabled: true };

    function audioInit() {
        if (AU.ctx) return AU.ctx;
        try {
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return null;
            AU.ctx = new Ctx();
        } catch (e) { return null; }
        return AU.ctx;
    }

    function humStart() {
        var ctx = audioInit();
        if (!ctx || AU.hum) return;
        var osc = ctx.createOscillator();
        var osc2 = ctx.createOscillator();
        var gain = ctx.createGain();
        var filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc2.type = 'sine';
        osc.frequency.value = 58;
        osc2.frequency.value = 117;
        filter.type = 'lowpass';
        filter.frequency.value = 240;
        gain.gain.value = 0.0;
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc2.start();
        gain.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 1.2);
        AU.hum = { osc: osc, osc2: osc2 };
        AU.humGain = gain;
    }

    function humStop() {
        if (!AU.ctx || !AU.humGain) return;
        try {
            AU.humGain.gain.linearRampToValueAtTime(0, AU.ctx.currentTime + 0.4);
            setTimeout(function () {
                try { AU.hum.osc.stop(); AU.hum.osc2.stop(); } catch (e) { }
                AU.hum = null; AU.humGain = null;
            }, 500);
        } catch (e) { }
    }

    function beep(freq, dur, type, vol) {
        var ctx = audioInit();
        if (!ctx) return;
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = type || 'square';
        o.frequency.value = freq;
        g.gain.value = 0;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        g.gain.linearRampToValueAtTime(vol || 0.08, ctx.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        o.stop(ctx.currentTime + dur + 0.02);
    }

    function sfxClick() { beep(760, 0.07, 'square', 0.06); setTimeout(function () { beep(1180, 0.05, 'square', 0.04); }, 55); }
    function sfxOk() { beep(660, 0.09, 'triangle', 0.07); setTimeout(function () { beep(990, 0.12, 'triangle', 0.06); }, 90); }
    function sfxWin() { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { beep(f, 0.22, 'triangle', 0.08); }, i * 130); }); }
    function sfxFail() {
        var ctx = audioInit();
        if (!ctx) return;
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(880, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(160, ctx.currentTime + 1.1);
        g.gain.value = 0.09;
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 1.2);
    }

    // ---------- экраны ----------
    function card(html) {
        var w = document.getElementById('rq-wrap');
        if (!w) return;
        var box = el('div');
        box.className = 'rq-card';
        box.innerHTML = html;
        w.appendChild(box);
        return box;
    }

    function brief() {
        styles();
        var wrap = el('div');
        wrap.className = 'rq';
        wrap.id = 'rq-wrap';
        var body = el('div', 'rq-body');
        body.innerHTML = '<h2>🚨 АВАРИЯ НА СТАНЦИИ</h2>' +
            '<p>Реактор теряет контроль. Экипаж эвакуирован, вы — последний инженер на борту.</p>' +
            '<p><b>WASD</b> — идти, <b>мышь</b> — осматриваться, <b>E</b> — пульт в прицеле.</p>' +
            '<p>Порядок действий зависит от аварии. 120 секунд и 100 мЗв на скафандр.</p>' +
            '<button class="rq-go" id="rq-go">ПОЕХАЛИ!</button>';
        wrap.appendChild(body);
        document.body.appendChild(wrap);
        document.getElementById('rq-go').onclick = function () { wrap.remove(); start(); };
    }

    function start() {
        api('/api/reactor/start').then(function (res) {
            if (!res || res.error) { toast(res && res.error ? res.error : 'станция недоступна'); return; }
            state = {
                token: res.token, limit: res.limit || 120, started: Date.now(),
                done: [], title: res.title, briefText: res.brief, over: false
            };
            room();
            humStart();
            state.timer = setInterval(tick, 250);
        });
    }

    var demoDone = 0;

    function room() {
        styles();
        wrapper = el('div');
        wrapper.className = 'rq';
        wrapper.id = 'rq-wrap';

        hud = el('div', 'rq-hud');
        hud.id = 'rq-hud';
        wrapper.appendChild(hud);

        wrapper.appendChild(el('div', 'rq-cross')).id = 'rq-cross';

        prompt = el('div', 'rq-prompt', 'НАВЕДИТЕ ПРИЦЕЛ НА ПУЛЬТ');
        prompt.id = 'rq-prompt';
        prompt.onclick = function () { if (focusId) pick(focusId); };
        wrapper.appendChild(prompt);

        var note = el('div', 'rq-note', (state.title || 'Авария') + ' — ' + (state.briefText || ''));
        wrapper.appendChild(note);

        var hint = el('button', 'rq-btn rq-hint', '💡 ПОДСКАЗКА −10с');
        hint.onclick = askHint;
        wrapper.appendChild(hint);

        var exit = el('button', 'rq-btn rq-exit', '← Выйти');
        exit.onclick = function () { teardown(); };
        wrapper.appendChild(exit);

        document.body.appendChild(wrapper);
        initThree(wrapper).then(function () {
            paintHud();
        }).catch(function (e) {
            var body = el('div', 'rq-body', 'Не загрузился 3D-движок: ' + (e && e.message ? e.message : e));
            wrapper.appendChild(body);
        });
    }

    function teardown() {
        humStop();
        if (state && state.timer) clearInterval(state.timer);
        if (renderer) { renderer.dispose(); renderer = null; }
        scene = null; camera = null; raycaster = null; consoleMeshes = [];
        state = null;
        var w = document.getElementById('rq-wrap');
        if (w) w.remove();
    }

    function paintHud() {
        var h = document.getElementById('rq-hud');
        if (!h || !state) return;
        var left = Math.max(0, Math.round(state.limit - (Date.now() - state.started) / 1000));
        var dose = Math.round((Date.now() - state.started) / 1000 * 0.8);
        var suit = Math.max(0, 100 - Math.round(dose));
        h.innerHTML = '<div class="rq-chip">⏱ <b>' + left + '</b> с</div>' +
            '<div class="rq-chip">☢ <b>' + dose + '</b> мЗв</div>' +
            '<div class="rq-chip">🛡 <b>' + suit + '%</b></div>' +
            '<div class="rq-bar"><i style="width:' + Math.max(0, Math.min(100, left / state.limit * 100)) + '%"></i></div>' +
            '<div class="rq-chip">ШАГ <b>' + Math.min(state.done.length + 1, STATIONS.length) + '/' + STATIONS.length + '</b></div>';
    }

    function tick() {
        if (!state || state.over) return;
        var secs = (Date.now() - state.started) / 1000;
        paintHud();
        if (secs >= state.limit) { fail('Время вышло: станция потеряна'); return; }
        if (secs * 0.8 >= 100) { fail('Скафандр не выдержал радиации'); }
    }

    function pick(id) {
        if (!state || state.over) return;
        if (state.done.indexOf(id) >= 0) { toast('Этот отсек уже починен'); return; }
        api('/api/reactor/step', { token: state.token, step: id }).then(function (res) {
            if (!res || res.error) { fail((res && res.error) || 'плазма вырвалась'); return; }
            sfxClick();
            state.done.push(id);
            if (typeof window.notify === 'function') {
                var st = STATIONS.filter(function (s) { return s.id === id; })[0];
                window.notify('✓ ' + (st ? st.name : id) + ' — готово');
            }
            paintHud();
            if (res.finished) win(res.reward, res.elapsed);
            else sfxOk();
        });
    }

    function askHint() {
        if (!state || state.over) return;
        api('/api/reactor/hint', { token: state.token }).then(function (res) {
            if (!res || res.error) { toast((res && res.error) || 'подсказка недоступна'); return; }
            state.started -= 10000;
            var st = STATIONS.filter(function (s) { return s.id === res.next; })[0];
            if (st && typeof window.notify === 'function') {
                window.notify('Следующий отсек: ' + st.name + ' (−10 с)');
            }
            if (st && scene) {
                var glow = block(2.4, 0.1, 1.2, 0xffd05a, st.x, 1.2, st.z);
                glow.material.emissive = new THREE.Color(0xffd05a);
                glow.material.emissiveIntensity = 1.2;
                glow.rotation.y = st.face;
                scene.add(glow);
            }
            paintHud();
        });
    }

    function win(reward, elapsed) {
        if (!state || state.over) return;
        state.over = true;
        if (state.timer) clearInterval(state.timer);
        humStop();
        sfxWin();
        var grade = reward ? reward.grade : '';
        var stars = grade === 'S' ? '★★★' : (grade === 'A' ? '★★☆' : '★☆☆');
        var box = card('<h2>РЕАКТОР СТАБИЛЕН!</h2>' +
            '<div class="rq-stars">' + stars + '</div>' +
            '<p>Реакция остановлена, давление сброшено, контур охлаждён.</p>' +
            '<p>Станция починена за ' + Math.round(elapsed) + ' с.</p>' +
            (reward ? '<div class="rq-reward">+' + reward.energy + ' энергии · +' +
                reward.credits.toLocaleString('ru-RU') + ' кр · +' + reward.crystals + ' кристалла</div>' : '') +
            '<button class="rq-go" id="rq-done">ЗАБРАТЬ НАГРАДУ</button>');
        document.getElementById('rq-done').onclick = function () {
            teardown();
            if (typeof window.pullServerProfile === 'function') window.pullServerProfile();
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
        };
    }

    function fail(reason) {
        if (!state || state.over) return;
        state.over = true;
        if (state.timer) clearInterval(state.timer);
        humStop();
        sfxFail();
        var box = card('<h2>СТАНЦИЯ ПОТЕРЯНА</h2>' +
            '<p>' + (reason || 'Что-то пошло не так.') + '</p>' +
            '<p>Следующая попытка — через 30 минут.</p>' +
            '<button class="rq-go" id="rq-fail">ПОНЯТНО</button>');
        document.getElementById('rq-fail').onclick = function () { teardown(); };
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('reactor-btn')) return;
        var b = el('button', 'menu-btn', '🚨 Авария на станции');
        b.id = 'reactor-btn';
        b.setAttribute('data-tip', 'Авария|Первый взгляд изнутри: починить реактор за 120 секунд');
        b.onclick = brief;
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Reactor = { open: brief };

    if (/[?&]reactor=1/.test(location.search)) {
        setTimeout(function () {
            ['welcome-screen', 'auth-overlay', 'legend-overlay', 'tut-modal'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
            var q = location.search;
            var doneCount = parseInt((q.match(/[?&]done=(\d+)/) || [])[1] || '0', 10);
            var endMode = (q.match(/[?&]end=(win|fail)/) || [])[1] || '';
            if (/[?&]hold=1/.test(q)) { brief(); return; }
            state = {
                token: 'demo', limit: 120, started: Date.now() - 20000,
                done: ['gate', 'gas', 'valve', 'coolant', 'coil', 'core'].slice(0, Math.max(0, Math.min(6, doneCount))),
                title: 'Перегрев контура', briefText: 'Температура в первом контуре растёт: 2 400 °C и выше.',
                over: false
            };
            room();
            if (endMode === 'win') setTimeout(function () { win({ energy: 800, credits: 30000, crystals: 3, grade: 'S' }, 38); }, 500);
            else if (endMode === 'fail') setTimeout(function () { fail('Неверный порядок: плазма вырвалась'); }, 500);
            else state.timer = setInterval(tick, 400);
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
