'use strict';
// Клики настоящими событиями мыши. Три группы, каждая с чистой загрузкой.
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
  const shown = Array.from(document.querySelectorAll('[id$="-modal"], #tr-wrap, #pv-fly, #fleet-card, #ship-flight, #ship-flight-canvas'))
    .filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0)
    .map(e => (e.id || e.className));
  return {
    globe: (() => { const g = document.getElementById('globe-modal'); return g ? getComputedStyle(g).display : 'none'; })(),
    overlays: shown.join('|'),
    toast: (() => { const t = document.querySelector('#toast-box .toast:last-child'); return t ? t.textContent.slice(0, 90) : ''; })(),
    cam: cam(), body: document.body.className,
    checks: Array.from(document.querySelectorAll('input[type=checkbox]')).map(c => c.id + '=' + (c.checked ? 1 : 0)).join(','),
    viewCls: (document.getElementById('view-panel') || {}).className || '',
    leftCls: (document.getElementById('left-menu') || {}).className || '',
    leftItems: (() => { const e = document.getElementById('left-menu-items'); return e ? Math.round(e.getBoundingClientRect().height) : -1; })(),
    kids: document.body.children.length
  };
})()`;

const STACK = (sel, px, py) => `(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : 'null';
  let x = ${px === undefined ? 'null' : px}, y = ${py === undefined ? 'null' : py}, el = null;
  if (${JSON.stringify(sel)} !== null) { el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
    const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  const st = (document.elementsFromPoint(x, y) || []).slice(0, 6);
  return { x: Math.round(x), y: Math.round(y), w: el ? Math.round(el.getBoundingClientRect().width) : 0,
           h: el ? Math.round(el.getBoundingClientRect().height) : 0,
           stack: st.map(e => D(e) + (e === el ? ' <<TARGET' : '')), hitSelf: el ? st.some(e => e === el || e.contains(el)) : null };
})()`;

async function runGroup(b, groupName, targets, prepare) {
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const pg = await cdp.newPage(b, url, { wait: 9500 });
    const sid = pg.sessionId;
    if (prepare) await cdp.evaluate(b, sid, prepare);
    await cdp.sleep(400);
    const out = [];
    for (const t of targets) {
        // чистое состояние
        await cdp.evaluate(b, sid, `(() => {
            try { if (typeof window.closeGlobe === 'function') window.closeGlobe(); } catch(e){}
            ['systems-modal','fleet-modal','settings-modal','codex-modal','quest-modal','admin-modal','globe-modal','user-list-modal','tr-wrap','pv-fly','fleet-card','ship-flight','ship-flight-canvas','toast-box','trade-wrap'].forEach(id => { const e = document.getElementById(id); if (e && id !== 'ship-flight-canvas') e.remove(); });
            document.querySelectorAll('[id$="-modal"]').forEach(m => { m.style.display = 'none'; });
            const rp = document.getElementById('resources-panel'); if (rp) rp.style.display = 'none';
            const li = document.getElementById('left-menu-items'); if (li) li.style.display = 'flex';
            try { window.solarReset(); } catch(e){}
            try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){}
            try { if (typeof rotX === 'number' && rotX !== 0) { rotX = 0; } if (typeof rotZ === 'number' && rotZ !== 0) { rotZ = 0; } window.updateSolarTransform(); } catch(e){}
            return 1; })()`);
        await cdp.sleep(230);
        const geom = t.sel ? await cdp.evaluate(b, sid, STACK(t.sel)) : await cdp.evaluate(b, sid, STACK(null, t.point[0], t.point[1]));
        if (!geom) { out.push({ group: groupName, name: t.name, missing: true }); continue; }
        const before = await cdp.evaluate(b, sid, STATE);
        const n = t.dbl ? 2 : 1;
        for (let i = 0; i < n; i++) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
            await cdp.sleep(80);
        }
        await cdp.sleep(700);
        const after = await cdp.evaluate(b, sid, STATE);
        out.push({ group: groupName, name: t.name, sel: t.sel || null, point: t.point || null, expect: t.expect, dbl: !!t.dbl, geom: geom, before: before, after: after });
    }
    // закрыть вкладку
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    return out;
}

const SCENE = [
    { name: 'планета earth (двойной)', sel: '.planet[data-planet-id="earth"]', dbl: true, expect: 'globe' },
    { name: 'планета mars (двойной)', sel: '.planet[data-planet-id="mars"]', dbl: true, expect: 'globe' },
    { name: 'планета jupiter (двойной)', sel: '.planet[data-planet-id="jupiter"]', dbl: true, expect: 'globe' },
    { name: 'планета pluto (двойной)', sel: '.planet[data-planet-id="pluto"]', dbl: true, expect: 'overlay' },
    { name: 'луна Луна (двойной)', sel: '.moon[data-moon="Луна"]', dbl: true, expect: 'overlay' },
    { name: 'луна Титан (двойной)', sel: '.moon[data-moon="Титан"]', dbl: true, expect: 'overlay' },
    { name: 'Врата (одиночный)', sel: '.portal', dbl: false, expect: 'systems' },
    { name: 'станция луны (одиночный)', sel: '.moon-station', dbl: false, expect: 'nothing' },
    { name: 'флот fleet-0 (двойной)', sel: '.ship-marker[data-sid="fleet-0"]', dbl: true, expect: 'fleetCard' },
    { name: 'торговец earth-mars-0 (двойной)', sel: '.ship-marker[data-sid="trade-earth-mars-0"]', dbl: true, expect: 'shipFlight' },
    { name: 'гражданский civil-5 (двойной)', sel: '.ship-marker[data-sid="civil-5"]', dbl: true, expect: 'shipFlight' },
    { name: 'рудный belt-0 (двойной)', sel: '.ship-marker[data-sid="belt-0"]', dbl: true, expect: 'shipFlight' },
    { name: 'пират pirate-0 (двойной)', sel: '.ship-marker[data-sid="pirate-0"]', dbl: true, expect: 'shipFlight' },
    { name: 'пустое место 700,760', point: [700, 760], dbl: false, expect: 'nothing' },
    { name: 'пустое место 500,120', point: [500, 120], dbl: false, expect: 'nothing' }
];

const PANEL = [
    { name: 'зум +', sel: '.zoom-btn[onclick="solarZoomIn()"]', expect: 'camera' },
    { name: 'зум −', sel: '.zoom-btn[onclick="solarZoomOut()"]', expect: 'camera' },
    { name: 'наклон ▲', sel: '.d-btn.up', expect: 'camera' },
    { name: 'наклон ▼', sel: '.d-btn.down', expect: 'camera' },
    { name: 'поворот ◀', sel: '.d-btn.left', expect: 'camera' },
    { name: 'поворот ▶', sel: '.d-btn.right', expect: 'camera' },
    { name: 'сброс •', sel: '.d-btn.center', expect: 'camera' },
    { name: 'чекбокс Все маршруты', sel: '#routes-all', expect: 'state' },
    { name: 'чекбокс Только свои', sel: '#routes-own', expect: 'state' },
    { name: 'чекбокс Маршруты флотов', sel: '#fleet-routes-toggle', expect: 'state' },
    { name: 'чекбокс Станции и лифты', sel: '#station-toggle', expect: 'state' },
    { name: 'кнопка Фильтры', sel: '.view-head', expect: 'state' }
];

const MENU = [
    { name: 'меню ИГРА/Флот', sel: '.menu-btn[onclick="openFleet()"]', expect: 'fleetModal' },
    { name: 'меню Системы', sel: '#systems-btn', expect: 'systems' },
    { name: 'меню Торговля', sel: '#trade-btn', expect: 'overlay' },
    { name: 'меню Разведсводка', sel: '#npc-btn', expect: 'overlay' },
    { name: 'меню Постройки', sel: '#buildings-btn', expect: 'overlay' },
    { name: 'меню Луны и газ', sel: '#moons-menu-btn', expect: 'overlay' },
    { name: '☰ меню', sel: '.menu-toggle', expect: 'state' },
    { name: 'наставник «Понятно»', sel: '.mentor-next', expect: 'state' }
];

(async () => {
    const b = await cdp.launch();
    const all = [];
    const prep = `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`;
    all.push(...await runGroup(b, 'scene', SCENE, prep));
    all.push(...await runGroup(b, 'panel', PANEL, prep));
    all.push(...await runGroup(b, 'menu', MENU, prep));
    fs.writeFileSync(path.join(OUT, '_click3.json'), JSON.stringify(all, null, 1), 'utf8');
    console.log('done', all.length);
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
