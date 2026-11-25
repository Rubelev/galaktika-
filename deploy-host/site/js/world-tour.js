// ============================================================================
//  WORLD-TOUR.JS — экскурсия по миру от первого лица.
//
//  Что делает:
//    • 3D-сцена: звёзды, Солнце, планеты с текстурами, орбиты;
//    • камера летит по маршруту от места к месту (сглаженные кривые);
//    • на каждой остановке — медленный облёт и рассказ (субтитры + опционально
//      озвучка через speechSynthesis, язык ru-RU);
//    • управление: пробел — пауза, ←/→ — назад/вперёд, Esc — выход;
//      «Пропустить» — сразу к следующей остановке.
//
//  Запуск: ?worldtour=1 (кнопка в меню добавляется сама)
//  Данные остановок — внизу файла, массив STOPS.
// ============================================================================
(function (global) {
    'use strict';
    const params = new URLSearchParams(location.search);
    if (!params.has('worldtour')) {
        // кнопка в левом меню
        document.addEventListener('DOMContentLoaded', function () { setTimeout(addMenuButton, 2200); });
        if (document.readyState !== 'loading') setTimeout(addMenuButton, 2200);
        return;
    }

    // --- остановки маршрута -------------------------------------------------
    // pos: [x, y, z] в сцене; look: во что смотрим; text: что рассказываем
    const STOPS = [
        {
            id: 'sun', title: 'Солнце', pos: [0, 26, 118], look: [0, 0, 0],
            text: 'Начнём с Солнца. Всё топливо, вся энергия и весь свет этого мира рождаются здесь. ' +
                  'Двенадцать миллиардов человек на Земле живут на энергии, которую мы научились ловить.'
        },
        {
            id: 'earth', title: 'Земля · колыбель', pos: [92, 20, 150], look: [80, 0, 0],
            text: 'Земля — дом, но не ферма. Экология под запретом: поля и скот не тянут двенадцать миллиардов. ' +
                  'Еду делают заводы: водород, метан, азот — и электричество.'
        },
        {
            id: 'moon', title: 'Луна · склады', pos: [108, 26, 138], look: [80, 0, 0],
            text: 'Луна — перевалочный склад. Отсюда грузы уходят к поясу, а обратно идёт руда и лёд.'
        },
        {
            id: 'mars', title: 'Марс · республика', pos: [200, 30, 190], look: [170, 0, 0],
            text: 'Марс живёт трудом и независимостью. Здесь строят корпуса, клонируют экипажи и не любят Землю.'
        },
        {
            id: 'ceres', title: 'Церера · пояс', pos: [290, 34, 250], look: [250, 0, 0],
            text: 'Пояс — рудник системы. Церера и Эрос: гидропоника в куполах, редкие металлы и вечная пыль.'
        },
        {
            id: 'jupiter', title: 'Юпитер · топливо', pos: [400, 42, 330], look: [340, 0, 0],
            text: 'Юпитер — бензоколонка. Здесь качают водород: он идёт и в топливо, и в заводы еды.'
        },
        {
            id: 'titan', title: 'Титан · метан', pos: [520, 46, 400], look: [440, 0, 0],
            text: 'Титан — оранжевая дымка, метановые моря. Метан — второй столп продовольствия: из него делают ' +
                  'углеводы и жиры, а ещё им торгует Тиран.'
        },
        {
            id: 'war', title: 'Вармир · арены', pos: [640, 52, 470], look: [560, 0, 0],
            text: 'Вармир. Пять арен: Яма, Колизей, Траншеи, Купол и Сфера. Здесь дерутся клоны, ставят кредиты ' +
                  'и решают, кто сильнее сегодня.'
        },
        {
            id: 'tarsis', title: 'Тарсис · гонки', pos: [740, 56, 530], look: [660, 0, 0],
            text: 'Тарсис — скорость. Три круга по кольцам, каждые шесть часов новый заезд. Билеты, ставки, ' +
                  'деликатесы — и всё это крутится вокруг одной трассы.'
        },
        {
            id: 'vegas', title: 'Кеп-Вегас · казино', pos: [840, 60, 590], look: [760, 0, 0],
            text: 'Вегас Солнечной системы: пять зон. Рулетки на кольцах, сто автоматов на Эросе, тихие ' +
                  'карточные залы с сигарами, скачки на гибридах и олимпийская арена.'
        },
        {
            id: 'void', title: 'Зал Пустоты', pos: [930, 66, 650], look: [860, 0, 0],
            text: 'А это Зал Пустоты: один стол, ставки до двух миллионов и ноль гравитации. ' +
                  'Шарик здесь летит по прямой — как и всё в этом мире. Экскурсия окончена.'
        }
    ];

    const STOP_SECONDS = 11;      // сколько стоим на остановке
    const FLY_SECONDS = 6;        // сколько летим до следующей

    // --- загрузка three ----------------------------------------------------
    import('/lib/three/three.module.js')
        .then(boot)
        .catch(function () {
            import('/lib/three/three.module.js?v=2').then(boot).catch(function () {
                notify('3D-тур недоступен: не загрузился движок');
            });
        });

    function notify(t) {
        if (typeof window.notify === 'function') window.notify(t);
        else console.log(t);
    }

    function boot(THREE) {
        const W = window.innerWidth, H = window.innerHeight;
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(W, H);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        renderer.domElement.id = 'world-tour-canvas';
        renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:100050;background:#03060d';
        document.body.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x02040a, 0.00055);
        const camera = new THREE.PerspectiveCamera(55, W / H, 0.5, 20000);

        // свет
        scene.add(new THREE.AmbientLight(0x223044, 1.1));
        const sunLight = new THREE.PointLight(0xfff2d0, 3.2, 6000, 1.4);
        scene.add(sunLight);

        // звёзды
        const starGeo = new THREE.BufferGeometry();
        const starCount = 4200;
        const arr = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            const r = 1200 + Math.random() * 5200;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
            arr[i * 3 + 1] = r * Math.cos(ph) * 0.55;
            arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.85 })));

        // Солнце
        const sun = new THREE.Mesh(new THREE.SphereGeometry(16, 48, 48), new THREE.MeshBasicMaterial({ color: 0xffcf6a }));
        scene.add(sun);
        const glowTex = makeGlowTexture(THREE, 0xffd27a);
        const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc766, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        sunGlow.scale.set(120, 120, 1);
        scene.add(sunGlow);

        // планеты
        const BODIES = [
            { id: 'mercury', x: 38, r: 2.2, tex: 'mercury.jpg' },
            { id: 'earth', x: 80, r: 4.6, tex: 'earth.jpg' },
            { id: 'mars', x: 170, r: 3.4, tex: 'mars.jpg' },
            { id: 'ceres', x: 250, r: 1.6, tex: 'ceres.jpg' },
            { id: 'jupiter', x: 340, r: 12, tex: 'jupiter.jpg' },
            { id: 'titan', x: 440, r: 4.0, tex: 'titan.jpg' },
            { id: 'war', x: 560, r: 5.0, tex: 'moon.jpg' },
            { id: 'tarsis', x: 660, r: 4.2, tex: 'europa.webp' },
            { id: 'vegas', x: 760, r: 3.2, tex: 'io.jpg' },
            { id: 'void', x: 860, r: 2.0, tex: 'phobos.jpg' }
        ];
        const loader = new THREE.TextureLoader();
        const meshes = {};
        BODIES.forEach(function (b) {
            // MeshBasicMaterial: планета видна с любой стороны — иначе половина кадра чёрная
            const mat = new THREE.MeshBasicMaterial({ color: 0x8fa8c4 });
            loader.load('/images/tex/' + b.tex, function (t) {
                mat.map = t; mat.color = new THREE.Color(0xffffff); mat.needsUpdate = true;
            });
            const m = new THREE.Mesh(new THREE.SphereGeometry(b.r, 40, 40), mat);
            m.position.set(b.x, 0, 0);
            scene.add(m);
            meshes[b.id] = m;
            // орбита
            const pts = [];
            for (let i = 0; i <= 160; i++) {
                const a = (i / 160) * Math.PI * 2;
                pts.push(new THREE.Vector3(Math.cos(a) * b.x, 0, Math.sin(a) * b.x));
            }
            const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: 0x2b4a70, transparent: true, opacity: 0.5 }));
            scene.add(orbit);
        });

        // --- крупные планы: камера подходит к каждому телу, а не смотрит издалека ---
        const xById = {};
        BODIES.forEach(function (b) { xById[b.id] = b.x; });
        STOPS.forEach(function (s) {
            if (s.id === 'sun') { s.pos = [16, 9, 58]; s.look = [0, 0, 0]; return; }
            const x = xById[s.id] || 0;
            const r = 12;                           // насколько близко подходим
            s.pos = [x + r * 1.2, r * 0.55, r * 1.7];
            s.look = [x, 0, 0];
        });

        // --- подписи остановок (спрайты с текстом) ---
        STOPS.forEach(function (s) {
            if (s.id === 'sun') return;
            const tex = makeLabelTexture(THREE, s.title);
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            sp.position.set(s.pos[0] + 6, s.pos[1] + 10, s.pos[2] + 6);
            sp.scale.set(46, 12, 1);
            scene.add(sp);
        });

        // --- интерфейс ---
        const ui = document.createElement('div');
        ui.id = 'world-tour-ui';
        ui.style.cssText = 'position:fixed;inset:0;z-index:100051;pointer-events:none;' +
            'font:15px/1.55 system-ui,Segoe UI,sans-serif;color:#eaf3ff';
        ui.innerHTML =
            '<div style="position:absolute;inset:0;box-shadow:inset 0 0 220px 60px rgba(0,0,0,.85)"></div>' +
            '<div style="position:absolute;left:0;right:0;top:0;height:64px;background:linear-gradient(#03060d,rgba(3,6,13,0))"></div>' +
            '<div style="position:absolute;left:0;right:0;bottom:0;height:230px;background:linear-gradient(rgba(3,6,13,0),#03060d 70%)"></div>' +
            '<div id="wt-progress" style="position:absolute;left:0;bottom:0;height:3px;width:0;background:linear-gradient(90deg,#ffcf6a,#8fd0ff)"></div>' +
            '<div style="position:absolute;left:56px;bottom:150px;max-width:min(760px,80vw)">' +
            '  <div id="wt-title" style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#ffcf6a;margin-bottom:8px"></div>' +
            '  <div id="wt-text" style="font-size:19px;text-shadow:0 2px 18px rgba(0,0,0,.9)"></div>' +
            '</div>' +
            '<div style="position:absolute;right:40px;bottom:34px;display:flex;gap:10px;pointer-events:auto">' +
            '  <button id="wt-voice" style="padding:8px 14px;border-radius:9px;border:1px solid rgba(143,208,255,.45);background:rgba(6,14,24,.8);color:#cfe6ff;cursor:pointer;font:inherit">Озвучка: выкл</button>' +
            '  <button id="wt-skip" style="padding:8px 14px;border-radius:9px;border:1px solid rgba(255,207,106,.5);background:rgba(6,14,24,.8);color:#ffcf6a;cursor:pointer;font:inherit">Дальше →</button>' +
            '  <button id="wt-exit" style="padding:8px 14px;border-radius:9px;border:1px solid rgba(255,120,120,.5);background:rgba(6,14,24,.8);color:#ffb0b0;cursor:pointer;font:inherit">Выйти</button>' +
            '</div>' +
            '<div style="position:absolute;left:56px;top:44px;font-size:12px;opacity:.65">пробел — пауза · ←/→ — назад/вперёд · Esc — выход</div>';
        document.body.appendChild(ui);

        const elTitle = ui.querySelector('#wt-title');
        const elText = ui.querySelector('#wt-text');
        const elProg = ui.querySelector('#wt-progress');
        let voiceOn = false;

        // --- состояние ---
        let idx = 0;
        let phase = 'hold';          // hold | fly
        let holdEl = 0;              // секунд на остановке
        let flyEl = 0;               // секунд в полёте
        let paused = false;
        let voice = null;
        if ('speechSynthesis' in window) {
            voice = window.speechSynthesis;
        }

        function say(text) {
            if (!voiceOn || !voice) return;
            try {
                voice.cancel();
                const u = new SpeechSynthesisUtterance(text);
                u.lang = 'ru-RU';
                u.rate = 0.98;
                u.pitch = 0.95;
                const ru = (voice.getVoices() || []).find(v => /ru/i.test(v.lang));
                if (ru) u.voice = ru;
                voice.speak(u);
            } catch (e) { }
        }

        function showStop(i) {
            const s = STOPS[i];
            elTitle.textContent = s.title;
            elText.textContent = s.text;
            elText.style.opacity = '0';
            elText.style.transition = 'opacity .8s';
            setTimeout(function () { elText.style.opacity = '1'; }, 60);
            say(s.text);
        }

        // позиции камеры: летим по сплайну между остановками
        const camFrom = new THREE.Vector3().fromArray(STOPS[0].pos);
        const camTo = new THREE.Vector3().fromArray(STOPS[0].pos);
        const lookFrom = new THREE.Vector3().fromArray(STOPS[0].look);
        const lookTo = new THREE.Vector3().fromArray(STOPS[0].look);
        const lookNow = new THREE.Vector3().fromArray(STOPS[0].look);
        camera.position.copy(camFrom);
        camera.lookAt(lookNow);

        function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

        function goTo(i) {
            idx = Math.max(0, Math.min(STOPS.length - 1, i));
            const s = STOPS[idx];
            camFrom.copy(camera.position);
            camTo.fromArray(s.pos);
            lookFrom.copy(lookNow);
            lookTo.fromArray(s.look);
            phase = 'fly';
            flyEl = 0;
            elTitle.textContent = 'Летим к: ' + s.title;
        }

        function onKey(e) {
            if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
            if (e.code === 'ArrowRight') { goTo(idx + 1); }
            if (e.code === 'ArrowLeft') { goTo(idx - 1); }
            if (e.code === 'Escape') { close(); }
        }
        document.addEventListener('keydown', onKey);

        ui.querySelector('#wt-skip').onclick = function () { goTo(idx + 1); };
        ui.querySelector('#wt-exit').onclick = close;
        ui.querySelector('#wt-voice').onclick = function () {
            voiceOn = !voiceOn;
            this.textContent = 'Озвучка: ' + (voiceOn ? 'вкл' : 'выкл');
            if (!voiceOn && voice) voice.cancel();
            else if (voiceOn) say(STOPS[idx].text);
        };

        function close() {
            if (voice) voice.cancel();
            document.removeEventListener('keydown', onKey);
            renderer.dispose();
            renderer.domElement.remove();
            ui.remove();
            window.history.replaceState({}, '', location.pathname);
        }

        window.addEventListener('resize', function () {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // --- первый показ ---
        showStop(0);
        phase = 'hold';
        holdEl = 0;

        // --- цикл ---
        function animate() {
            requestAnimationFrame(animate);
            const now = performance.now();
            const dt = Math.min(0.05, (now - (animate.last || now)) / 1000);
            animate.last = now;

            if (!paused) {
                camera.position.x += 0.35 * 1; // лёгкий дрейф, чтобы кадр жил
            }

            // медленное вращение планет
            Object.keys(meshes).forEach(function (k, i) {
                meshes[k].rotation.y += dt * (0.12 + i * 0.01);
            });
            sunGlow.rotation.z += dt * 0.02;

            if (phase === 'hold') {
                holdEl += dt;
                const s = STOPS[idx];
                const base = new THREE.Vector3().fromArray(s.pos);
                const ang = holdEl * 0.14;
                camera.position.set(
                    base.x + Math.cos(ang) * 6,
                    base.y + Math.sin(holdEl * 0.22) * 3,
                    base.z + Math.sin(ang) * 6
                );
                camera.lookAt(lookNow);
                elProg.style.width = Math.min(100, (holdEl / STOP_SECONDS) * 100) + '%';
                if (holdEl >= STOP_SECONDS) {
                    if (idx < STOPS.length - 1) goTo(idx + 1);
                    else elProg.style.width = '100%';
                }
            } else if (phase === 'fly') {
                flyEl += dt;
                const k = easeInOut(Math.min(1, flyEl / FLY_SECONDS));
                camera.position.lerpVectors(camFrom, camTo, k);
                lookNow.lerpVectors(lookFrom, lookTo, k);
                camera.lookAt(lookNow);
                elProg.style.width = Math.min(100, ((idx + k) / (STOPS.length - 1)) * 100) + '%';
                if (flyEl >= FLY_SECONDS) {
                    phase = 'hold';
                    holdEl = 0;
                    showStop(idx);
                }
            }
            renderer.render(scene, camera);
        }
        animate();
    }

    // --- текстуры для спрайтов --------------------------------------------
    function makeGlowTexture(THREE, color) {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient ? ctx.createRadialGradient(128, 128, 0, 128, 128, 128) : null;
        if (g) {
            g.addColorStop(0, 'rgba(255,236,190,1)');
            g.addColorStop(0.35, 'rgba(255,200,110,0.55)');
            g.addColorStop(1, 'rgba(255,180,80,0)');
            ctx.fillStyle = g;
        } else {
            ctx.fillStyle = 'rgba(255,200,110,0.6)';
        }
        ctx.fillRect(0, 0, 256, 256);
        return new THREE.CanvasTexture(c);
    }

    function makeLabelTexture(THREE, text) {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 128;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(4,10,20,0.0)';
        ctx.fillRect(0, 0, 512, 128);
        ctx.font = '600 44px system-ui, Segoe UI, sans-serif';
        ctx.fillStyle = 'rgba(180,220,255,0.92)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 64);
        return new THREE.CanvasTexture(c);
    }

    // --- кнопка в меню -----------------------------------------------------
    function addMenuButton() {
        if (document.getElementById('world-tour-btn')) return;
        const b = document.createElement('button');
        b.id = 'world-tour-btn';
        b.textContent = '🎬 Экскурсия по миру';
        b.style.cssText = 'position:fixed;left:14px;bottom:90px;z-index:100005;padding:7px 12px;border-radius:9px;' +
            'border:1px solid rgba(255,207,106,.45);background:rgba(8,14,24,.9);color:#ffcf6a;' +
            'font:12px ui-monospace,monospace;cursor:pointer';
        b.onclick = function () { location.href = location.pathname + '?worldtour=1'; };
        document.body.appendChild(b);
    }
})(typeof window !== 'undefined' ? window : globalThis);
