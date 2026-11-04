// ============================================================================
//  STATION-TOUR.JS — слайд-шоу станции от первого лица (?tour=1).
//  Камера на высоте глаз идёт по станции: ангар → коридор → гидропоника →
//  терминал → щитовая → купол. Каждый кадр — реальная 3D-сцена, не картинка.
//  Управление: пробел — пауза, ← → — кадр, Esc — выход.
// ============================================================================
(function () {
    'use strict';
    if (!new URLSearchParams(location.search).has('tour')) return;

    // THREE во всём проекте — ES-модуль из /lib/three/three.module.js.
    // Раньше тур ждал window.THREE и потому не запускался вовсе.
    import('/lib/three/three.module.js')
        .then(function (mod) { boot(mod); })
        .catch(function () { import('/lib/three/three.module.js?v=2').then(function (m) { boot(m); }).catch(function () { document.title = 'TOUR нет THREE'; }); });

    function boot(THREE) {

    const EYE = 1.7;                 // высота глаз, м
    const HOLD_MS = 7000;            // сколько кадр держится

    const STOPS = [
        { name: 'Ангар', text: 'Стыковочный узел. Прибытие на станцию.', eye: [0, EYE, 26], look: [0, 1.4, 10] },
        { name: 'Коридор', text: 'Главный коридор: свет, трубы, вентиляция.', eye: [0, EYE, 12], look: [0, 1.5, -4] },
        { name: 'Гидропоника', text: 'Гидропонный отсек: стеллажи под grow-lights.', eye: [-4.6, EYE, 2], look: [-6.4, 1.2, -1] },
        { name: 'Терминал', text: 'Пост управления: главный терминал станции.', eye: [4.2, EYE, 4], look: [6.2, 1.3, 1] },
        { name: 'Щитовая', text: 'Щитовая: питание и аварийные контуры.', eye: [0, EYE, -12], look: [0, 1.2, -16] },
        { name: 'Купол', text: 'Купол обзора: снаружи — кольца и пояс.', eye: [0, EYE, -22], look: [0, 2.4, -30] }
    ];

    document.body.innerHTML = '';
    // тур полноэкранный: убираем игровые панели, которые дописывают другие модули
    function hideGameUi() {
        ['#left-menu', '#race-legend', '#race-panel', '.top-bar', '#auth-container', '#perf-overlay',
         '#players-online-hud', '#catalog-stats', '.legend-overlay', '#mentor-panel', '#onb-panel']
            .forEach(function (sel) {
                document.querySelectorAll(sel).forEach(function (el) { el.style.display = 'none'; });
            });
    }
    hideGameUi();
    setInterval(hideGameUi, 500);

    document.body.style.cssText = 'margin:0;overflow:hidden;background:#05070c';

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.Fog(0x05070c, 22, 60);

    const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);

    // ---- свет ----
    scene.add(new THREE.AmbientLight(0x99aac4, 1.15));
    scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x151a22, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0dd, 0.8);
    sun.position.set(6, 12, 8);
    scene.add(sun);
    for (let z = -26; z <= 26; z += 8) {
        const lamp = new THREE.PointLight(0xbfe0ff, 1.35, 20, 1.6);
        lamp.position.set(0, 3.1, z);
        scene.add(lamp);
    }

    // ---- материалы ----
    const mat = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
    const floorM = mat(0x2b303a), wallM = mat(0x353c47), ceilM = mat(0x1e232b);
    const pipeM = mat(0x6c7787), crateM = mat(0x4a5a48), rackM = mat(0x3d5a3f);
    const glowM = new THREE.MeshBasicMaterial({ color: 0x8fe3a8 });
    const warnM = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const panelM = new THREE.MeshBasicMaterial({ color: 0x8fd6ff });

    function box(w, h, d, m, x, y, z, ry) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        if (ry) mesh.rotation.y = ry;
        scene.add(mesh);
        return mesh;
    }

    // ---- оболочка: пол, стены, потолок (коридор вдоль Z) ----
    box(10, 0.3, 64, floorM, 0, 0, 0);
    box(10, 0.3, 64, ceilM, 0, 3.4, 0);
    box(0.3, 3.4, 64, wallM, -5, 1.7, 0);
    box(0.3, 3.4, 64, wallM, 5, 1.7, 0);

    // рёбра и трубы
    for (let z = -30; z <= 30; z += 4) {
        box(10, 0.16, 0.16, pipeM, 0, 3.2, z);
        box(0.12, 0.12, 1.2, warnM, -4.7, 2.8, z + 1);
    }
    box(0.35, 0.35, 62, pipeM, -4.5, 2.9, 0);
    box(0.28, 0.28, 62, pipeM, 4.5, 3.0, 0);

    // ---- ангар: ящики и стыковочный шлюз ----
    for (let i = 0; i < 6; i++) {
        box(1.2, 1.0, 1.2, crateM, -3.6 + (i % 2) * 1.6, 0.65, 22 - Math.floor(i / 2) * 1.8);
    }
    box(3.2, 2.6, 0.4, mat(0x2f3a4a), 0, 1.3, 29);
    box(2.4, 0.16, 0.1, warnM, 0, 2.5, 28.8);

    // ---- гидропоника (слева): стеллажи под лампами ----
    for (let i = 0; i < 3; i++) {
        const z = 4 - i * 3.2;
        box(1.8, 2.4, 0.25, rackM, -6.4, 1.2, z);
        for (let lvl = 0; lvl < 3; lvl++) {
            box(1.7, 0.12, 0.7, mat(0x2f4a35), -6.4, 0.6 + lvl * 0.75, z);
            box(1.5, 0.06, 0.5, glowM, -6.4, 0.68 + lvl * 0.75, z);
        }
        box(0.1, 0.1, 1.6, panelM, -5.6, 2.9, z);
    }

    // ---- терминал (справа) ----
    box(2.2, 0.9, 0.9, mat(0x39424f), 6.2, 0.45, 1);
    box(1.6, 0.9, 0.12, panelM, 6.2, 1.5, 0.4);
    box(0.16, 0.9, 0.16, pipeM, 5.6, 1.1, 0.6);
    box(0.16, 0.9, 0.16, pipeM, 6.8, 1.1, 0.6);

    // ---- щитовая: РУБИЛЬНИКИ, которые надо переключить действием ----
    box(3.0, 2.0, 0.3, mat(0x333a45), 0, 1.2, -16);
    const SWITCHES = [];
    for (let i = 0; i < 4; i++) {
        const x = -1.05 + i * 0.7;
        box(0.5, 0.5, 0.08, mat(0x2a303a), x, 1.1, -15.8);          // корпус
        const lamp = box(0.5, 0.14, 0.06, new THREE.MeshBasicMaterial({ color: 0xff5a5a }), x, 1.62, -15.76);
        // рукоятка на оси: группа вращается вокруг основания
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.95, -15.72);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.09), mat(0xd8dee8));
        arm.position.set(0, 0.31, 0);
        pivot.add(arm);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), mat(0xffd166));
        knob.position.set(0, 0.62, 0);
        pivot.add(knob);
        pivot.rotation.x = -0.55;                                    // выключен: рукоятка вниз
        scene.add(pivot);
        const sw = { id: i + 1, pivot: pivot, lamp: lamp, knob: knob, on: false, x: x };
        pivot.userData.switchRef = sw;
        SWITCHES.push(sw);
    }
    box(0.2, 0.2, 2.6, pipeM, -2.6, 2.2, -14);

    // ---- купол: окно наружу ----
    box(4.2, 2.4, 0.2, new THREE.MeshBasicMaterial({ color: 0x0d1524 }), 0, 1.7, -30);
    const stars = new THREE.Points(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(
            Array.from({ length: 900 }, () => (Math.random() - 0.5) * 6).map((v, i) => v), 3)),
        new THREE.PointsMaterial({ color: 0xcfe4ff, size: 0.04 })
    );
    stars.position.set(0, 1.9, -31.6);
    scene.add(stars);

    // ---- подписи кадра ----
    const cap = document.createElement('div');
    cap.id = 'tour-caption';
    cap.style.cssText = 'position:fixed;left:28px;bottom:28px;max-width:560px;color:#e8eef8;' +
        'font:15px/1.5 Inter,system-ui,sans-serif;text-shadow:0 2px 10px rgba(0,0,0,.9)';
    document.body.appendChild(cap);
    const bar = document.createElement('div');
    bar.id = 'tour-bar';
    bar.style.cssText = 'position:fixed;left:0;bottom:0;height:3px;background:#ffd166;width:0';
    document.body.appendChild(bar);
    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;right:24px;bottom:24px;color:#9fb2c6;font:11px ui-monospace,monospace';
    hint.textContent = 'пробел — пауза · ← → — кадр · Esc — выход';
    document.body.appendChild(hint);

    // прицел и HUD рубильников
    const cross = document.createElement('div');
    cross.id = 'tour-cross';
    cross.style.cssText = 'position:fixed;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;' +
        'border:1px solid #ffd166;border-radius:50%;opacity:.75;pointer-events:none';
    document.body.appendChild(cross);
    const swHud = document.createElement('div');
    swHud.id = 'tour-switches';
    swHud.style.cssText = 'position:fixed;left:28px;top:24px;color:#e8eef8;font:13px/1.5 ui-monospace,monospace;' +
        'background:rgba(8,14,24,.72);border:1px solid rgba(255,209,102,.35);border-radius:9px;padding:8px 12px;display:none';
    document.body.appendChild(swHud);

    const raycaster = new THREE.Raycaster();
    const centerVec = new THREE.Vector2(0, 0);
    let focused = null;

    function updateSwitchesHud() {
        const on = SWITCHES.filter(function (s2) { return s2.on; }).length;
        const shieldIdx = STOPS.findIndex(function (st) { return st.name === 'Щитовая'; });
        swHud.style.display = (idx === shieldIdx) ? 'block' : 'none';
        if (idx !== shieldIdx) return;
        swHud.innerHTML = '<div style="color:#ffd166;font-weight:700">РУБИЛЬНИКИ: ' + on + '/' + SWITCHES.length + '</div>' +
            (on === SWITCHES.length
                ? '<div style="color:#8fe3a8">Питание включено. Можно идти дальше.</div>'
                : '<div>Наведи прицел и нажми <b>E</b> или кликни — переключить контур.</div>');
    }

    function focusSwitch() {
        raycaster.setFromCamera(centerVec, camera);
        const targets = [];
        SWITCHES.forEach(function (s2) { s2.pivot.children.forEach(function (c) { targets.push(c); }); });
        const hits = raycaster.intersectObjects(targets, false);
        let found = null;
        if (hits.length && hits[0].distance < 4.2) {
            let obj = hits[0].object;
            while (obj && !obj.userData.switchRef) obj = obj.parent;
            found = obj ? obj.userData.switchRef : null;
        }
        if (focused && focused !== found) focused.knob.material = mat(0xffd166);
        if (found) found.knob.material = new THREE.MeshBasicMaterial({ color: 0x8fe3a8 });
        focused = found;
        cross.style.borderColor = found ? '#8fe3a8' : '#ffd166';
        cross.style.transform = found ? 'scale(1.6)' : 'scale(1)';
        return found;
    }

    function toggleSwitch(sw) {
        if (!sw) return;
        sw.on = !sw.on;
        sw.pivot.rotation.x = sw.on ? 0.55 : -0.55;                  // рукоятка вверх/вниз
        sw.lamp.material = new THREE.MeshBasicMaterial({ color: sw.on ? 0x8fe3a8 : 0xff5a5a });
        const on = SWITCHES.filter(function (s2) { return s2.on; }).length;
        document.title = 'TOUR рубильники ' + on + '/' + SWITCHES.length;
        updateSwitchesHud();
        if (on === SWITCHES.length) {
            const burst = new THREE.PointLight(0x8fe3a8, 2.4, 14, 2);
            burst.position.set(0, 1.8, -15.4);
            scene.add(burst);
            setTimeout(function () { scene.remove(burst); }, 1200);
        }
    }


    let idx = 0, paused = false, t0 = performance.now();

    function show(i) {
        idx = i % STOPS.length;
        const s = STOPS[idx];
        camera.position.set(s.eye[0], s.eye[1], s.eye[2]);
        camera.lookAt(new THREE.Vector3(s.look[0], s.look[1], s.look[2]));
        cap.innerHTML = '<div style="color:#ffd166;font-weight:700;font-size:17px">' +
            (idx + 1) + '/' + STOPS.length + ' · ' + s.name + '</div>' + s.text;
        document.title = 'TOUR ' + (idx + 1) + '/' + STOPS.length + ' ' + s.name;
        t0 = performance.now();
        if (typeof updateSwitchesHud === 'function') updateSwitchesHud();
        // лёгкий наклон камеры «на ходу»
        camera.rotation.z = 0.02 * Math.sin(idx);
    }

    window.addEventListener('keydown', function (e) {
        if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
        if (e.code === 'ArrowRight') show(idx + 1);
        if (e.code === 'ArrowLeft') show(idx - 1);
        if (e.code === 'Escape') { location.href = location.pathname; }
        if (e.code === 'KeyE') { toggleSwitch(focusSwitch()); e.preventDefault(); }
    });

    let bob = 0;
    function animate(now) {
        if (!paused) bob += 0.0035;
        camera.position.y = STOPS[idx].eye[1] + Math.sin(bob * 6) * 0.012;   // дыхание/шаги
        // в щитовой кадр не уходит, пока все рубильники не включены
        const shieldIdx = STOPS.findIndex(function (st) { return st.name === 'Щитовая'; });
        const allOn = SWITCHES.every(function (s2) { return s2.on; });
        const hold = (idx === shieldIdx && !allOn) ? Infinity : HOLD_MS;
        focusSwitch();
        const p = paused ? 1 : Math.min(1, (now - t0) / hold);
        bar.style.width = (p * 100).toFixed(1) + '%';
        if (!paused && p >= 1) show(idx + 1);
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

    // клик мышью по конкретному рубильнику (не только по прицелу в центре)
    renderer.domElement.addEventListener('pointerdown', function (ev) {
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
            ((ev.clientX - rect.left) / rect.width) * 2 - 1,
            -((ev.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(ndc, camera);
        const targets = [];
        SWITCHES.forEach(function (s2) { s2.pivot.children.forEach(function (c) { targets.push(c); }); });
        const hits = raycaster.intersectObjects(targets, false);
        if (!hits.length || hits[0].distance > 6) return;
        let obj = hits[0].object;
        while (obj && !obj.userData.switchRef) obj = obj.parent;
        toggleSwitch(obj ? obj.userData.switchRef : null);
    });

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const startAt = Math.max(0, Math.min(STOPS.length - 1,
        Number(new URLSearchParams(location.search).get('slide') || 1) - 1));
    show(startAt);
    requestAnimationFrame(animate);
    window.StationTour = {
        stops: STOPS, show: show, switches: SWITCHES,
        screenPositions: function () {
            const out = [];
            SWITCHES.forEach(function (sw) {
                const v = new THREE.Vector3();
                sw.knob.getWorldPosition(v);
                v.project(camera);
                out.push({ id: sw.id, on: sw.on,
                           x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
                           y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight) });
            });
            return out;
        },
        states: function () { return SWITCHES.map(function (s2) { return s2.on; }); }
    };
    }
})();
