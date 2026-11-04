'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const GRAB = String.raw`(() => {
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + String(e.className).trim().split(/\s+/).slice(0,2).join('.') : '')) : 'null';
  const t = (window.__freezeAt !== undefined) ? window.__freezeAt : window.Motion.now();
  const rows = [];
  document.querySelectorAll('.planet[data-planet-id]').forEach(el => {
    const id = el.getAttribute('data-planet-id');
    const orbit = el.closest('.orbit');
    const rOrbit = orbit ? parseFloat(orbit.style.width) / 2 : null;
    const wc = window.WorldCoords.planetAt(id, t) || {x:NaN,y:NaN};
    const r = el.getBoundingClientRect();
    const inView = r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    const top = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    rows.push({ id, rOrbit, wcR: isFinite(wc.x) ? Math.hypot(wc.x, wc.y) : null, dev: isFinite(wc.x) ? Math.abs(Math.hypot(wc.x, wc.y) - rOrbit) : null,
                rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inView, top: D(top), wc: [Math.round(wc.x), Math.round(wc.y)] });
  });
  const sun = document.querySelector('.sun');
  const cs = sun ? getComputedStyle(sun) : null;
  return { rows, sun: sun ? { rect: (() => { const r = sun.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(),
      radius: cs.borderRadius, bg: cs.background.slice(0, 120), shadow: cs.boxShadow.slice(0, 160), transform: cs.transform.slice(0, 80) } : null,
    scale: (() => { const s = document.querySelector('.solar-system'); const m = (s.style.transform || '').match(/scale\(([-\d.]+)\)/); return m ? +m[1] : null; })() };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    for (const [k, q] of [['z03', '&zoom=0.3'], ['t45s135', '&tilt=45&spin=135'], ['z4', '&zoom=4']]) {
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&freeze=100000' + q + '&token=' + token, { wait: 8000 });
        out[k] = await cdp.evaluate(b, pg.sessionId, GRAB);
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    }
    fs.writeFileSync(path.join(OUT, '_3d_diag.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1).slice(0, 6000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

