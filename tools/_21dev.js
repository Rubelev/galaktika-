'use strict';
// v=1182: deviation of catalog bodies from their drawn orbit lines + moons near planets.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const CHECK = `(() => {
  const scene = document.querySelector('.solar-system');
  const tr = scene ? (scene.style.transform || '') : '';
  const mScale = tr.match(/scale\\(([-\\d.]+)\\)/);
  const mRotX = tr.match(/rotateX\\(([-\\d.]+)deg\\)/);
  const scale = mScale ? +mScale[1] : 1;
  const rotX = mRotX ? +mRotX[1] * Math.PI / 180 : 0;
  // экран = центр + (x*scale, y*scale*cos(rotX)) при spin=0
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const toScreen = (x, y) => [cx + x * scale, cy + y * scale * Math.cos(rotX)];
  const out = { scale: scale, rotX: rotX, bodies: [], moons: [] };
  const planets = Array.from(document.querySelectorAll('.planet[data-planet-id]')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0.5; });
  const centers = planets.map(e => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-planet-id'), x: r.left + r.width/2, y: r.top + r.height/2 }; });
  planets.forEach(e => {
    const id = e.getAttribute('data-planet-id');
    const r = e.getBoundingClientRect();
    const px = r.left + r.width/2, py = r.top + r.height/2;
    let dev = null, n = 0;
    try {
      const path = window.CatalogBridge.path(id, 96);
      if (path && path.length) {
        let best = 1e9;
        path.forEach(q => { const s = toScreen(q.x, q.y); const d = Math.hypot(s[0]-px, s[1]-py); if (d < best) best = d; });
        dev = Math.round(best * 10) / 10; n = path.length;
      }
    } catch (err) { }
    out.bodies.push({ id: id, x: Math.round(px), y: Math.round(py), w: Math.round(r.width), dev: dev, pathPts: n });
  });
  document.querySelectorAll('.moon[data-moon]').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width < 0.5) return;
    const px = r.left + r.width/2, py = r.top + r.height/2;
    let best = 1e9, who = null;
    centers.forEach(c => { const d = Math.hypot(c.x-px, c.y-py); if (d < best) { best = d; who = c.id; } });
    out.moons.push({ m: e.getAttribute('data-moon'), planet: who, dist: Math.round(best) });
  });
  return out;
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    for (const [name, q] of [['t0', ''], ['t45', '&tilt=45&spin=20'], ['t85', '&tilt=85']]) {
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog' + q + '&token=' + token, { wait: 9000 });
        out[name] = await cdp.evaluate(b, pg.sessionId, CHECK);
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
        console.log(name, JSON.stringify(out[name].bodies.slice(0, 12)));
    }
    fs.writeFileSync(path.join(OUT, '_21_dev.json'), JSON.stringify(out, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
