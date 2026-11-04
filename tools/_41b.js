'use strict';
// v=1232: угол большой оси пути против Ω+ω из каталога.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 11000 });
    const v = await cdp.evaluate(b, pg.sessionId, `(() => {
      const bodies = (window.CATALOG && window.CATALOG.bodies) || [];
      const byId = {}; bodies.forEach(b => byId[b.id] = b);
      const paths = Array.from(document.querySelectorAll('svg path')).filter(p => (p.getAttribute('d') || '').length > 20);
      // для каждой планеты: путь, ближайший к её позиции; угол самой дальней точки
      const out = [];
      document.querySelectorAll('.planet[data-planet-id]').forEach(e => {
        const id = e.getAttribute('data-planet-id');
        const w = e.parentElement;
        let px = null, py = null;
        if (w && w.style.transform) { const m = w.style.transform.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/); if (m) { px = parseFloat(m[1]); py = parseFloat(m[2]); } }
        let best = 1e9, bp = null;
        paths.forEach(p => { try { const L = p.getTotalLength(); let b2 = 1e9; for (let i = 0; i <= 120; i++) { const q = p.getPointAtLength(L*i/120); const d = Math.hypot(q.x-px, q.y-py); if (d < b2) b2 = d; } if (b2 < best) { best = b2; bp = p; } } catch (e) {} });
        let angle = null, rmax = 0;
        if (bp) { const L = bp.getTotalLength(); for (let i = 0; i <= 400; i++) { const q = bp.getPointAtLength(L*i/400); const r = Math.hypot(q.x, q.y); if (r > rmax) { rmax = r; angle = Math.atan2(q.y, q.x) * 180 / Math.PI; } } }
        const b2 = byId[id];
        out.push({ id: id, pathAngle: angle === null ? null : +angle.toFixed(1), omegaPlusOmega: b2 ? +(((b2.om || 0) + (b2.w || 0)) % 360).toFixed(1) : null, e: b2 ? b2.e : null, i: b2 ? b2.i : null });
      });
      return out;
    })()`);
    console.log(JSON.stringify(v, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
