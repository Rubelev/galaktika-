'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 10000 });
    const v = await cdp.evaluate(b, pg.sessionId, `(() => {
      const t = (window.Motion && window.Motion.now) ? window.Motion.now() : Date.now();
      const SS = window.SceneScale, WC = window.WorldCoords;
      const vals = [0.39, 0.72, 1, 1.52, 2.77, 5.2, 9.54, 19.19, 30.07, 39.48, 67.8, 506];
      const cmp = vals.map(a => ({ a: a, wc: +WC.orbitRadius(a).toFixed(6), ss: SS ? +SS.orbitPx(a).toFixed(6) : null, diff: SS ? Math.abs(WC.orbitRadius(a) - SS.orbitPx(a)) : null }));
      const pluto = WC.planetAt('pluto', t);
      return { sceneScale: typeof window.SceneScale, cmp: cmp, maxDiff: Math.max(...cmp.map(c => c.diff === null ? -1 : c.diff)),
               pluto: pluto ? { x: +pluto.x.toFixed(1), y: +pluto.y.toFixed(1), r: +Math.hypot(pluto.x, pluto.y).toFixed(1) } : null,
               planetsAtKeys: Object.keys(WC.planetsAt(t)).length };
    })()`);
    console.log(JSON.stringify(v, null, 1).slice(0, 4000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
