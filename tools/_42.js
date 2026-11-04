'use strict';
// v=1232: перицентр пути против Ω + atan2(sinω·cos i, cosω) + стабильность путей 1/4.5/8 с.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const CHECK = `(() => {
  const bodies = (window.CATALOG && window.CATALOG.bodies) || [];
  const byId = {}; bodies.forEach(b => byId[b.id] = b);
  const paths = Array.from(document.querySelectorAll('svg path')).filter(p => (p.getAttribute('d') || '').length > 20);
  const rows = [];
  document.querySelectorAll('.planet[data-planet-id]').forEach(e => {
    const id = e.getAttribute('data-planet-id');
    const w = e.parentElement;
    let px = null, py = null;
    if (w && w.style.transform) { const m = w.style.transform.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/); if (m) { px = parseFloat(m[1]); py = parseFloat(m[2]); } }
    let best = 1e9, bp = null;
    paths.forEach(p => { try { const L = p.getTotalLength(); let b2 = 1e9; for (let i = 0; i <= 120; i++) { const q = p.getPointAtLength(L*i/120); const d = Math.hypot(q.x-px, q.y-py); if (d < b2) b2 = d; } if (b2 < best) { best = b2; bp = p; } } catch (e) {} });
    let periAngle = null, periR = null;
    if (bp) { const L = bp.getTotalLength(); let rmin = 1e9; for (let i = 0; i <= 600; i++) { const q = bp.getPointAtLength(L*i/600); const r = Math.hypot(q.x, q.y); if (r < rmin) { rmin = r; periAngle = -Math.atan2(q.y, q.x) * 180 / Math.PI; } } periR = rmin; }
    if (periAngle !== null) { while (periAngle < 0) periAngle += 360; periAngle = periAngle % 360; }
    const b = byId[id];
    let expected = null;
    if (b && b.om != null && b.w != null) {
      const i = (b.i || 0) * Math.PI / 180, w = b.w * Math.PI / 180;
      expected = (b.om + Math.atan2(Math.sin(w) * Math.cos(i), Math.cos(w)) * 180 / Math.PI + 360) % 360;
    }
    rows.push({ id: id, periAngle: periAngle === null ? null : +periAngle.toFixed(2), expected: expected === null ? null : +expected.toFixed(2),
                diff: (periAngle !== null && expected !== null) ? +((((periAngle - expected) % 360 + 540) % 360) - 180).toFixed(2) : null, periR: periR ? +periR.toFixed(1) : null });
  });
  return { paths: paths.length, rows: rows };
})()`;

(async () => {
    const out = {};
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    out.t1 = await cdp.evaluate(b, sid, CHECK);
    await cdp.sleep(3500);
    out.t2 = await cdp.evaluate(b, sid, CHECK);
    await cdp.sleep(3500);
    out.t3 = await cdp.evaluate(b, sid, CHECK);
    fs.writeFileSync(path.join(OUT, '_42.json'), JSON.stringify(out, null, 1), 'utf8');
    for (const k of ['t1', 't2', 't3']) {
        console.log(k, 'paths:', out[k].paths);
        out[k].rows.forEach(r => console.log('  ', r.id, 'peri', r.periAngle, 'expected', r.expected, 'diff', r.diff, 'periR', r.periR));
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
