// Полёт аппарата в космосе — 3D-сцена на three.js.
// Корабль — воксельная модель из Models3D, звёзды — по спектральным классам,
// туманность и планета — спрайты и сфера. Если three.js не загрузился,
// вызывается openShipFlight2D (canvas-версия).
function shipFlightShell(index) {
    const r = TRAFFIC_ROUTES[index];
    if (!r) return null;
    const ship = SHIPS[r.ship] || { name: 'Аппарат', cls: '', cargo: 0 };
    const drive = (typeof DRIVES !== 'undefined' && DRIVES[ship.drive]) ? DRIVES[ship.drive] : { name: '—' };
    const st = r.state || { vx: 0, vy: 0 };
    const speedKm = Math.round(Math.hypot(st.vx || 0, st.vy || 0) /
        (typeof SPEED_UNIT === 'number' ? SPEED_UNIT : 7) * 1000);
    const from = (planetNodes[r.a] && planetNodes[r.a].data && planetNodes[r.a].data.name) || 'станция';
    const to = (planetNodes[r.b] && planetNodes[r.b].data && planetNodes[r.b].data.name) || 'станция';

    const old = document.getElementById('ship-flight');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'ship-flight';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100060;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(2,4,8,.86);padding:14px';
    modal.innerHTML =
        '<div style="position:relative;width:min(880px,96vw);border-radius:18px;overflow:hidden;' +
        'border:1px solid #1e3a5f;background:#04070d">' +
        '<canvas id="ship-flight-canvas" style="display:block;width:100%;height:auto"></canvas>' +
        '<div style="position:absolute;left:0;right:0;bottom:0;padding:14px 18px;' +
        'background:linear-gradient(rgba(4,7,13,0),rgba(4,7,13,.94));color:#dce8f7;' +
        'font:14px/1.45 Inter,system-ui,sans-serif">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">' +
        '<div><b style="color:#8fd6ff;font-size:17px">' + (ship.name || 'Аппарат') + '</b>' +
        '<div style="opacity:.75;font-size:12.5px">' + (ship.cls || '') + ' · ' + (drive.name || '') + '</div></div>' +
        '<div style="text-align:right;font-size:12.5px;opacity:.85">' +
        '<div>маршрут <b style="color:#ffd05a">' + from + ' → ' + to + '</b></div>' +
        '<div>скорость <b style="color:#3ec97a">' + speedKm + ' км/с</b> · трюм ' + (ship.cargo || '—') + ' т</div>' +
        '</div></div></div>' +
        '<button id="sf-close" style="position:absolute;right:10px;top:10px;border:none;border-radius:9px;' +
        'padding:6px 12px;background:rgba(20,30,46,.85);color:#dce8f7;cursor:pointer;font-size:15px">✕</button>' +
        '</div>';
    document.body.appendChild(modal);
    return { modal: modal, ship: ship, route: r, world: from };
}

function openShipFlight(index) {
    import('/lib/three/three.module.js')
        .then(function (THREE) {
            if (!window.Models3D || !window.Models3D.buildShip) throw new Error('нет Models3D');
            openShipFlight3D(index, THREE);
        })
        .catch(function (e) {
            console.warn('3D-полёт недоступен, рисую 2D:', e && e.message);
            openShipFlight2D(index);
        });
}

