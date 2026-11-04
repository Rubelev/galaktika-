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
      const lm = document.querySelector('.left-menu');
      const txt = lm ? lm.innerText.replace(/\\n+/g, ' | ').slice(0, 600) : null;
      return { allPlanets: document.querySelectorAll('.planet').length,
               byId: Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(e => e.getAttribute('data-planet-id')),
               plutoAny: document.querySelectorAll('[data-planet-id="pluto"]').length,
               moons: document.querySelectorAll('.moon').length,
               menuText: txt };
    })()`);
    console.log(JSON.stringify(v, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
