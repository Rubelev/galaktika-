'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const PROBE = `(() => {
  const sim = window.__freezeAt;
  const out = { sim: sim, motionNow: window.Motion.now(), items: [] };
  const paths = Array.from(document.querySelectorAll('#trade-traffic path.trade-path')).map(p => {
    const d = p.getAttribute('d') || '';
    const m = d.match(/M\\s*(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+Q\\s*(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)/);
    return { el: p, m: m ? m.slice(1).map(Number) : null, d: d };
  });
  document.querySelectorAll('#trade-traffic .ship-marker').forEach(el => {
    const sid = el.dataset.sid || '';
    const x = parseFloat(el.dataset.coreX), y = parseFloat(el.dataset.coreY);
    // ближайший путь
    let best = null, bd = Infinity;
    paths.forEach(p => {
      if (!p.m) return;
      const q = p.el.getPointAtLength ? null : null;
      let total = 0; try { total = p.el.getTotalLength(); } catch (e) { return; }
      for (let i = 0; i <= 60; i++) {
        const pt = p.el.getPointAtLength(total * i / 60);
        const dd = Math.hypot(pt.x - x, pt.y - y);
        if (dd < bd) { bd = dd; best = p; }
      }
    });
    let calc = null;
    if (best && best.m) {
      const phase = ((parseFloat(el.dataset.seed || 0) * 0.137 + 0.5) % 1);
      const art = el.dataset.art || 'ion_courier';
      const A = best.m;
      const r0 = window.Motion.curvePose(A[0], A[1], A[2], A[3], A[4], A[5], art, phase, sim);
      const r1 = window.Motion.curvePose(A[0], A[1], A[2], A[3], A[4], A[5], art, phase, sim + 60000);
      const r2 = window.Motion.curvePose(A[0], A[1], A[2], A[3], A[4], A[5], art, phase, sim + 600000);
      calc = { u0: r0.u, x0: +r0.x.toFixed(1), y0: +r0.y.toFixed(1), span: r0.span,
               d60: +Math.hypot(r1.x - r0.x, r1.y - r0.y).toFixed(2),
               d600: +Math.hypot(r2.x - r0.x, r2.y - r0.y).toFixed(2),
               u60: r1.u, u600: r2.u, km: Math.round(r0.km), lenPx: Math.round(r0.lenPx),
               v: Math.round(r0.vKmS), spanEff: Math.round(r0.span/1000) };
    }
    out.items.push({ sid, domU: el.dataset.u, domSpan: el.dataset.span, domX: x, domY: y,
                     pathD: best ? best.d : null, distToPath: +bd.toFixed(2), calc });
  });
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9000 });
    const val = await cdp.evaluate(b, sessionId, PROBE);
    console.log(JSON.stringify(val, null, 1));
    fs.writeFileSync(path.join(OUT, '_diag_curvepose.json'), JSON.stringify(val, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
