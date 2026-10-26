// Чертёж корабля: 3D-модель в виде каркаса, вращается, подписана.
// Сам корабль в игре не меняется — это отдельный технический вид.
import * as THREE from '/lib/three/three.module.js';

const MEDROBOT = {
    label: 'Медробот МР-1',
    note: 'полнофункциональный медицинский комплекс',
    parts: [
        ['Корпус', 'герметичный, 4 койки'],
        ['Манипуляторы', 'две руки, 7 степеней свободы'],
        ['Сканер', 'диагностика за 40 секунд'],
        ['Кресло оператора', 'одно место'],
        ['Реактор', 'автономный, 12 лет']
    ]
};

const SHAPES = {
    jet_scout: { len: 3.2, wid: 0.9, hull: 3, nose: 1, wings: 2, guns: 1, engines: 2, label: 'Разведчик' },
    jet_hauler: { len: 4.4, wid: 1.6, hull: 4, nose: 0.6, wings: 0, guns: 1, engines: 4, label: 'Грузовик' },
    ion_courier: { len: 3.8, wid: 1.1, hull: 3, nose: 1, wings: 1, guns: 1, engines: 2, label: 'Курьер' },
    ion_prospector: { len: 4.0, wid: 1.4, hull: 4, nose: 0.5, wings: 0, guns: 1, engines: 3, label: 'Добытчик' },
    plasma_interceptor: { len: 3.4, wid: 1.8, hull: 3, nose: 1, wings: 2, guns: 2, engines: 2, label: 'Перехватчик' },
    plasma_lancer: { len: 4.6, wid: 1.2, hull: 4, nose: 1, wings: 1, guns: 2, engines: 3, label: 'Ланцет' },
    grav_frigate: { len: 5.2, wid: 2.0, hull: 5, nose: 1, wings: 0, guns: 3, engines: 3, label: 'Фрегат' },
    grav_colossus: { len: 7.0, wid: 2.8, hull: 6, nose: 1, wings: 0, guns: 5, engines: 4, label: 'Линкор' }
};

let state = null;

function wireMat(color) {
    return new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.85 });
}

export function open(shipId) {
    let def = SHAPES[shipId];
    if (shipId === 'medrobot') {
        def = { len: 3, wid: 1, hull: 1, nose: 0, wings: 0, guns: 0, engines: 0, label: MEDROBOT.label, isRobot: true };
    }
    def = def || SHAPES.jet_hauler;
    let modal = document.getElementById('bp-modal');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="bp-modal" class="market-modal"><div class="market-modal-content" style="width:760px">' +
            '<span class="close-btn" onclick="closeBlueprint()">&times;</span>' +
            '<div id="bp-title" class="tut-title" style="margin-bottom:4px"></div>' +
            '<div class="bp-note">чертёж · каркасная модель · вращение мышью</div>' +
            '<canvas id="bp-canvas" width="720" height="420" style="width:100%;border-radius:10px;background:#04070d"></canvas>' +
            '<div id="bp-parts" class="bp-parts"></div>' +
            '</div></div>');
        modal = document.getElementById('bp-modal');
    }
    modal.style.display = 'flex';
    document.getElementById('bp-title').textContent = 'Чертёж: ' + def.label;
    document.getElementById('bp-parts').innerHTML = (shipId === 'medrobot')
        ? MEDROBOT.parts.map(p => `<div class="bp-part"><span>${p[0]}</span><b>${p[1]}</b></div>`).join('')
        : partList(def);
    start(document.getElementById('bp-canvas'), def);
}

export function close() {
    const m = document.getElementById('bp-modal');
    if (m) m.style.display = 'none';
    stop();
}

function partList(def) {
    const parts = [
        ['Корпус', def.hull + ' секций'],
        ['Нос', def.nose ? 'есть' : 'нет'],
        ['Крылья', def.wings ? def.wings + ' шт' : 'нет'],
        ['Орудия', def.guns + ' шт'],
        ['Двигатели', def.engines + ' шт']
    ];
    return parts.map(p => `<div class="bp-part"><span>${p[0]}</span><b>${p[1]}</b></div>`).join('');
}