function openShipFlight3D(index, THREE) {
    const shell = shipFlightShell(index);
    if (!shell) return;

    const canvas = document.getElementById('ship-flight-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060c);

    const camera = new THREE.PerspectiveCamera(52, 1.7, 0.1, 2000);
    camera.position.set(0, 0, 34);

    // ---------- звёзды по спектральным классам ----------
    // O/B — голубовато-белые, A — белые, G — жёлтые, K — оранжевые, M — красные.
    const CLASSES = [
        { c: [0.72, 0.82, 1.00], w: 0.06 },
        { c: [0.90, 0.94, 1.00], w: 0.14 },
        { c: [1.00, 1.00, 1.00], w: 0.30 },
        { c: [1.00, 0.96, 0.86], w: 0.28 },
        { c: [1.00, 0.84, 0.68], w: 0.16 },
        { c: [1.00, 0.72, 0.60], w: 0.06 }
    ];

    function makeStars(count, spread, sizeMin, sizeMax) {
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            // равномерно по сфере, но с уплотнением к плоскости Галактики
            let u = Math.random() * 2 - 1;
            if (Math.random() < 0.55) u *= 0.18;          // диск Млечного Пути
            const phi = Math.random() * Math.PI * 2;
            const r = spread * (0.75 + Math.random() * 0.25);
            const s = Math.sqrt(1 - u * u);
            pos[i * 3] = Math.cos(phi) * s * r;
            pos[i * 3 + 1] = u * r;
            pos[i * 3 + 2] = Math.sin(phi) * s * r;

            // яркость по степенному закону: ярких мало
            const b = 0.25 + Math.pow(Math.random(), 2.6) * 0.75;
            let acc = 0, pick = CLASSES[CLASSES.length - 1];
            const rnd = Math.random();
            for (let k = 0; k < CLASSES.length; k++) {
                acc += CLASSES[k].w;
                if (rnd <= acc) { pick = CLASSES[k]; break; }
            }
            col[i * 3] = pick.c[0] * b;
            col[i * 3 + 1] = pick.c[1] * b;
            col[i * 3 + 2] = pick.c[2] * b;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const m = new THREE.PointsMaterial({
            size: (sizeMin + sizeMax) / 2, sizeAttenuation: false,
            vertexColors: true, transparent: true, opacity: 0.95,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        return new THREE.Points(g, m);
    }

    const starsFar = makeStars(2600, 260, 0.5, 1.4);
    const starsNear = makeStars(700, 90, 1.0, 2.2);
    scene.add(starsFar);
    scene.add(starsNear);

    // ---------- туманность ----------
    function nebulaTexture(inner, outer) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 256;
        const cx = cv.getContext('2d');
        const grd = cx.createRadialGradient(128, 128, 6, 128, 128, 128);
        grd.addColorStop(0, inner);
        grd.addColorStop(0.45, outer);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = grd;
        cx.fillRect(0, 0, 256, 256);
        const t = new THREE.CanvasTexture(cv);
        return t;
    }
    const neb1 = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nebulaTexture('rgba(90,140,255,0.30)', 'rgba(40,70,160,0.10)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9
    }));
    neb1.scale.set(150, 150, 1);
    neb1.position.set(-52, 26, -120);
    scene.add(neb1);

    const neb2 = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nebulaTexture('rgba(190,120,220,0.20)', 'rgba(90,50,130,0.08)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.75
    }));
    neb2.scale.set(120, 120, 1);
    neb2.position.set(60, -26, -130);
    scene.add(neb2);

    // ---------- планета на фоне ----------
    const worldSlug = {
        'Юпитер': 'jupiter', 'Сатурн': 'saturn', 'Марс': 'mars', 'Земля': 'earth',
        'Луна': 'moon', 'Венера': 'venus', 'Меркурий': 'mercury', 'Уран': 'uranus',
        'Нептун': 'neptune', 'Титан': 'titan', 'Европа': 'europa', 'Ио': 'io'
    }[shell.world] || 'jupiter';
    const planetGeo = new THREE.SphereGeometry(26, 64, 32);
    const planetMat = new THREE.MeshStandardMaterial({ color: 0x223a55, roughness: 1, metalness: 0 });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.set(-34, -34, -80);
    planet.rotation.z = 0.25;
    scene.add(planet);

    new THREE.TextureLoader().load('/images/tex/' + worldSlug + '.webp', function (tex) {
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        planetMat.map = tex;
        planetMat.color.set(0xffffff);
        planetMat.needsUpdate = true;
    });

    const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.4);
    sunLight.position.set(40, 30, 20);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x223044, 0.9));

    // свечение атмосферы планеты
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nebulaTexture('rgba(120,180,255,0.45)', 'rgba(40,90,180,0.12)'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    halo.scale.set(96, 96, 1);
    halo.position.copy(planet.position);
    scene.add(halo);

    // ---------- корабль ----------
    let shipGroup = null;
    try {
        shipGroup = window.Models3D.buildShip(shell.route.ship, THREE);
    } catch (e) { shipGroup = null; }
    if (!shipGroup) return openShipFlight2D(index);

    // нормализуем размер: любой корабль вписываем в ~16 единиц
    const box = new THREE.Box3().setFromObject(shipGroup);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxSide = Math.max(size.x, size.y, size.z) || 1;
    shipGroup.scale.setScalar(16 / maxSide);
    const holder = new THREE.Group();
    holder.add(shipGroup);
    // модель строится «носом вправо» по X — доворачиваем и поднимаем к центру
    shipGroup.position.sub(new THREE.Vector3(
        (box.min.x + box.max.x) / 2 * (16 / maxSide),
        (box.min.y + box.max.y) / 2 * (16 / maxSide),
        (box.min.z + box.max.z) / 2 * (16 / maxSide)
    ));
    holder.position.set(2, 1, 0);
    scene.add(holder);

    // двигатель: два светящихся спрайта и точечный свет
    const flameTex = nebulaTexture('rgba(180,230,255,0.95)', 'rgba(70,140,255,0.35)');
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    flame.position.set(-9, 0, 0);
    flame.scale.set(14, 9, 1);
    holder.add(flame);

    const flameCore = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    flameCore.position.set(-8.4, 0, 0);
    flameCore.scale.set(6, 4, 1);
    holder.add(flameCore);

    const engineLight = new THREE.PointLight(0x7fc4ff, 40, 60);
    engineLight.position.set(-9, 0, 0);
    holder.add(engineLight);

    // ---------- размер и анимация ----------
    let W = 880, H = 480;
    function resize() {
        W = canvas.clientWidth || 880;
        H = Math.round(W * 0.54);
        canvas.style.height = H + 'px';
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    let raf = 0, last = performance.now(), t = 0;
    function loop(now) {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;

        // звёзды уходят влево: корабль летит вправо
        starsNear.position.x -= dt * 6.5;
        if (starsNear.position.x < -90) starsNear.position.x += 180;
        starsFar.position.x -= dt * 2.2;
        if (starsFar.position.x < -260) starsFar.position.x += 520;

        starsNear.material.opacity = 0.85 + Math.sin(t * 3.1) * 0.08;
        starsFar.material.opacity = 0.92 + Math.sin(t * 1.7 + 1) * 0.05;

        // туманность еле дышит
        neb1.material.opacity = 0.85 + Math.sin(t * 0.5) * 0.08;
        neb2.material.opacity = 0.68 + Math.cos(t * 0.42) * 0.07;

        // корабль покачивается
        holder.position.y = 1 + Math.sin(t * 1.25) * 0.35;
        holder.rotation.z = Math.sin(t * 0.85) * 0.045;
        holder.rotation.x = Math.sin(t * 0.6 + 2) * 0.03;

        // пламя двигателя мерцает
        const flick = 0.85 + Math.random() * 0.3;
        flame.scale.set(14 * flick, 9 * flick, 1);
        flameCore.scale.set(6 * flick, 4 * flick, 1);
        engineLight.intensity = 34 * flick;

        camera.position.x = Math.sin(t * 0.25) * 1.6;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(loop);

    const close = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        renderer.dispose();
        if (shell.modal.parentNode) shell.modal.remove();
    };
    document.getElementById('sf-close').onclick = close;
    shell.modal.onclick = (e) => { if (e.target === shell.modal) close(); };
}
