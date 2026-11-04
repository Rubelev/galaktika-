'use strict';
// По одной ЧИСТОЙ загрузке на каждый клик — координаты не «плывут» от прошлых тестов.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const STATE = `(() => {
  const cam = () => { const tr = (document.querySelector('.solar-system') || { style: {} }).style.transform || '';
    const g = re => { const m = tr.match(re); return m ? +m[1] : null; };
    return { scale: g(/scale\\(([-\\d.]+)\\)/), rotX: g(/rotateX\\(([-\\d.]+)deg\\)/), rotZ: g(/rotateZ\\(([-\\d.]+)deg\\)/) }; };
  const shown = Array.from(document.querySelectorAll('[id$="-modal"], #tr-wrap, #pv-fly, #fleet-card, #ship-flight, #ship-flight-canvas, #blocks3d-wrap, #design-wrap'))
    .filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
    .map(e => (e.id || e.className));
  return { globe: (() => { const g = document.getElementById('globe-modal'); return g ? getComputedStyle(g).display : 'none'; })(),
    overlays: shown.join('|'),
    toast: (() => { const t = document.querySelector('#toast-box .toast:last-child'); return t ? t.textContent.slice(0, 90) : ''; })(),
    cam: cam(), body: document.body.className,
    checks: Array.from(document.querySelectorAll('input[type=checkbox]')).map(c => c.id + '=' + (c.checked ? 1 : 0)).join(','),
    viewCls: (document.getElementById('view-panel') || {}).className || '',
    leftCls: (document.getElementById('left-menu') || {}).className || '' };
})()`;

const TARGETS = [
    { g: 'scene', name: 'планета earth (двойной)', sel: '.planet[data-planet-id="earth"]', dbl: true, expect: 'globe' },
    { g: 'scene', name: 'планета mars (двойной)', sel: '.planet[data-planet-id="mars"]', dbl: true, expect: 'globe' },
    { g: 'scene', name: 'планета jupiter (двойной)', sel: '.planet[data-planet-id="jupiter"]', dbl: true, expect: 'globe' },
    { g: 'scene', name: 'планета pluto (двойной)', sel: '.planet[data-planet-id="pluto"]', dbl: true, expect: 'overlay' },
    { g: 'scene', name: 'планета mercury (двойной)', sel: '.planet[data-planet-id="mercury"]', dbl: true, expect: 'globe' },
    { g: 'scene', name: 'луна Луна (двойной)', sel: '.moon[data-moon="Луна"]', dbl: true, expect: 'overlay' },
    { g: 'scene', name: 'луна Титан (двойной)', sel: '.moon[data-moon="Титан"]', dbl: true, expect: 'overlay' },
    { g: 'scene', name: 'Врата (одиночный)', sel: '.portal', dbl: false, expect: 'systems' },
    { g: 'scene', name: 'станция луны (одиночный)', sel: '.moon-station', dbl: false, expect: 'nothing' },
    { g: 'scene', name: 'флот fleet-0 (двойной)', sel: '.ship-marker[data-sid="fleet-0"]', dbl: true, expect: 'fleetCard' },
    { g: 'scene', name: 'торговец earth-mars-0 (двойной)', sel: '.ship-marker[data-sid="trade-earth-mars-0"]', dbl: true, expect: 'shipFlight' },
    { g: 'scene', name: 'гражданский civil-5 (двойной)', sel: '.ship-marker[data-sid="civil-5"]', dbl: true, expect: 'shipFlight' },
    { g: 'scene', name: 'рудный belt-0 (двойной)', sel: '.ship-marker[data-sid="belt-0"]', dbl: true, expect: 'shipFlight' },
    { g: 'scene', name: 'пират pirate-0 (двойной)', sel: '.ship-marker[data-sid="pirate-0"]', dbl: true, expect: 'shipFlight' },
    { g: 'scene', name: 'пустое место 700,760', point: [700, 760], dbl: false, expect: 'nothing' },
    { g: 'scene', name: 'пустое место 500,120', point: [500, 120], dbl: false, expect: 'nothing' },
    { g: 'menu', name: 'меню ИГРА/Флот', sel: '.menu-btn[onclick="openFleet()"]', expect: 'fleetModal' },
    { g: 'menu', name: 'меню Системы', sel: '#systems-btn', expect: 'systems' },
    { g: 'menu', name: 'меню Торговля', sel: '#trade-btn', expect: 'overlay' },
    { g: 'menu', name: 'меню Разведсводка', sel: '#npc-btn', expect: 'overlay' },
    { g: 'menu', name: 'меню Постройки', sel: '#buildings-btn', expect: 'overlay' },
    { g: 'menu', name: 'меню Луны и газ', sel: '#moons-menu-btn', expect: 'overlay' },
    { g: 'menu', name: 'меню Ресурсы', sel: '.menu-btn[onclick="openResourcesPanel()"]', expect: 'state' },
    { g: 'menu', name: '☰ меню', sel: '.menu-toggle', expect: 'state' },
    { g: 'menu', name: 'наставник «Понятно»', sel: '.mentor-next', expect: 'state' }
];

const STACK = (sel, px, py) => `(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : 'null';
  let x = ${px === undefined ? 'null' : px}, y = ${py === undefined ? 'null' : py}, el = null;
  if (${JSON.stringify(sel)} !== null) { el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { offscreen: true, x: Math.round(x), y: Math.round(y), stack: [], hitSelf: false, w: 0, h: 0 };
  const st = (document.elementsFromPoint(x, y) || []).slice(0, 7);
  return { x: Math.round(x), y: Math.round(y), w: el ? Math.round(el.getBoundingClientRect().width) : 0,
           h: el ? Math.round(el.getBoundingClientRect().height) : 0,
           stack: st.map(e => D(e) + (e === el ? ' <<TARGET' : '')), hitSelf: el ? st.some(e => e === el || e.contains(el)) : null };
})()`;

(async () => {
    const b = await cdp.launch();
    const results = [];
    for (const t of TARGETS) {
        const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
        const pg = await cdp.newPage(b, url, { wait: 8800 });
        const sid = pg.sessionId;
        if (t.g === 'scene') {
            await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
            await cdp.sleep(500);
        }
        const geom = t.sel ? await cdp.evaluate(b, sid, STACK(t.sel)) : await cdp.evaluate(b, sid, STACK(null, t.point[0], t.point[1]));
        const before = await cdp.evaluate(b, sid, STATE);
        if (geom && !geom.offscreen) {
            const n = t.dbl ? 2 : 1;
            for (let i = 0; i < n; i++) {
                await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
                await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
                await cdp.sleep(80);
            }
            await cdp.sleep(800);
        }
        const after = await cdp.evaluate(b, sid, STATE);
        results.push({ group: t.g, name: t.name, sel: t.sel || null, point: t.point || null, expect: t.expect, dbl: !!t.dbl, geom: geom, before: before, after: after });
        console.log('done', t.name, geom && geom.stack ? geom.stack[0] : 'null');
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    fs.writeFileSync(path.join(OUT, '_click4.json'), JSON.stringify(results, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
