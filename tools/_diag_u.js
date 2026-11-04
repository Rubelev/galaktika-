'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const PROBE = `(() => {
  const out = [];
  document.querySelectorAll('.ship-marker').forEach(el => {
    const m = (el.style.transform||'').match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    out.push({ sid: el.dataset.sid || '', title: el.title || '', x: m?+m[1]:null, y: m?+m[2]:null,
      u: el.dataset.u, span: el.dataset.span, t: el.dataset.t, dbg: el.dataset.dbg,
      coreX: el.dataset.coreX, coreY: el.dataset.coreY, seed: el.dataset.seed,
      layer: el.closest('#trade-traffic')?'trade':el.closest('#fleet-traffic')?'fleet':el.closest('#civil-traffic')?'civil':'other',
      display: getComputedStyle(el).display });
  });
  return { sim: window.__freezeAt, now: window.Motion && window.Motion.now(), scaleNow: window.__scaleNow,
           motionScale: window.Motion && window.Motion.getScale ? window.Motion.getScale() : null,
           ships: out };
})()`;

(async () => {
    const b = await cdp.launch();
    const get = async (f) => {
        const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=' + f + '&token=' + token;
        const { sessionId } = await cdp.newPage(b, url, { wait: 9000 });
        return await cdp.evaluate(b, sessionId, PROBE);
    };
    const a = await get(100000);
    const c = await get(100060);
    const d = await get(100600);
    const map = (s) => { const m = {}; s.ships.forEach(x => { if (x.sid) m[x.sid] = x; }); return m; };
    const ma = map(a), mc = map(c), md = map(d);
    const rows = [];
    Object.keys(ma).forEach(sid => {
        const A = ma[sid], C = mc[sid], D = md[sid];
        if (!A || !C) return;
        rows.push({ sid, layer: A.layer,
            d60: +Math.hypot(C.x - A.x, C.y - A.y).toFixed(2),
            d600: D ? +Math.hypot(D.x - A.x, D.y - A.y).toFixed(2) : null,
            uA: A.u, uC: C.u, uD: D ? D.u : null, span: A.span, seed: A.seed,
            tA: A.t, tC: C.t, coreAX: A.coreX, coreCX: C.coreX, disp: A.display });
    });
    rows.sort((p, q) => q.d60 - p.d60);
    console.log(JSON.stringify({ sims: [a.sim, c.sim, d.sim], scaleNow: a.scaleNow, motionScale: a.motionScale, rows }, null, 1));
    fs.writeFileSync(path.join(OUT, '_diag_u.json'), JSON.stringify({ sims: [a.sim, c.sim, d.sim], scaleNow: a.scaleNow, motionScale: a.motionScale, rows }, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
