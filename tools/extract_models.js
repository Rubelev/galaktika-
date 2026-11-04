// Выгружает все воксельные модели из models3d.js в models.json
// (общий источник для игры на three.js и для Python-рендера иконок).
//
// Запуск:  node tools/extract_models.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'galaktika.Web', 'wwwroot', 'js', 'models3d.js');
const OUT = path.join(ROOT, 'models.json');

// --- заглушка three.js: запоминаем цвет материала и позицию каждого инстанса ---
let currentMesh = null;

class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vec3(this.x, this.y, this.z); }
    applyMatrix4() { return this; }
    multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
}

class Color {
    constructor(c) { this.hex = typeof c === 'number' ? c : 0xffffff; }
    clone() { return new Color(this.hex); }
    setHex(h) { this.hex = h; return this; }
}

class Object3D {
    constructor() {
        this.children = [];
        this.position = new Vec3();
        this.rotation = new Vec3();
        this.scale = new Vec3(1, 1, 1);
        this.userData = {};
    }
    add(o) { this.children.push(o); return this; }
    traverse(fn) { fn(this); this.children.forEach((c) => c.traverse && c.traverse(fn)); }
}

class Group extends Object3D {}

class BoxGeometry {
    constructor(w, h, d) { this.width = w; this.height = h; this.depth = d; }
}

class Material {
    constructor(opts) {
        opts = opts || {};
        this.color = new Color(opts.color);
        this.emissive = new Color(opts.emissive || 0x000000);
        this.emissiveIntensity = opts.emissiveIntensity || 0;
    }
}

class Matrix4 {
    constructor() { this.arr = [0, 0, 0]; }
    makeTranslation(x, y, z) { this.arr = [x, y, z]; return this; }
    clone() { return this; }
}

class InstancedMesh extends Object3D {
    constructor(geo, mat, count) {
        super();
        this.geometry = geo;
        this.material = mat;
        this.count = count;
        this.instanceMatrix = { needsUpdate: false };
        this.instances = [];
        currentMesh = this;
    }
    setMatrixAt(i, m4) { this.instances[i] = m4.arr.slice(); }
    setColorAt() {}
}

class Mesh extends Object3D {
    constructor(geo, mat) { super(); this.geometry = geo; this.material = mat; }
}

class BufferGeometry { constructor() { this.attrs = {}; } setAttribute(k, v) { this.attrs[k] = v; } }
class BufferAttribute { constructor(arr, n) { this.array = arr; this.itemSize = n; } }
class TorusGeometry extends BoxGeometry {}
class CylinderGeometry extends BoxGeometry {}
class SphereGeometry extends BoxGeometry {}
class CircleGeometry extends BoxGeometry {}
class Float32BufferAttribute extends BufferAttribute {}

const THREE = {
    Group, Object3D, Mesh, InstancedMesh, BoxGeometry, TorusGeometry, CylinderGeometry,
    SphereGeometry, CircleGeometry, BufferGeometry, BufferAttribute, Float32BufferAttribute,
    Matrix4, MeshLambertMaterial: Material, MeshBasicMaterial: Material,
    MeshStandardMaterial: Material, MeshPhongMaterial: Material,
    Color, Vector3: Vec3, PointsMaterial: Material, Points: Mesh, LineBasicMaterial: Material,
    DoubleSide: 2, AdditiveBlending: 2, BackSide: 1
};

// --- песочница с window/document ---
const sandbox = {
    window: {},
    document: { createElement: () => ({ getContext: () => ({}) }) },
    console,
    THREE,
    Math,
    Date,
    location: { search: '' },
};
sandbox.window.THREE = THREE;
sandbox.globalThis = sandbox;

const code = fs.readFileSync(SRC, 'utf8');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'models3d.js' });

const M = sandbox.window.Models3D;
if (!M) {
    console.error('Не нашёл window.Models3D — проверь models3d.js');
    process.exit(1);
}

// --- список моделей: ключи из BUILDINGS + корабли ---
const kinds = [];
const srcText = code;
const re = /^\s{8}([a-z][a-z0-9_]*): function \(v/gm;
let m;
while ((m = re.exec(srcText)) !== null) kinds.push(m[1]);

const unique = [...new Set(kinds)].filter((k) => k !== 'ship');
const out = { unit: 0.5, generated: new Date().toISOString(), models: {} };

for (const kind of unique) {
    for (const variant of [1, 2, 3]) {
        let g;
        try {
            g = M.build(kind, variant, THREE);
        } catch (e) {
            continue;
        }
        if (!g) continue;
        const blocks = [];
        g.traverse((n) => {
            if (!n.instances) return;
            const hex = n.material && n.material.color ? n.material.color.hex : 0xffffff;
            n.instances.forEach((arr) => {
                if (!arr) return;
                blocks.push([arr[0], arr[1], arr[2], hex]);
            });
        });
        if (!blocks.length) continue;
        out.models[`${kind}:${variant}`] = { kind, variant, blocks };
        if (variant === 1) break;   // вариант 1 — основной, остальные только если есть
    }
}

// компактный формат: палитра + плоский массив [x,y,z,индекс цвета]
const compact = { unit: out.unit, generated: out.generated, models: {} };
for (const [key, model] of Object.entries(out.models)) {
    const palette = [];
    const paletteIndex = new Map();
    const flat = [];
    for (const [x, y, z, hex] of model.blocks) {
        let idx = paletteIndex.get(hex);
        if (idx === undefined) {
            idx = palette.length;
            palette.push(hex);
            paletteIndex.set(hex, idx);
        }
        flat.push(x, y, z, idx);
    }
    compact.models[key] = { kind: model.kind, variant: model.variant, palette, blocks: flat };
}
fs.writeFileSync(OUT, JSON.stringify(compact), 'utf8');
const total = Object.values(out.models).reduce((s, v) => s + v.blocks.length, 0);
console.log(`моделей: ${Object.keys(out.models).length} · блоков: ${total} · файл: ${(fs.statSync(OUT).size / 1024).toFixed(1)} КБ`);
console.log('ключи:', Object.keys(out.models).join(' '));