export function start(canvas, def) {
    stop();
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.setClearColor(0x04070d, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, canvas.width / canvas.height, 0.1, 100);
    camera.position.set(4.2, 2.8, 6.2);
    camera.lookAt(0, 0, 0);

    const ship = new THREE.Group();
    const cyan = 0x7fe3ff, amber = 0xffd479;

    if (def.isRobot) {
        // корпус-капсула
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 2.2, 10), wireMat(cyan));
        body.rotation.z = Math.PI / 2;
        ship.add(body);
        // голова-сканер
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), wireMat(cyan));
        head.position.set(0, 0.75, 0);
        ship.add(head);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), wireMat(amber));
        eye.position.set(0, 0.8, 0.42);
        ship.add(eye);
        // две руки с локтями
        [-1, 1].forEach(side => {
            const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), wireMat(cyan));
            shoulder.position.set(side * 0.95, 0.35, 0);
            ship.add(shoulder);
            const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), wireMat(cyan));
            elbow.position.set(side * 1.0, 0.0, 0);
            ship.add(elbow);
            const fore = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), wireMat(cyan));
            fore.position.set(side * 1.0, -0.4, 0.15);
            fore.rotation.x = 0.4;
            ship.add(fore);
            const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.3), wireMat(amber));
            hand.position.set(side * 1.0, -0.75, 0.35);
            ship.add(hand);
        });
        // база-колёсная платформа
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 1.2), wireMat(cyan));
        base.position.y = -1.25;
        ship.add(base);
        scene.add(ship);
    } else {

    // корпус — секции
    for (let i = 0; i < def.hull; i++) {
        const w = def.wid * (1 - i * 0.12);
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.6, def.len / def.hull), wireMat(cyan));
        box.position.z = -def.len / 2 + (i + 0.5) * (def.len / def.hull);
        ship.add(box);
    }
    // нос
    if (def.nose) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(def.wid * 0.45, def.len * 0.22, 6), wireMat(cyan));
        cone.rotation.x = -Math.PI / 2;
        cone.position.z = def.len / 2 + def.len * 0.09;
        ship.add(cone);
    }
    // крылья
    for (let i = 0; i < (def.wings || 0); i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(def.wid * 1.4, 0.06, def.len * 0.3), wireMat(cyan));
        wing.position.set(side * def.wid * 1.1, -0.05, -def.len * 0.1);
        ship.add(wing);
    }
    // орудия
    for (let i = 0; i < def.guns; i++) {
        const g = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, def.len * 0.35, 6), wireMat(amber));
        g.rotation.x = Math.PI / 2;
        g.position.set((i % 2 === 0 ? 1 : -1) * def.wid * 0.28, 0.12, def.len * 0.28);
        ship.add(g);
    }
    // двигатели
    for (let i = 0; i < def.engines; i++) {
        const angle = (i / def.engines) * Math.PI * 2;
        const r = def.wid * 0.45;
        const e = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), wireMat(amber));
        e.rotation.x = Math.PI / 2;
        e.position.set(Math.cos(angle) * r, Math.sin(angle) * r * 0.5, -def.len / 2 - 0.2);
        ship.add(e);
    }

    scene.add(ship);
    }
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    let drag = false, lastX = 0, rot = 0.6;
    const onDown = e => { drag = true; lastX = e.clientX; };
    const onMove = e => { if (!drag) return; rot += (e.clientX - lastX) * 0.01; lastX = e.clientX; };
    const onUp = () => { drag = false; };
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    let raf = null;
    const loop = () => {
        if (document.getElementById('bp-modal').style.display !== 'flex') { raf = null; return; }
        if (!drag) rot += 0.004;
        ship.rotation.y = rot;
        ship.rotation.x = Math.sin(rot * 0.7) * 0.12;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
    };
    loop();

    state = {
        stop: () => {
            if (raf) cancelAnimationFrame(raf);
            canvas.removeEventListener('mousedown', onDown);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            renderer.dispose();
            scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
    };
}

export function stop() {
    if (state) { state.stop(); state = null; }
}
