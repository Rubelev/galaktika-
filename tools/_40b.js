'use strict';
// Проверка формы пути: min/max радиус орбитального пути против a(1±e) через SceneScale.orbitPx.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 10000 });
    const v = await cdp.evaluate(b, pg.sessionId, `(() => {
      const bodies = (window.CATALOG && window.CATALOG.bodies) || [];
      const byId = {}; bodies.forEach(b => byId[b.id] = b);
      const SS = window.SceneScale;
      const out = [];
      // для каждого пути: min/max радиус от центра сцены (0,0)
      const paths = Array.from(document.querySelectorAll('svg path')).filter(p => (p.getAttribute('d') || '').length > 20);
      paths.forEach(p => {
        let mn = 1e9, mx = 0;
        try { const L = p.getTotalLength(); for (let i = 0; i <= 300; i++) { const q = p.getPointAtLength(L * i / 300); const r = Math.hypot(q.x, q.y); if (r < mn) mn = r; if (r > mx) mx = r; } } catch (e) {}
        out.push({ mn: +mn.toFixed(1), mx: +mx.toFixed(1) });
      });
      const expected = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','pluto'].map(id => {
        const b = byId[id]; if (!b || b.a == null) return { id, exp: null };
        const rp = SS.orbitPx(b.a * (1 - b.e)), ra = SS.orbitPx(b.a * (1 + b.e));
        return { id, e: b.e, a: b.a, rp: +rp.toFixed(1), ra: +ra.toFixed(1) };
      });
      return { orbits: out.slice(0, 12), expected: expected };
    })()`);
    console.log(JSON.stringify(v, null, 1).slice(0, 4000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
