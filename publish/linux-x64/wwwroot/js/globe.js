// Глобус планеты: вращение мышью, автовращение, метки и переход к поверхности.
import * as THREE from '/lib/three/three.module.js';

let state = null;

function latLonToVec3(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
    );
}

export function start(canvas, textureUrl, markers, onPick, opts) {
    stop();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth || 760, canvas.clientHeight || 520, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 3.1);

    const loader = new THREE.TextureLoader();
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.02 });
    loader.load(textureUrl, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        material.map = tex;
        material.needsUpdate = true;
    });

    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), material);
    globe.rotation.y = -Math.PI / 2;
    scene.add(globe);

    // кольца газовых гигантов
    const wantsRings = (opts && opts.rings) || /saturn|jupiter|uranus|neptune|gas/i.test(String(textureUrl));
    if (wantsRings) {
        const rc = document.createElement('canvas');
        rc.width = 512; rc.height = 8;
        const rg = rc.getContext('2d');
        const img = rg.createImageData(512, 8);
        for (let x = 0; x < 512; x++) {
            const t = x / 512;
            let a = 0.30 + 0.30 * Math.sin(t * 70);
            a *= 0.5 + 0.5 * Math.sin(t * 13);
            const shade = 200 + Math.sin(t * 25) * 35;
            for (let y = 0; y < 8; y++) {
                const i = (y * 512 + x) * 4;
                img.data[i] = shade; img.data[i+1] = shade * 0.94; img.data[i+2] = shade * 0.80;
                img.data[i+3] = Math.max(0, Math.min(255, a * 255));
            }
        }
        rg.putImageData(img, 0, 0);
        const rtex = new THREE.CanvasTexture(rc);
        rtex.colorSpace = THREE.SRGBColorSpace;
        const rings = new THREE.Mesh(
            new THREE.RingGeometry(1.35, 2.15, 96, 1),
            new THREE.MeshBasicMaterial({ map: rtex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
        );
        rings.rotation.x = -Math.PI / 2 + 0.28;
        scene.add(rings);
    }

    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.035, 48, 32),
        new THREE.MeshBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.12, side: THREE.BackSide })
    );
    scene.add(halo);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(3, 1.5, 2.5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x88bbff, 0.8);
    rim.position.set(-3, -1, -2);
    scene.add(rim);

    // метки: маленькие сферы, прикреплённые к глобусу
    const markGeo = new THREE.SphereGeometry(0.013, 12, 10);
    const picks = [];
    (markers || []).forEach(m => {
        const col = m.color || 0x7fe3ff;
        const dot = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: col }));
        dot.position.copy(latLonToVec3(m.lat, m.lon, 1.02));
        dot.userData.marker = m;
        globe.add(dot);
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.03, 0.045, 20),
            new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
        );
        ring.position.copy(dot.position.clone().multiplyScalar(1.001));
        ring.lookAt(0, 0, 0);
        dot.add(new THREE.Mesh());
        picks.push(dot);
    });

    // вращение
    let dragging = false, lastX = 0, lastY = 0, idleSince = performance.now();
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let autoSpin = true;

    const onDown = e => {
        dragging = true;
        autoSpin = false;
        idleSince = performance.now();
        const p = e.touches ? e.touches[0] : e;
        lastX = p.clientX; lastY = p.clientY;
        if (e.preventDefault) e.preventDefault();
    };
    const onMove = e => {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        target.y += (p.clientX - lastX) * 0.006;
        target.x += (p.clientY - lastY) * 0.006;
        target.x = Math.max(-1.2, Math.min(1.2, target.x));
        lastX = p.clientX; lastY = p.clientY;
    };
    const onUp = () => { dragging = false; idleSince = performance.now(); };

    const raycaster = new THREE.Raycaster();
    const onClick = e => {
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(picks, false);
        if (hits.length && onPick) onPick(hits[0].object.userData.marker);
    };

    // подпись метки при наведении
    const tip = (opts && opts.tip) ? opts.tip : null;
    const onHover = e => {
        if (!tip) return;
        const rect = canvas.getBoundingClientRect();
        const v = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        raycaster.setFromCamera(v, camera);
        const hit = raycaster.intersectObjects(picks, false)[0];
        if (hit) {
            tip.textContent = hit.object.userData.marker.label;
            tip.style.display = 'block';
        } else {
            tip.style.display = 'none';
        }
    };
    canvas.addEventListener('mousemove', onHover);

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    let zoom = 3.1;
    const onWheel = e => {
        zoom = Math.max(2.0, Math.min(5.0, zoom + e.deltaY * 0.0012));
        camera.position.z = zoom;
        if (e.preventDefault) e.preventDefault();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const resize = () => {
        const w = canvas.clientWidth || 760, h = canvas.clientHeight || 520;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();

    let raf = null;
    const loop = () => {
        // автовращение, если не трогали больше 4 секунд
        if (!dragging && performance.now() - idleSince > 4000) autoSpin = true;
        if (autoSpin && !dragging) target.y += 0.0015;
        current.x += (target.x - current.x) * 0.12;
        current.y += (target.y - current.y) * 0.12;
        globe.rotation.x = current.x;
        globe.rotation.y = -Math.PI / 2 + current.y;
        halo.rotation.x = current.x;
        halo.rotation.y = globe.rotation.y;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
    };
    loop();

    state = {
        stop: () => {
            cancelAnimationFrame(raf);
            canvas.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            canvas.removeEventListener('click', onClick);
            canvas.removeEventListener('mousemove', onHover);
            canvas.removeEventListener('touchstart', onDown);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
            canvas.removeEventListener('wheel', onWheel);
            window.removeEventListener('resize', resize);
            renderer.dispose();
            scene.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) {
                    if (o.material.map) o.material.map.dispose();
                    o.material.dispose();
                }
            });
        }
    };
}

export function stop() {
    if (state) { state.stop(); state = null; }
}
