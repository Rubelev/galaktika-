'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const PROBE = `(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0,2).join('.') : '')) : 'null';
  const btn = document.getElementById('globe-surface');
  if (!btn) return { noBtn: true };
  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const stack = (document.elementsFromPoint(x, y) || []).slice(0, 6).map(D);
  return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
           x: Math.round(x), y: Math.round(y), stack: stack,
           hasOnclick: !!btn.onclick, onclickType: typeof btn.onclick,
           pe: getComputedStyle(btn).pointerEvents, z: getComputedStyle(btn).zIndex,
           modalDisplay: (() => { const m = document.getElementById('globe-modal'); return m ? getComputedStyle(m).display : 'none'; })() };
})()`;

const ST = `(() => { const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && r.width > 2; };
  return { pv: document.body.classList.contains('pv-mode'), blocks: !!document.getElementById('blocks3d-wrap'), blocksVis: vis(document.getElementById('blocks3d-wrap')),
           globe: (() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })(), solar: vis(document.querySelector('.solar-system-container')),
           errs: (window.__errs || []).slice(0, 5) }; })()`;

(async () => {
    const b = await cdp.launch();
    const out = {};
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    await cdp.evaluate(b, sid, `(() => { window.__errs = []; window.openGlobe('earth'); return 1; })()`);
    await cdp.sleep(1500);
    out.btn = await cdp.evaluate(b, sid, PROBE);
    // 1) JS-клик по кнопке
    await cdp.evaluate(b, sid, `(() => { const b = document.getElementById('globe-surface'); if (b) b.click(); return 1; })()`);
    await cdp.sleep(5000);
    out.afterJsClick = await cdp.evaluate(b, sid, ST);
    // если PV не открылся — вернёмся на карту и попробуем снова через реальный клик по центру
    if (!out.afterJsClick.pv) {
        await cdp.evaluate(b, sid, `(() => { try { window.closeGlobe(); } catch(e){} return 1; })()`);
        await cdp.sleep(500);
        await cdp.evaluate(b, sid, `(() => { window.openGlobe('earth'); return 1; })()`);
        await cdp.sleep(1200);
        const g = await cdp.evaluate(b, sid, `(() => { const b = document.getElementById('globe-surface'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2) }; })()`);
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(6000);
        out.afterRealClick = await cdp.evaluate(b, sid, ST);
    }
    out.final = await cdp.evaluate(b, sid, ST);
    fs.writeFileSync(path.join(OUT, '_pv_diag2.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
