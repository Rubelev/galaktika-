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
      const out = {};
      out.planetAtPluto = window.WorldCoords.planetAt('pluto', t);
      out.planetAtNeptune = window.WorldCoords.planetAt('neptune', t);
      out.planetsAt = window.WorldCoords.planetsAt ? Object.keys(window.WorldCoords.planetsAt(t)) : null;
      out.orbitRadius = { a395: window.WorldCoords.orbitRadius(39.48), a30069: window.WorldCoords.orbitRadius(30.069), a67: window.WorldCoords.orbitRadius(67.8) };
      const e = document.querySelector('.planet[data-planet-id="pluto"]');
      out.el = e ? { tr: e.style.transform, left: e.style.left, top: e.style.top, cls: e.className, html: e.outerHTML.slice(0, 300) } : null;
      const n = document.querySelector('.planet[data-planet-id="neptune"]');
      out.neptuneTr = n ? n.style.transform : null;
      return out;
    })()`);
    console.log(JSON.stringify(v, null, 1).slice(0, 3000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
