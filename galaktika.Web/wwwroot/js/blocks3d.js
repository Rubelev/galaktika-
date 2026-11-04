// Блочный мир на three.js: сцены собираются из блоков скриптом.
// Формат скрипта (по одной команде в строке, # — комментарий):
//   block x y z type        — один блок
//   box x y z w h d type    — параллелепипед
//   row x y z n dx dy dz t  — линия из n блоков
//   plate x z w d type      — плита пола толщиной 1
//   light x y z             — источник света
//   camera x y z            — позиция камеры
//   palette type #rrggbb    — цвет типа блока
// Открывается как конструктор: можно ставить и убирать блоки, сохранять сцену.
(function () {
    'use strict';

    var SAFE = /[?&]safe=1/.test(location.search);
    if (SAFE) return;

    var MAX_BLOCKS = 30000;
    var TYPES = {
        floor: 0xcfd4d7, wall: 0xb9c0c5, dark: 0x2f3336,
        console: 0x4a5157, panel: 0x23262a, core: 0xd8a41c,
        pipe: 0x7d868c, door: 0x9aa2a8, glass: 0x9fd8ff,
        alarm: 0xc9362b, light: 0xffffff
    };

    var THREE = null;
    var scene = null, camera = null, renderer = null, canvas = null;
    var blocks = [];
    var meshes = [];
    var current = 'console';
    var raycaster = null, pointer = null, plane = null, ghost = null;
    var editorMode = false;

    function loadThree() {
        if (THREE) return Promise.resolve(THREE);
        return import('/lib/three/three.module.js').then(function (m) {
            THREE = m;
            return m;
        });
    }

    function parse(script) {
        var out = [];
        var palette = Object.assign({}, TYPES);
        var cam = [14, 12, 18];
        (script || '').split('\n').forEach(function (line) {
            var t = line.trim();
            if (!t || t.charAt(0) === '#') return;
            var p = t.split(/\s+/);
            var cmd = p[0];
            if (cmd === 'palette' && p.length >= 3) {
                palette[p[1]] = parseInt(p[2].replace('#', ''), 16);
                return;
            }
            if (cmd === 'camera' && p.length >= 4) {
                cam = [parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])];
                return;
            }
            if (cmd === 'block' && p.length >= 5) {
                push(+p[1], +p[2], +p[3], p[4]);
            } else if (cmd === 'box' && p.length >= 9) {
                var w = +p[4], h = +p[5], d = +p[6], type = p[7];
                for (var x = 0; x < w; x++) {
                    for (var y = 0; y < h; y++) {
                        for (var z = 0; z < d; z++) {
                            push(+p[1] + x, +p[2] + y, +p[3] + z, type);
                        }
                    }
                }
            } else if (cmd === 'row' && p.length >= 9) {
                var n = +p[4], dx = +p[5], dy = +p[6], dz = +p[7];
                for (var i = 0; i < n; i++) push(+p[1] + dx * i, +p[2] + dy * i, +p[3] + dz * i, p[8]);
            } else if (cmd === 'plate' && p.length >= 6) {
                var pw = +p[3], pd = +p[4];
                for (var a = 0; a < pw; a++) for (var b = 0; b < pd; b++) push(+p[1] + a, 0, +p[2] + b, p[5]);
            }

            function push(x, y, z, type) {
                if (out.length >= MAX_BLOCKS) return;
                out.push({ x: x, y: y, z: z, t: type || 'floor' });
            }
        });
        return { blocks: out, palette: palette, camera: cam };
    }

    function build(sceneData) {
        var pal = sceneData.palette || TYPES;
        // ЧАНКИ 0.25 для ПОСТРОЕК: каждый блок постройки разбивается на 4×4×4
        // маленьких кубика, которые ровно заполняют прежний объём — щелей нет,
        // детализация выше в 4 раза. Рельеф остаётся крупным (иначе 64× блоков).
        var unitGeo = new THREE.BoxGeometry(1, 1, 1);
        var brickGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
        var STRUCT = { core: 1, panel: 1, pipe: 1, glass: 1, alarm: 1, light: 1,
                       console: 1, door: 1, wall: 1, floor: 1, dark: 1 };
        var mats = {};
        var group = new THREE.Group();
        var LIMIT = 28000;
        sceneData.blocks.forEach(function (b) {
            var key = b.t;
            if (!mats[key]) {
                mats[key] = new THREE.MeshLambertMaterial({
                    color: pal[key] !== undefined ? pal[key] : 0x888888
                });
            }
            var isStruct = !!STRUCT[key] && group.children.length < LIMIT - 64;
            if (isStruct) {
                for (var ix = 0; ix < 4; ix++) {
                    for (var iy = 0; iy < 4; iy++) {
                        for (var iz = 0; iz < 4; iz++) {
                            var m2 = new THREE.Mesh(brickGeo, mats[key]);
                            m2.position.set(b.x - 0.375 + ix * 0.25,
                                            b.y - 0.375 + iy * 0.25,
                                            b.z - 0.375 + iz * 0.25);
                            m2.userData.block = b;
                            group.add(m2);
                        }
                    }
                }
            } else {
                var m = new THREE.Mesh(unitGeo, mats[key]);
                m.position.set(b.x, b.y, b.z);
                m.userData.block = b;
                group.add(m);
            }
        });
        meshes = group.children.slice();
        return group;
    }

    function open(opts) {
        opts = opts || {};
        var TERRAIN = opts.terrain || null;
        var PALETTE = opts.palette || null;
        editorMode = !!opts.editor;
        var wrap = document.createElement('div');
        wrap.id = 'blocks3d-wrap';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:9850;background:#0a0d10;display:flex;flex-direction:column;' +
            'font:13px/1.4 Inter,system-ui,sans-serif;color:#dce8f7';

        var bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:10px 12px;background:#151a1e;' +
            'border-bottom:2px solid #0a0d10;flex-wrap:wrap';
        var title = document.createElement('b');
        title.textContent = opts.title || 'Блочный конструктор';
        title.style.cssText = 'color:#8fd6ff;font-size:14px';
        bar.appendChild(title);

        var status = document.createElement('span');
        status.id = 'b3d-status';
        status.style.cssText = 'opacity:.6;font-size:12px';
        bar.appendChild(status);

        if (editorMode) {
            Object.keys(TYPES).forEach(function (t) {
                var btn = document.createElement('button');
                btn.textContent = t;
                btn.style.cssText = 'padding:5px 9px;border-radius:6px;border:2px solid #0a0d10;cursor:pointer;' +
                    'background:#3b4348;color:#e6eaed;font-size:11px';
                btn.onclick = function () {
                    current = t;
                    Array.prototype.forEach.call(bar.querySelectorAll('button[data-type]'), function (b) {
                        b.style.outline = b.getAttribute('data-type') === t ? '2px solid #ffd05a' : 'none';
                    });
                };
                btn.setAttribute('data-type', t);
                bar.appendChild(btn);
            });
        }

        var script = document.createElement('textarea');
        script.id = 'b3d-script';
        script.value = opts.script || '';
        script.style.cssText = 'display:none';

        var save = document.createElement('button');
        save.textContent = 'Сохранить сцену';
        save.style.cssText = 'margin-left:auto;padding:6px 12px;border-radius:8px;border:none;cursor:pointer;' +
            'background:#2ecc71;color:#04121f;font-weight:700';
        save.onclick = function () {
            if (typeof window.saveSceneScript === 'function') window.saveSceneScript(script.value);
            else if (typeof window.notify === 'function') window.notify('Сцена: ' + blocks.length + ' блоков');
        };
        bar.appendChild(save);

        var close = document.createElement('button');
        close.textContent = '✕';
        close.style.cssText = 'padding:6px 12px;border-radius:8px;border:none;cursor:pointer;background:#3b4348;color:#fff';
        close.onclick = function () {
            if (typeof window.closeBlocks3D === 'function') window.closeBlocks3D();
            wrap.remove();
            if (renderer) { renderer.dispose(); renderer = null; }
            scene = null; camera = null;
        };
        bar.appendChild(close);

        var holder = document.createElement('div');
        holder.style.cssText = 'flex:1;position:relative;overflow:hidden';
        wrap.appendChild(bar);
        wrap.appendChild(holder);
        document.body.appendChild(wrap);

        loadThree().catch(function (err) {
            var msg = document.createElement('div');
            msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
                'flex-direction:column;gap:10px;color:#ffd0d0;font:14px/1.5 Inter,system-ui,sans-serif;text-align:center;padding:24px;z-index:2';
            msg.innerHTML = '<b>3D не запустился</b><div style="opacity:.8">' + String(err && err.message || err) +
                '</div><div style="opacity:.6;font-size:12px">Проверьте WebGL в браузере (chrome://gpu)</div>';
            wrap.appendChild(msg);
        }).then(function () {
            var parsed = (opts.blocks || TERRAIN)
                ? { blocks: (opts.blocks || []).slice(), palette: PALETTE || TYPES,
                    camera: opts.camera || [18, 14, 22] }
                : parse(script.value || opts.script || defaultScript());
            if (opts.blocks && opts.script) parsed.blocks = parse(opts.script).blocks.concat(opts.blocks);
            var pal = parsed.palette;
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0d1114);

            camera = new THREE.PerspectiveCamera(48, holder.clientWidth / holder.clientHeight, 0.1, 400);
            var camPos = opts.camera || parsed.camera;
            camera.position.set(camPos[0], camPos[1], camPos[2]);
            var look = opts.target || [0, 0, 0];
            camera.lookAt(look[0], look[1], look[2]);

            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(holder.clientWidth, holder.clientHeight);
            renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
            holder.appendChild(renderer.domElement);
            canvas = renderer.domElement;

            scene.add(new THREE.HemisphereLight(0xffffff, 0x30363c, 1.1));
            var dir = new THREE.DirectionalLight(0xffffff, 0.9);
            dir.position.set(12, 20, 8);
            scene.add(dir);

            blocks = parsed.blocks;

            if (opts.fog) {
                scene.fog = new THREE.Fog(opts.fog.color || 0x9fc4e0, opts.fog.near || 60, opts.fog.far || 240);
                if (opts.sky) scene.background = new THREE.Color(opts.sky);
                // панорама неба: equirect-текстура как фон сцены
                if (opts.skyTexture) {
                    try {
                        var loader = new THREE.TextureLoader();
                        loader.load(opts.skyTexture, function (tex) {
                            tex.mapping = THREE.EquirectangularReflectionMapping;
                            if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
                            scene.background = tex;
                        }, undefined, function () { /* остаётся цвет */ });
                    } catch (e) { }
                }
            }

            if (TERRAIN && TERRAIN.length) {
                var geo = new THREE.BoxGeometry(1, 1, 1);
                var byType = {};
                TERRAIN.forEach(function (b) {
                    if (!byType[b.t]) byType[b.t] = [];
                    byType[b.t].push(b);
                });
                Object.keys(byType).forEach(function (t) {
                    var list = byType[t];
                    var mat = new THREE.MeshLambertMaterial({ color: pal[t] !== undefined ? pal[t] : 0x556055 });
                    var inst = new THREE.InstancedMesh(geo, mat, list.length);
                    var m4 = new THREE.Matrix4();
                    list.forEach(function (b, i) {
                        m4.makeTranslation(b.x, b.y, b.z);
                        inst.setMatrixAt(i, m4);
                    });
                    inst.instanceMatrix.needsUpdate = true;
                    scene.add(inst);
                });
            }

            scene.add(build({ blocks: blocks, palette: pal }));

            if (!TERRAIN || !TERRAIN.length) {
                var grid = new THREE.GridHelper(40, 40, 0x2a3036, 0x1b2025);
                scene.add(grid);
            }

            // рамка курсора для конструктора
            var box = new THREE.BoxGeometry(1.02, 1.02, 1.02);
            ghost = new THREE.Mesh(box, new THREE.MeshBasicMaterial({
                color: 0xffd05a, wireframe: true, transparent: true, opacity: 0.85
            }));
            ghost.visible = false;
            scene.add(ghost);

            raycaster = new THREE.Raycaster();
            pointer = new THREE.Vector2();
            plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

            if (editorMode) bindEditor();
            bindOrbit();
            animate();
            updateStatus();
        }).catch(function (e) {
            status.textContent = 'three.js недоступен: ' + (e && e.message ? e.message : e);
        });

        function defaultScript() {
            return [
                '# Главный пульт станции',
                'plate 0 0 14 12 floor',
                'box 0 1 0 12 3 1 wall',
                'row 0 1 2 6 1 0 0 console',
                'row 6 1 2 6 1 0 0 console'
            ].join('\n');
        }
    }

    // масштаб камеры: доступен кнопкам планетарного вида
    var camRadius = 12;
    var camTheta = 0, camPhi = 0.9;

    function applyCam() {
        if (!camera) return;
        camera.position.set(
            camRadius * Math.sin(camPhi) * Math.sin(camTheta),
            camRadius * Math.cos(camPhi),
            camRadius * Math.sin(camPhi) * Math.cos(camTheta)
        );
        camera.lookAt(0, 0, 0);
    }

    var panX = 0, panZ = 0;
    function setPan(x, z) { panX = x; panZ = z; }
    function panBy(dx, dz) { panX += dx; panZ += dz; }

    function zoomBy(factor) {
        camRadius = Math.max(4, Math.min(90, camRadius * factor));
        applyCam();
        return camRadius;
    }

    function zoomTo(r) {
        camRadius = Math.max(4, Math.min(90, r));
        applyCam();
        return camRadius;
    }

    function bindOrbit() {
        var dragging = false, px = 0, py = 0;
        var target = null;
        var theta = Math.atan2(camera.position.x, camera.position.z);
        var radius = camera.position.length();
        camTheta = theta;
        camPhi = Math.acos(camera.position.y / Math.max(0.001, radius));
        camRadius = radius;
        var phi = Math.acos(camera.position.y / radius);

        canvas.addEventListener('pointerdown', function (e) {
            if (editorMode && e.button === 0 && !e.shiftKey) return; // в конструкторе ЛКМ ставит блок
            dragging = true; px = e.clientX; py = e.clientY;
        });
        window.addEventListener('pointerup', function () { dragging = false; });
        window.addEventListener('pointermove', function (e) {
            if (!dragging || !camera) return;
            theta -= (e.clientX - px) * 0.008;
            phi = Math.max(0.15, Math.min(1.45, phi - (e.clientY - py) * 0.006));
            px = e.clientX; py = e.clientY;
            camTheta = theta; camPhi = phi;
            camera.position.set(
                panX + radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi),
                panZ + radius * Math.sin(phi) * Math.cos(theta)
            );
            camera.lookAt(panX, 0, panZ);
        });
        bindMovement();
        canvas.addEventListener('wheel', function (e) {
            if (!camera) return;
            e.preventDefault();
            radius = Math.max(4, Math.min(90, radius + e.deltaY * 0.03));
            camRadius = radius; camTheta = theta; camPhi = phi;
            camera.position.set(
                panX + radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi),
                panZ + radius * Math.sin(phi) * Math.cos(theta)
            );
            camera.lookAt(panX, 0, panZ);
            if (window.PlanetView && window.PlanetView.onZoom) window.PlanetView.onZoom(radius);
        }, { passive: false });
    }

    // ДВИЖЕНИЕ В ПЛАНЕТАРНОМ ВИДЕ: WASD/стрелки и перетаскивание правой кнопкой
    function bindMovement() {
        const keys = Object.create(null);
        window.addEventListener('keydown', function (e) {
            keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

        let dragging = false, lx = 0, ly = 0;
        canvas.addEventListener('pointerdown', function (e) {
            if (e.button !== 2) return;               // правая кнопка — панорама
            dragging = true; lx = e.clientX; ly = e.clientY;
            e.preventDefault();
        });
        window.addEventListener('pointerup', function () { dragging = false; });
        window.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            panBy(-(e.clientX - lx) * 0.08, -(e.clientY - ly) * 0.08);
            lx = e.clientX; ly = e.clientY;
        });
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

        setInterval(function () {
            if (!camera) return;
            let dx = 0, dz = 0;
            if (keys['a'] || keys['arrowleft']) dx -= 0.6;
            if (keys['d'] || keys['arrowright']) dx += 0.6;
            if (keys['w'] || keys['arrowup']) dz -= 0.6;
            if (keys['s'] || keys['arrowdown']) dz += 0.6;
            if (dx || dz) panBy(dx, dz);
        }, 40);
    }

    function bindEditor() {
        canvas.addEventListener('pointermove', function (e) {
            if (!raycaster || !ghost) return;
            var r = canvas.getBoundingClientRect();
            pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
            pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            var hits = raycaster.intersectObjects(meshes, false);
            if (hits.length) {
                var p = hits[0].object.position;
                ghost.position.set(Math.round(p.x), Math.round(p.y) + 1, Math.round(p.z));
                ghost.visible = true;
            } else {
                var hit = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, hit)) {
                    ghost.position.set(Math.round(hit.x), 0.5, Math.round(hit.z));
                    ghost.visible = true;
                } else {
                    ghost.visible = false;
                }
            }
        });

        canvas.addEventListener('pointerdown', function (e) {
            if (!ghost || !ghost.visible) return;
            if (e.button === 2) return;
            place(Math.round(ghost.position.x), Math.round(ghost.position.y), Math.round(ghost.position.z), current);
        });

        canvas.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            if (!raycaster) return;
            var r = canvas.getBoundingClientRect();
            pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
            pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
            raycaster.setFromCamera(pointer, camera);
            var hits = raycaster.intersectObjects(meshes, false);
            if (hits.length) remove(hits[0].object.position);
        });
    }

    function place(x, y, z, type) {
        if (blocks.length >= MAX_BLOCKS) return;
        var b = { x: x, y: y, z: z, t: type || current };
        blocks.push(b);
        scene.add(build({ blocks: [b], palette: TYPES }));
        refreshMeshes();
        updateScript();
        updateStatus();
    }

    function remove(pos) {
        blocks = blocks.filter(function (b) {
            return !(Math.round(b.x) === Math.round(pos.x) && Math.round(b.y) === Math.round(pos.y)
                && Math.round(b.z) === Math.round(pos.z));
        });
        var keep = [];
        scene.children.forEach(function (ch) {
            if (ch.isMesh && ch.userData && ch.userData.block) {
                var ub = ch.userData.block;
                if (Math.round(ub.x) === Math.round(pos.x) && Math.round(ub.y) === Math.round(pos.y)
                    && Math.round(ub.z) === Math.round(pos.z)) {
                    scene.remove(ch);
                }
            }
        });
        refreshMeshes();
        updateScript();
        updateStatus();
    }

    function refreshMeshes() {
        meshes = scene.children.filter(function (ch) { return ch.isMesh && ch.userData && ch.userData.block; });
    }

    function updateScript() {
        var area = document.getElementById('b3d-script');
        if (!area) return;
        var byType = {};
        blocks.forEach(function (b) {
            if (!byType[b.t]) byType[b.t] = [];
            byType[b.t].push(b);
        });
        var lines = ['# Сцена собрана в конструкторе'];
        Object.keys(byType).forEach(function (t) {
            byType[t].forEach(function (b) {
                lines.push('block ' + b.x + ' ' + b.y + ' ' + b.z + ' ' + t);
            });
        });
        area.value = lines.join('\n');
    }

    function updateStatus() {
        var st = document.getElementById('b3d-status');
        if (st) st.textContent = 'блоков: ' + blocks.length + (editorMode ? ' · ЛКМ — поставить, ПКМ — убрать' : '');
    }

    function animate() {
        if (!renderer || !scene || !camera) return;
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }

    if (/[?&]blocks=1/.test(location.search)) {
        setTimeout(function () {
            ['welcome-screen', 'auth-overlay', 'legend-overlay', 'tut-modal'].forEach(function (id) {
                var n = document.getElementById(id);
                if (n) n.style.display = 'none';
            });
            open({ editor: true, title: '🧱 Конструктор сцен' });
        }, 1500);
    }

    window.Blocks3D = {
        zoomBy: zoomBy,
        panBy: panBy,
        setPan: setPan,
        zoomTo: zoomTo,
        camRadius: function () { return camRadius; },
        open: open,
        parse: parse,
        types: TYPES,
        scriptOf: function () {
            var a = document.getElementById('b3d-script');
            return a ? a.value : '';
        }
    };
})();
