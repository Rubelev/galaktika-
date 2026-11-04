'use strict';
// Финальная проверка кликабельности: чистая загрузка на объект, длинное ожидание эффекта.
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
  const shown = Array.from(document.querySelectorAll('[id$="-modal"], #tr-wrap, #pv-fly, #fleet-card, #ship-flight, #ship-flight-canvas, #blocks3d-wrap, #design-wrap, #globe-modal'))
    .filter(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map(e => (e.id || e.className));
  return { globe: (() => { const g = document.getElementById('globe-modal'); return g ? getComputedStyle(g).display : 'none'; })(),
    overlays: shown.join('|'),
    toast: (() => { const t = document.querySelector('#toast-box .toast:last-child'); return t ? t.textContent.slice(0, 90) : ''; })(),
    cam: cam(), body: document.body.className, checked: Array.from(document.querySelectorAll('input[type=checkbox]')).map(c => c.id + '=' + (c.checked ? 1 : 0)).join(','),
    viewCls: (document.getElementById('view-panel') || {}).className || '',
    titles: Array.from(document.querySelectorAll('#globe-title,#pv-title,.fleet-card h3,#fleet-card b')).map(e => e.textContent.slice(0, 40)).join('|') };
})()`;

const T = [
    { name: 'планета earth', sel: '.planet[data-planet-id="earth"]', dbl: true, expect: 'globe/наезд' },
    { name: 'планета mars', sel: '.planet[data-planet-id="mars"]', dbl: true, expect: 'globe/наезд' },
    { name: 'планета jupiter', sel: '.planet[data-planet-id="jupiter"]', dbl: true, expect: 'globe/наезд' },
    { name: 'луна Луна', sel: '.moon[data-moon="Луна"]', dbl: true, expect: 'карточка/планетарный вид' },
    { name: 'луна Титан', sel: '.moon[data-moon="Титан"]', dbl: true, expect: 'карточка/планетарный вид' },
    { name: 'Врата', sel: '.portal', dbl: false, expect: 'окно систем' },
    { name: 'флот fleet-0', sel: '.ship-marker[data-sid="fleet-0"]', dbl: true, expect: 'карточка борта' },
    { name: 'торговец earth-mars-0', sel: '.ship-marker[data-sid="trade-earth-mars-0"]', dbl: true, expect: 'карточка рейса' },
    { name: 'меню Флот', sel: '.menu-btn[onclick="openFleet()"]', dbl: false, expect: 'окно флота' },
    { name: 'меню Системы', sel: '#systems-btn', dbl: false, expect: 'окно систем' },
    { name: 'меню Торговля', sel: '#trade-btn', dbl: false, expect: 'окно торговли' }
];

const STACK = (sel) => `(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) : 'null';
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
  const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { offscreen: true, x: Math.round(x), y: Math.round(y), stack: [], hitSelf: false };
  const st = (document.elementsFromPoint(x, y) || []).slice(0, 7);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height),
           stack: st.map(e => D(e) + (e === el ? ' <<TARGET' : '')), hitSelf: st.some(e => e === el || e.contains(el)) };
})()`;

(async () => {
    const b = await cdp.launch();
    const results = [];
    for (const t of T) {
        const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
        const pg = await cdp.newPage(b, url, { wait: 7600 });
        const sid = pg.sessionId;
        if (t.sel && t.sel.indexOf('.ship-marker') === 0) {
            await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
            await cdp.sleep(400);
        }
        const geom = await cdp.evaluate(b, sid, STACK(t.sel));
        const before = await cdp.evaluate(b, sid, STATE);
        if (geom && !geom.offscreen) {
            const n = t.dbl ? 2 : 1;
            for (let i = 0; i < n; i++) {
                await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
                await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geom.x, y: geom.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
                await cdp.sleep(90);
            }
            await cdp.sleep(2600);
        }
        const after = await cdp.evaluate(b, sid, STATE);
        results.push({ name: t.name, sel: t.sel, expect: t.expect, dbl: t.dbl, geom: geom, before: before, after: after });
        fs.writeFileSync(path.join(OUT, '_click5.json'), JSON.stringify(results, null, 1), 'utf8');
        console.log('done', t.name, '| top:', geom && geom.stack ? geom.stack[0] : 'n/a', '| globe:', after.globe, '| overlays:', after.overlays.slice(0, 40), '| scale:', after.cam.scale);
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
