'use strict';
// Клики НАСТОЯЩИМИ событиями мыши (CDP Input.dispatchMouseEvent) + стек elementFromPoint.
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
  const overlays = Array.from(document.querySelectorAll('body *')).filter(e => {
    const s = getComputedStyle(e); const z = parseInt(s.zIndex || '0', 10);
    return (s.position === 'fixed' || s.position === 'absolute') && z >= 9000 && s.display !== 'none' && s.visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
  }).map(e => (e.id ? '#' + e.id : '.' + String(e.className).trim().split(/\\s+/)[0]) + '@' + (getComputedStyle(e).zIndex));
  return {
    globe: (() => { const g = document.getElementById('globe-modal'); return g ? getComputedStyle(g).display : 'none'; })(),
    globeTitle: (document.getElementById('globe-title') || {}).textContent || '',
    overlays: overlays.join('|'),
    toast: (() => { const t = document.querySelector('#toast-box .toast:last-child'); return t ? t.textContent.slice(0, 90) : ''; })(),
    cam: cam(),
    body: document.body.className,
    checks: Array.from(document.querySelectorAll('input[type=checkbox]')).map(c => c.id + '=' + (c.checked ? 1 : 0)).join(','),
    pv: !!document.getElementById('pv-fly'),
    fleetCard: !!document.getElementById('fleet-card'),
    shipFlight: !!document.getElementById('ship-flight') || !!document.getElementById('ship-flight-canvas'),
    systems: (() => { const s = document.getElementById('systems-modal'); return s ? getComputedStyle(s).display : 'none'; })(),
    fleetModal: (() => { const s = document.getElementById('fleet-modal'); return s ? getComputedStyle(s).display : 'none'; })()
  };
})()`;

const STACK = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : 'null';
  return { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height),
           stack: (document.elementsFromPoint(x, y) || []).slice(0, 6).map(e => D(e) + (e === el ? ' <<TARGET' : '')) };
})()`;

