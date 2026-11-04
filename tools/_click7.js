'use strict';
// Повторный аудит: ровно 34 цели кликабельности, по одной чистой загрузке на цель.
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
  const ids = ['globe-modal','systems-modal','fleet-modal','settings-modal','codex-modal','quest-modal','tr-wrap','pv-fly','fleet-card','ship-flight'];
  const shown = ids.filter(id => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; });
  return { globe: (() => { const g = document.getElementById('globe-modal'); return g ? getComputedStyle(g).display : 'none'; })(),
    overlays: shown.join('|'),
    toast: (() => { const t = document.querySelector('#toast-box .toast:last-child'); return t ? t.textContent.slice(0, 90) : ''; })(),
    cam: cam(), body: document.body.className,
    checks: Array.from(document.querySelectorAll('input[type=checkbox]')).map(c => c.id + '=' + (c.checked ? 1 : 0)).join(','),
    viewCls: (document.getElementById('view-panel') || {}).className || '',
    title: document.title, qa: !!document.getElementById('qa-report') };
})()`;

// 34 цели: 9 планет + 3 луны + портал + астероид + 4 борта + 8 кнопок панели + 4 чекбокса + 2 кнопки меню + 2 пустых места
const T = [
    { n: 'планета mercury', g: 'planet', sel: '.planet[data-planet-id="mercury"]', dbl: true },
    { n: 'планета venus', g: 'planet', sel: '.planet[data-planet-id="venus"]', dbl: true },
    { n: 'планета earth', g: 'planet', sel: '.planet[data-planet-id="earth"]', dbl: true },
    { n: 'планета mars', g: 'planet', sel: '.planet[data-planet-id="mars"]', dbl: true },
    { n: 'планета jupiter', g: 'planet', sel: '.planet[data-planet-id="jupiter"]', dbl: true },
    { n: 'планета saturn', g: 'planet', sel: '.planet[data-planet-id="saturn"]', dbl: true },
    { n: 'планета uranus', g: 'planet', sel: '.planet[data-planet-id="uranus"]', dbl: true },
    { n: 'планета neptune', g: 'planet', sel: '.planet[data-planet-id="neptune"]', dbl: true },
    { n: 'планета pluto', g: 'planet', sel: '.planet[data-planet-id="pluto"]', dbl: true },
    { n: 'луна Луна', g: 'moon', sel: '.moon[data-moon="Луна"]', dbl: true },
    { n: 'луна Титан', g: 'moon', sel: '.moon[data-moon="Титан"]', dbl: true },
    { n: 'луна Европа', g: 'moon', sel: '.moon[data-moon="Европа"]', dbl: true },
    { n: 'Врата', g: 'portal', sel: '.portal', dbl: false },
    { n: 'астероид пояса', g: 'asteroid', dbl: false, ast: true },
    { n: 'флот fleet-0', g: 'ship', sel: '.ship-marker[data-sid="fleet-0"]', dbl: true },
    { n: 'торговец earth-mars-0', g: 'ship', sel: '.ship-marker[data-sid="trade-earth-mars-0"]', dbl: true },
    { n: 'гражданский civil-5', g: 'ship', sel: '.ship-marker[data-sid="civil-5"]', dbl: true },
    { n: 'пират pirate-0', g: 'ship', sel: '.ship-marker[data-sid="pirate-0"]', dbl: true },
    { n: 'зум +', g: 'panel', sel: '.zoom-btn[onclick="solarZoomIn()"]', dbl: false },
    { n: 'зум −', g: 'panel', sel: '.zoom-btn[onclick="solarZoomOut()"]', dbl: false },
    { n: 'наклон ▲', g: 'panel', sel: '.d-btn.up', dbl: false },
    { n: 'наклон ▼', g: 'panel', sel: '.d-btn.down', dbl: false },
    { n: 'поворот ◀', g: 'panel', sel: '.d-btn.left', dbl: false },
    { n: 'поворот ▶', g: 'panel', sel: '.d-btn.right', dbl: false },
    { n: 'сброс •', g: 'panel', sel: '.d-btn.center', dbl: false },
    { n: 'Фильтры', g: 'panel', sel: '.view-head', dbl: false },
    { n: 'чекбокс Все маршруты', g: 'check', sel: '#routes-all', dbl: false },
    { n: 'чекбокс Только свои', g: 'check', sel: '#routes-own', dbl: false },
    { n: 'чекбокс Маршруты флотов', g: 'check', sel: '#fleet-routes-toggle', dbl: false },
    { n: 'чекбокс Станции и лифты', g: 'check', sel: '#station-toggle', dbl: false },
    { n: 'меню Флот', g: 'menu', sel: '.menu-btn[onclick="openFleet()"]', dbl: false },
    { n: 'меню Торговля', g: 'menu', sel: '#trade-btn', dbl: false },
    { n: 'пустое место 700,760', g: 'empty', point: [700, 760], dbl: false },
    { n: 'пустое место 500,120', g: 'empty', point: [500, 120], dbl: false }
];

const AST = `(() => {
  try {
    const days = (simulatedTime - EPOCH_MS) / DAY_MS;
    const p = beltPos(0, days);
    const sp = WorldCoords.toScreen(p, { scale: scale, tiltDeg: rotX, spinDeg: rotZ, panX: posX, panY: posY }, { width: innerWidth, height: innerHeight });
    return { x: Math.round(sp.x), y: Math.round(sp.y) };
  } catch (e) { return null; }
})()`;

const GEOM = (sel) => `(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : 'null';
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || getComputedStyle(el).display === 'none') return { invisible: true, w: Math.round(r.width) };
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { offscreen: true, x: Math.round(x), y: Math.round(y) };
  const st = (document.elementsFromPoint(x, y) || []).slice(0, 6);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height),
           stack: st.map(D), hitSelf: st.some(e => e === el || el.contains(e) || e.contains(el)) };
})()`;

const GEOM_PT = (x, y) => `(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : 'null';
  return { x: ${x}, y: ${y}, w: 0, h: 0, stack: (document.elementsFromPoint(${x}, ${y}) || []).slice(0, 6).map(D), hitSelf: null };
})()`;

(async () => {
    const b = await cdp.launch();
    const results = [];
    for (const t of T) {
        const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
        const pg = await cdp.newPage(b, url, { wait: 8200 });
        const sid = pg.sessionId;
        if (t.g === 'ship' || t.g === 'asteroid') {
            await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
            await cdp.sleep(500);
        }
        let geom = null;
        if (t.sel) geom = await cdp.evaluate(b, sid, GEOM(t.sel));
        else if (t.ast) {
            const pt = await cdp.evaluate(b, sid, AST);
            geom = pt ? await cdp.evaluate(b, sid, GEOM_PT(pt.x, pt.y)) : null;
        } else geom = await cdp.evaluate(b, sid, GEOM_PT(t.point[0], t.point[1]));
        const before = await cdp.evaluate(b, sid, STATE);
        if (geom && !geom.offscreen && !geom.invisible) {
            const n = t.dbl ? 2 : 1;
            for (let i = 0; i < n; i++) {
                await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
                await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
                await cdp.sleep(90);
            }
            await cdp.sleep(t.dbl ? 1800 : 900);
        }
        const after = await cdp.evaluate(b, sid, STATE);
        results.push({ name: t.n, group: t.g, sel: t.sel || null, point: t.point || null, dbl: !!t.dbl, geom: geom, before: before, after: after });
        console.log('done', t.n, '| top:', geom && geom.stack ? geom.stack[0] : (geom && (geom.offscreen ? 'OFFSCREEN' : 'INVISIBLE')), '| globe:', after.globe, '| ovl:', after.overlays.slice(0, 30), '| scale:', after.cam.scale);
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    fs.writeFileSync(path.join(OUT, '_click7.json'), JSON.stringify(results, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
