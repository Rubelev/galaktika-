// Бой: визуализация дуэли + сводная матрица урона.
// ?combat=1 — сцена, &demo=1 — сразу запустить бой, &t=N — сдвиг анимации
(function () {
    'use strict';
    if (/[?&]safe=1/.test(location.search)) return;

    var THREE = null, scene = null, camera = null, renderer = null, wrap = null, raf = 0;
    var shipA = null, shipB = null, beams = [], sparks = [], shieldA = null, shieldB = null;
    var result = null, playing = false, playTime = 0, roundIdx = 0;
    var hudA = null, hudB = null, timeOffset = 0;

    function el(tag, cls, text) {
        var d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    function api(path, body, method) {
        return fetch(path, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        }).then(function (r) { return r.json().catch(function () { return {}; }); });
    }

    // ---------- сцена ----------
    function init() {
        if (wrap) wrap.remove();
        wrap = el('div');
        wrap.id = 'cb-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9880;background:#05080d;' +
            'font:13px Inter,system-ui,sans-serif;color:#dce8f7';
        document.body.appendChild(wrap);

        import('/lib/three/three.module.js').then(function (T) {
            THREE = T;
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            renderer.setSize(window.innerWidth, window.innerHeight);
            wrap.appendChild(renderer.domElement);

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x05080d);
            scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x1a1410, 0.7));
            var key = new THREE.DirectionalLight(0xfff2dd, 1.2);
            key.position.set(40, 30, 30);
            scene.add(key);
            var back = new THREE.DirectionalLight(0x5f8fb0, 0.5);
            back.position.set(-40, -10, -30);
            scene.add(back);

            // звёзды
            var g = new THREE.BufferGeometry(), n = 800, pos = new Float32Array(n * 3);
            for (var i = 0; i < n; i++) {
                var r = 160 + Math.random() * 240;
                var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
                pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
                pos[i * 3 + 1] = r * Math.cos(ph);
                pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
            }
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false })));

            // корабли
            shipA = window.Models3D && window.Models3D.buildShip
                ? window.Models3D.buildShip('plasma_lancer', THREE)
                : placeholder(3, 0x8fa4b4);
            shipB = window.Models3D && window.Models3D.buildShip
                ? window.Models3D.buildShip('grav_frigate', THREE)
                : placeholder(4, 0xb04a3c);
            shipA.position.set(-16, 0, 0);
            shipB.position.set(16, 0, 0);
            shipA.rotation.y = -Math.PI / 2;
            shipB.rotation.y = Math.PI / 2;
            scene.add(shipA);
            scene.add(shipB);

            // щиты — полупрозрачные сферы
            shieldA = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16),
                new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.08, depthWrite: false }));
            shieldA.position.copy(shipA.position);
            shieldB = shieldA.clone();
            shieldB.position.copy(shipB.position);
            scene.add(shieldA);
            scene.add(shieldB);

            camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.5, 900);
            camera.position.set(0, 18, 56);
            camera.lookAt(0, 0, 0);

            // HUD
            var hud = el('div');
            hud.style.cssText = 'position:absolute;left:0;right:0;top:0;padding:12px 14px;z-index:3;' +
                'display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;' +
                'background:linear-gradient(rgba(5,8,13,.94),rgba(5,8,13,0))';
            hud.innerHTML =
                '<div style="min-width:250px">' +
                '<div id="cb-a-name" style="color:#8fd6ff;font-weight:800">Атакующий</div>' +
                '<div id="cb-a-hull" style="height:10px;background:#1a2330;border-radius:4px;overflow:hidden;margin-top:4px">' +
                '<i style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#3ec97a,#ffd05a)"></i></div>' +
                '<div id="cb-a-sh" style="height:6px;background:#1a2330;border-radius:3px;overflow:hidden;margin-top:3px">' +
                '<i style="display:block;height:100%;width:100%;background:#3f93cc"></i></div>' +
                '<div id="cb-a-val" style="font:700 11.5px monospace;color:#9fb2c6;margin-top:3px"></div></div>' +
                '<div style="flex:1;text-align:center;min-width:140px">' +
                '<div id="cb-round" style="font:800 13px monospace;color:#ffd05a">раунд 0</div>' +
                '<div id="cb-result" style="font:800 14px Inter,sans-serif;margin-top:4px"></div></div>' +
                '<div style="min-width:250px;text-align:right">' +
                '<div id="cb-b-name" style="color:#ffb48a;font-weight:800">Защитник</div>' +
                '<div id="cb-b-hull" style="height:10px;background:#1a2330;border-radius:4px;overflow:hidden;margin-top:4px">' +
                '<i style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#ffd05a,#d84343)"></i></div>' +
                '<div id="cb-b-sh" style="height:6px;background:#1a2330;border-radius:3px;overflow:hidden;margin-top:3px">' +
                '<i style="display:block;height:100%;width:100%;background:#3f93cc"></i></div>' +
                '<div id="cb-b-val" style="font:700 11.5px monospace;color:#9fb2c6;margin-top:3px"></div></div>';
            wrap.appendChild(hud);

            // нижняя панель: матрица и запуск
            var nav = el('div');
            nav.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);' +
                'display:flex;gap:8px;z-index:4;flex-wrap:wrap;justify-content:center';
            var fight = el('button', null, '⚔ Провести бой');
            fight.style.cssText = 'padding:10px 16px;border:3px solid #101214;border-radius:10px;cursor:pointer;' +
                'font:800 13px Inter,sans-serif;background:linear-gradient(#ffe07a,#d8a41c);color:#2a1f00';
            fight.onclick = runFight;
            nav.appendChild(fight);

            var matrixBtn = el('button', null, '📊 Матрица урона');
            matrixBtn.style.cssText = 'padding:10px 16px;border:3px solid #101214;border-radius:10px;cursor:pointer;' +
                'font:800 13px Inter,sans-serif;background:#2b4a6e;color:#dce8f7';
            matrixBtn.onclick = matrix;
            nav.appendChild(matrixBtn);

            var close = el('button', null, '✕ Закрыть');
            close.style.cssText = 'padding:10px 16px;border:3px solid #101214;border-radius:10px;cursor:pointer;' +
                'font:800 13px Inter,sans-serif;background:#3b4348;color:#e6eaed';
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
                theta -= (e.clientX - px) * 0.006;
                phi = Math.max(0.1, Math.min(1.4, phi - (e.clientY - py) * 0.005));
                px = e.clientX; py = e.clientY;
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 0, 0);
            });
            renderer.domElement.addEventListener('wheel', function (e) {
                e.preventDefault();
                radius = Math.max(20, Math.min(180, radius + e.deltaY * 0.08));
                camera.position.set(radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi),
                    radius * Math.sin(phi) * Math.cos(theta));
                camera.lookAt(0, 0, 0);
            }, { passive: false });

            var tM = location.search.match(/[?&]t=(\d+)/);
            if (tM) timeOffset = parseInt(tM[1], 10);

            var last = performance.now();
            (function loop(now) {
                raf = requestAnimationFrame(loop);
                var dt = Math.min(0.05, (now - last) / 1000);
                last = now;
                step(dt);
                renderer.render(scene, camera);
            })(last);

            if (/[?&]demo=1/.test(location.search)) runFight();
        });
    }

    function placeholder(scale, color) {
        var g = new THREE.Group();
        var body = new THREE.Mesh(new THREE.BoxGeometry(4 * scale, 1.2 * scale, 1.6 * scale),
            new THREE.MeshLambertMaterial({ color: color }));
        g.add(body);
        return g;
    }

    // ---------- анимация боя ----------
    function runFight() {
        api('/api/combat/sim', {
            attacker: { ship: 'plasma_lancer', gun: 'laser', guns: 2 },
            defender: { ship: 'grav_frigate', gun: 'rail', guns: 2 }
        }).then(function (res) {
            if (!res || !res.log) return;
            result = res;
            playing = true;
            playTime = 0;
            roundIdx = 0;
            beams.forEach(function (b) { scene.remove(b.mesh); });
            beams = [];
            document.getElementById('cb-a-name').textContent = res.attacker.name + ' · ' + res.attacker.gunName + ' ×' + res.attacker.guns;
            document.getElementById('cb-b-name').textContent = res.defender.name + ' · ' + res.defender.gunName + ' ×' + res.defender.guns;
            paintBars(res.attacker, res.defender, res.attacker.hull, res.defender.hull);
            document.getElementById('cb-result').textContent = '';
        });
    }

    function paintBars(A, D, hullA, hullD) {
        var aPct = Math.max(0, Math.min(100, hullA / A.hull * 100));
        var dPct = Math.max(0, Math.min(100, hullD / D.hull * 100));
        document.querySelector('#cb-a-hull i').style.width = aPct + '%';
        document.querySelector('#cb-b-hull i').style.width = dPct + '%';
        document.getElementById('cb-a-val').textContent = 'корпус ' + Math.round(hullA) + ' / ' + Math.round(A.hull);
        document.getElementById('cb-b-val').textContent = 'корпус ' + Math.round(hullD) + ' / ' + Math.round(D.hull);
    }

    function beam(from, to, color) {
        var dir = new THREE.Vector3().subVectors(to, from);
        var len = dir.length();
        var geo = new THREE.CylinderGeometry(0.12, 0.12, len, 6);
        geo.translate(0, len / 2, 0);
        var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: 0.9
        }));
        mesh.position.copy(from);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        scene.add(mesh);
        beams.push({ mesh: mesh, life: 0.25 });
        return mesh;
    }

    function spark(at, color) {
        for (var i = 0; i < 8; i++) {
            var m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25),
                new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 }));
            m.position.copy(at);
            var v = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.3) * 10, (Math.random() - 0.5) * 14);
            scene.add(m);
            sparks.push({ mesh: m, v: v, life: 0.7 });
        }
    }

    function step(dt) {
        beams.forEach(function (b) {
            b.life -= dt;
            b.mesh.material.opacity = Math.max(0, b.life / 0.25) * 0.9;
            if (b.life <= 0) { scene.remove(b.mesh); }
        });
        beams = beams.filter(function (b) { return b.life > 0; });

        sparks.forEach(function (s) {
            s.life -= dt;
            s.mesh.position.addScaledVector(s.v, dt);
            s.mesh.material.opacity = Math.max(0, s.life / 0.7);
            if (s.life <= 0) scene.remove(s.mesh);
        });
        sparks = sparks.filter(function (s) { return s.life > 0; });

        if (!playing || !result) return;
        playTime += dt;
        var perRound = 0.55;
        var want = Math.floor((playTime + timeOffset) / perRound);
        while (roundIdx < want && roundIdx < result.log.length) {
            var e = result.log[roundIdx];
            var colorA = 0x8fd0ff, colorB = 0xffa04a;
            // залп атакующего
            if (e.attacker && e.attacker.hits > 0) {
                for (var i = 0; i < Math.min(4, e.attacker.hits); i++) {
                    setTimeout(function () { }, 0);
                    beam(shipA.position.clone().add(new THREE.Vector3(2, 0.5, 0)),
                        shipB.position.clone().add(new THREE.Vector3(-1, 0, 0)), colorA);
                }
                spark(shipB.position.clone(), 0x8fd0ff);
                if (e.attacker.shieldDmg > 0 && shieldB) shieldB.material.opacity = 0.35;
            }
            // ответ защитника
            if (e.defender && e.defender.hits > 0) {
                for (var j = 0; j < Math.min(4, e.defender.hits); j++) {
                    beam(shipB.position.clone().add(new THREE.Vector3(-2, 0.3, 0)),
                        shipA.position.clone().add(new THREE.Vector3(1, 0, 0)), colorB);
                }
                spark(shipA.position.clone(), 0xffa04a);
                if (e.defender.shieldDmg > 0 && shieldA) shieldA.material.opacity = 0.35;
            }
            if (e.attacker) paintBars(result.attacker, result.defender, result.attackerHull, e.attacker.targetHull);
            document.getElementById('cb-round').textContent = 'раунд ' + e.round;
            roundIdx++;
        }

        // затухание щитов
        if (shieldA) shieldA.material.opacity += (0.08 - shieldA.material.opacity) * dt * 3;
        if (shieldB) shieldB.material.opacity += (0.08 - shieldB.material.opacity) * dt * 3;

        if (roundIdx >= result.log.length) {
            playing = false;
            var txt = result.winner === 'attacker' ? '🏆 Победа атакующего'
                : result.winner === 'defender' ? '🏆 Победа защитника' : '⚖ Ничья';
            document.getElementById('cb-result').textContent = txt + ' · ' + result.rounds + ' раундов';
            paintBars(result.attacker, result.defender, result.attackerHull, result.defenderHull);
        }
    }

    // ---------- матрица ----------
    function matrix() {
        var old = document.getElementById('cb-matrix');
        if (old) old.remove();
        var box = el('div');
        box.id = 'cb-matrix';
        box.style.cssText = 'position:absolute;inset:0;background:rgba(4,7,11,.9);z-index:6;' +
            'display:flex;align-items:center;justify-content:center;padding:16px';
        var card = el('div');
        card.style.cssText = 'width:min(720px,96vw);max-height:92vh;overflow:auto;background:#0b1526;' +
            'border:2px solid #1e3a5f;border-radius:16px;padding:16px';
        card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
            '<b style="color:#8fd6ff;font-size:16px">📊 Матрица урона за раунд</b>' +
            '<button id="cb-mclose" style="padding:4px 10px;border:none;border-radius:8px;background:#2b3238;' +
            'color:#e6eaed;cursor:pointer">✕</button></div>' +
            '<div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap">' +
            '<label style="color:#9fb2c6">модернизация оружия' +
            '<input id="cb-up" type="range" min="0" max="3" value="0" style="vertical-align:middle;margin-left:6px"></label>' +
            '<label style="color:#9fb2c6">пушек' +
            '<input id="cb-guns" type="range" min="1" max="5" value="1" style="vertical-align:middle;margin-left:6px"></label>' +
            '<select id="cb-target" style="padding:6px;border-radius:7px;background:#0a1520;color:#dce8f7;border:1px solid #24405f">' +
            '<option value="balanced">смешанная цель</option>' +
            '<option value="shield">цель со щитом</option>' +
            '<option value="armor">цель в броне</option></select></div>' +
            '<div id="cb-table" style="font:13px monospace;color:#dce8f7"></div>';
        box.appendChild(card);
        wrap.appendChild(box);
        document.getElementById('cb-mclose').onclick = function () { box.remove(); };

        function draw() {
            var up = document.getElementById('cb-up').value;
            var guns = document.getElementById('cb-guns').value;
            var tgt = document.getElementById('cb-target').value;
            api('/api/combat/matrix?upgrade=' + up + '&guns=' + guns + '&target=' + tgt, null, 'GET')
                .then(function (res) {
                    var rows = res.rows || [];
                    var html = '<table style="width:100%;border-collapse:collapse">' +
                        '<tr style="color:#8fd6ff"><th style="text-align:left;padding:6px">пушка</th>' +
                        '<th>по щиту</th><th>по броне</th><th>по корпусу</th></tr>';
                    rows.forEach(function (r) {
                        html += '<tr style="border-top:1px solid #1e3a5f">' +
                            '<td style="padding:6px">' + r.gun + '</td>' +
                            '<td style="text-align:center;color:#8fd0ff">' + r.vsShield + '</td>' +
                            '<td style="text-align:center;color:#ffb48a">' + r.vsArmor + '</td>' +
                            '<td style="text-align:center;color:#3ec97a">' + r.vsHull + '</td></tr>';
                    });
                    html += '</table>';
                    document.getElementById('cb-table').innerHTML = html;
                });
        }
        document.getElementById('cb-up').oninput = draw;
        document.getElementById('cb-guns').oninput = draw;
        document.getElementById('cb-target').onchange = draw;
        draw();
    }

    function addMenuButton() {
        var box = document.getElementById('left-menu-items');
        if (!box || document.getElementById('cb-btn')) return;
        var b = el('button', 'menu-btn', '⚔ Бой');
        b.id = 'cb-btn';
        b.setAttribute('data-tip', 'Бой|Дуэль кораблей и матрица урона');
        b.onclick = init;
        var anchor = document.getElementById('settings-btn');
        if (anchor && anchor.parentNode === box) box.insertBefore(b, anchor);
        else box.appendChild(b);
    }

    window.Combat = { open: init, fight: runFight, matrix: matrix };

    if (/[?&]combat=1/.test(location.search)) {
        var st = document.createElement('style');
        st.textContent = '#welcome-screen,#auth-overlay,#legend-overlay,#tut-modal{display:none !important}';
        document.head.appendChild(st);
        setTimeout(init, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 1800); });
    } else setTimeout(addMenuButton, 1800);
    setInterval(addMenuButton, 4000);
})();