const TARGETS = [
    { name: 'планета earth (двойной)', sel: '.planet[data-planet-id="earth"]', dbl: true, expect: 'globe' },
    { name: 'планета mars (двойной)', sel: '.planet[data-planet-id="mars"]', dbl: true, expect: 'globe' },
    { name: 'планета pluto (двойной)', sel: '.planet[data-planet-id="pluto"]', dbl: true, expect: 'overlay' },
    { name: 'луна Луна (двойной)', sel: '.moon[data-moon="Луна"]', dbl: true, expect: 'overlay' },
    { name: 'Врата (одиночный)', sel: '.portal', dbl: false, expect: 'systems' },
    { name: 'станция луны (одиночный)', sel: '.moon-station', dbl: false, expect: 'nothing' },
    { name: 'портал-маркер (одиночный)', sel: '.portal .portal-core', dbl: false, expect: 'systems' },
    { name: 'корабль флота fleet-0 (двойной)', sel: '.ship-marker[data-sid="fleet-0"]', dbl: true, expect: 'fleetCard' },
    { name: 'торговец earth->mars (двойной)', sel: '.ship-marker[data-sid="trade-earth-mars-0"]', dbl: true, expect: 'shipFlight' },
    { name: 'гражданский civil-5 (двойной)', sel: '.ship-marker[data-sid="civil-5"]', dbl: true, expect: 'shipFlight' },
    { name: 'рудный belt-0 (двойной)', sel: '.ship-marker[data-sid="belt-0"]', dbl: true, expect: 'shipFlight' },
    { name: 'пират pirate-0 (двойной)', sel: '.ship-marker[data-sid="pirate-0"]', dbl: true, expect: 'shipFlight' },
    { name: 'меню Флот (одиночный)', sel: '.menu-btn[onclick="openFleet()"]', dbl: false, expect: 'fleetModal' },
    { name: 'меню Системы', sel: '#systems-btn', dbl: false, expect: 'systems' },
    { name: 'меню Торговля', sel: '#trade-btn', dbl: false, expect: 'overlay' },
    { name: 'меню Разведсводка', sel: '#npc-btn', dbl: false, expect: 'overlay' },
    { name: '☰ меню', sel: '.menu-toggle', dbl: false, expect: 'state' },
    { name: 'зум +', sel: '.zoom-btn[onclick="solarZoomIn()"]', dbl: false, expect: 'camera' },
    { name: 'зум −', sel: '.zoom-btn[onclick="solarZoomOut()"]', dbl: false, expect: 'camera' },
    { name: 'наклон ▲', sel: '.d-btn.up', dbl: false, expect: 'camera' },
    { name: 'наклон ▼', sel: '.d-btn.down', dbl: false, expect: 'camera' },
    { name: 'поворот ◀', sel: '.d-btn.left', dbl: false, expect: 'camera' },
    { name: 'поворот ▶', sel: '.d-btn.right', dbl: false, expect: 'camera' },
    { name: 'сброс •', sel: '.d-btn.center', dbl: false, expect: 'camera' },
    { name: 'чекбокс Все маршруты', sel: '#routes-all', dbl: false, expect: 'state' },
    { name: 'чекбокс Только свои', sel: '#routes-own', dbl: false, expect: 'state' },
    { name: 'чекбокс Маршруты флотов', sel: '#fleet-routes-toggle', dbl: false, expect: 'state' },
    { name: 'чекбокс Станции и лифты', sel: '#station-toggle', dbl: false, expect: 'state' },
    { name: 'кнопка Фильтры', sel: '.view-head', dbl: false, expect: 'state' },
    { name: 'наставник «Понятно»', sel: '.mentor-next', dbl: false, expect: 'state' },
    { name: 'пустое место 700,760', point: [700, 760], dbl: false, expect: 'nothing' },
    { name: 'пустое место 500,120', point: [500, 120], dbl: false, expect: 'nothing' }
];

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9500 });
    const sid = sessionId;
    const setUniform = async () => {
        await cdp.evaluate(b, sid, `(() => {
            try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){}
            try { if (typeof rotX === 'number' && rotX !== 0) { rotX = 0; } if (typeof rotZ === 'number' && rotZ !== 0) { rotZ = 0; } window.updateSolarTransform(); } catch(e){}
            const rp = document.getElementById('resources-panel'); if (rp) rp.style.display = 'none';
            const li = document.getElementById('left-menu-items'); if (li) li.style.display = 'flex';
            return 1; })()`);
        await cdp.sleep(200);
    };
    const closeAll = async () => {
        await cdp.evaluate(b, sid, `(() => {
            try { if (typeof window.closeGlobe === 'function') window.closeGlobe(); } catch(e){}
            document.querySelectorAll('[id$="-modal"]').forEach(m => { if (getComputedStyle(m).display !== 'none') m.style.display = 'none'; });
            ['pv-fly','fleet-card','ship-flight','toast-box'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
            document.querySelectorAll('.ship-flight-shell,.pv-fly').forEach(e => e.remove());
            return 1; })()`);
        await cdp.sleep(200);
    };
    const results = [];
    for (const t of TARGETS) {
        await closeAll();
        await setUniform();
        let geom = null;
        if (t.sel) geom = await cdp.evaluate(b, sid, STACK(t.sel));
        else {
            geom = await cdp.evaluate(b, sid, `(() => { const x=${t.point[0]}, y=${t.point[1]};
                const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#'+e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0,2).join('.') : '')) : 'null';
                return { x: x, y: y, w: 0, h: 0, stack: (document.elementsFromPoint(x,y)||[]).slice(0,6).map(D) }; })()`);
        }
        if (!geom) { results.push({ name: t.name, missing: true }); continue; }
        const before = await cdp.evaluate(b, sid, STATE);
        const n = t.dbl ? 2 : 1;
        for (let i = 0; i < n; i++) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
            await cdp.sleep(90);
        }
        await cdp.sleep(650);
        const after = await cdp.evaluate(b, sid, STATE);
        results.push({ name: t.name, sel: t.sel || null, expect: t.expect, dbl: !!t.dbl, geom: geom, before: before, after: after });
        console.log('clicked', t.name, JSON.stringify(after).slice(0, 120));
    }
    fs.writeFileSync(path.join(OUT, '_click2.json'), JSON.stringify(results, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
