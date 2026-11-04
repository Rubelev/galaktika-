// Шаги 1.3 и 1.4 без браузера: выполняем catalog-render.js в Node с мини-DOM.
// Приёмка по ЧИСЛАМ: тела, орбиты, клики, переключение системы.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const jsDir = path.join(__dirname, '..', 'src', 'galaktika.Web', 'wwwroot', 'js');

const res = [];
const check = (n, ok, d) => res.push({ n, ok: !!ok, d: d === undefined ? '' : String(d) });

class El {
    constructor(tag) {
        this.tagName = tag; this.style = {}; this.children = []; this.attrs = {};
        this.listeners = {}; this.className = ''; this.textContent = ''; this.id = '';
    }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = v; }
    getAttribute(k) { return this.attrs[k]; }
    appendChild(c) { this.children.push(c); c.parent = this; return c; }
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
    dispatchEvent(ev) { (this.listeners[ev.type] || []).forEach(fn => fn.call(this, ev)); return true; }
    insertAdjacentHTML() { }
    getElementsByTagName() { return []; }
}

function makeEnv(search) {
    const scene = new El('div');
    scene.style.transform = 'scale(1) rotateX(0deg) rotateZ(0deg)';
    const body = new El('body');
    const doc = {
        readyState: 'complete',
        title: '',
        head: new El('head'),
        body: body,
        createElement: t => new El(t),
        createElementNS: (ns, t) => new El(t),
        querySelector: sel => (sel === '.solar-system' ? scene : null),
        querySelectorAll: () => [],
        getElementById: id => body.children.filter(c => c.id === id)[0] || null,
        addEventListener: () => { }
    };
    const win = {
        document: doc,
        location: { search: search, pathname: '/' },
        setTimeout: (fn) => { win.__timers.push(fn); return 0; },
        setInterval: () => 0,
        requestAnimationFrame: (fn) => { if (win.__raf < 3) { win.__raf++; win.__timers.push(fn); } return 0; },
        URLSearchParams: URLSearchParams,
        MouseEvent: class { constructor(type, o) { this.type = type; Object.assign(this, o || {}); } },
        open: () => { },
        console: console,
        __timers: [], __raf: 0
    };
    win.window = win;
    const ctx = { window: win, document: doc, location: win.location, URLSearchParams, MouseEvent: win.MouseEvent, console, setTimeout: win.setTimeout, setInterval: () => 0, requestAnimationFrame: win.requestAnimationFrame, Math, Date, JSON, isFinite, document: doc };
    vm.createContext(ctx);
    return { win, ctx, scene, doc };
}

function loadLib(ctx) {
    ['orbit-kepler.js', 'scene-model.js', 'system-runtime.js', 'catalog.js'].forEach(f => {
        vm.runInContext(fs.readFileSync(path.join(jsDir, f), 'utf8'), ctx, { filename: f });
    });
    // каталожные системы регистрируем как в system-boot.js
    vm.runInContext(`
        (function(){
            var c = window.CATALOG, out = {};
            (c.bodies||[]).forEach(function(b){
                var sid = b.system || (b.id === 'warprime' ? 'war' : 'sol');
                if (!out[sid]) out[sid] = {id:sid, px_per_au:185, time_scale:1, bodies:[], ships:c.ships||[], agents:[]};
                out[sid].bodies.push(b);
            });
            Object.keys(out).forEach(function(k){ window.SystemRuntime.register(out[k]); });
            window.SystemRuntime.activate('sol');
        })();
    `, ctx);
}

function run(search) {
    const env = makeEnv(search);
    loadLib(env.ctx);
    vm.runInContext(fs.readFileSync(path.join(jsDir, 'catalog-render.js'), 'utf8'), env.ctx, { filename: 'catalog-render.js' });
    for (let i = 0; i < 6 && env.win.__timers.length; i++) {
        const fn = env.win.__timers.shift();
        try { fn(); } catch (e) { env.error = e; }
    }
    return env;
}

// --- 1.1/1.2: тела и орбиты ---
const env = run('?render=catalog');
const layer = env.doc.body.children.find(c => c.id === 'catalog-layer') ||
              env.scene.children.find(c => c.id === 'catalog-layer');
const svg = env.scene.children.find(c => c.tagName === 'svg');
check('запуск без ошибок', !env.error, env.error && env.error.message);
check('тел в слое = 42', layer && layer.children.length === 42, layer && layer.children.length);
check('орбит = 41', svg && svg.children.length === 41, svg && svg.children.length);
const title = env.win.document.title || '';
check('метрика отклонения ≤ 6 px', /dev=([\d.]+)/.test(title) && parseFloat(title.match(/dev=([\d.]+)/)[1]) <= 6, title);
check('каталог ≤ 20 КБ', fs.statSync(path.join(jsDir, 'catalog.js')).size / 1024 <= 20,
    (fs.statSync(path.join(jsDir, 'catalog.js')).size / 1024).toFixed(1) + ' КБ');

// --- 1.3: клики ---
if (layer) {
    const five = layer.children.slice(0, 5);
    five.forEach(el => el.dispatchEvent({ type: 'click', stopPropagation() { } }));
    check('5 кликов обработаны', env.win.__catalogClicks === 5, env.win.__catalogClicks);
}

// --- 1.4: переключение системы ---
const envWar = run('?render=catalog&system=war');
const layerWar = envWar.doc.body.children.find(c => c.id === 'catalog-layer') ||
                 envWar.scene.children.find(c => c.id === 'catalog-layer');
check('Вармир: 6 тел', layerWar && layerWar.children.length === 6, layerWar && layerWar.children.length);
check('Вармир: активная система', envWar.win.SystemRuntime.currentId() === 'war', envWar.win.SystemRuntime.currentId());

const failed = res.filter(r => !r.ok);
res.forEach(r => console.log((r.ok ? 'OK   ' : 'FAIL ') + r.n + (r.d ? ' — ' + r.d : '')));
console.log(`\n=== ИТОГ ===\nпроверок: ${res.length} | успешно: ${res.length - failed.length} | провалов: ${failed.length}`);
process.exit(failed.length ? 1 : 0);
