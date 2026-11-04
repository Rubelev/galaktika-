'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    const read = `(() => {
      const o = document.querySelectorAll('.orbit');
      const first = o[0];
      const co = first ? getComputedStyle(first) : null;
      const e = document.querySelector('.planet[data-planet-id="earth"]');
      const w = e ? e.parentElement : null;
      return { orbitTr: first ? first.style.transform : null, orbitAnim: co ? co.animationName + ' ' + co.animationDuration : null,
               orbitCount: o.length, wrapTr: w ? w.style.transform : null, sim: (typeof simulatedTime !== 'undefined' ? simulatedTime : null) };
    })()`;
    const a = await cdp.evaluate(b, sid, read);
    await cdp.sleep(2500);
    const c = await cdp.evaluate(b, sid, read);
    console.log(JSON.stringify({ first: a, second: c }, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
