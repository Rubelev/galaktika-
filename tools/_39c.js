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
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 10000 });
    const v = await cdp.evaluate(b, pg.sessionId, `(() => {
      const p = document.querySelector('.planet[data-planet-id="pluto"]');
      const c = document.querySelector('.moon[data-moon="Харон"]');
      const out = {};
      if (p && c) { const a = p.getBoundingClientRect(), d = c.getBoundingClientRect(); out.charon = { dx: +(d.left - a.left).toFixed(1), dy: +(d.top - a.top).toFixed(1), dist: +Math.hypot(d.left - a.left, d.top - a.top).toFixed(1) }; }
      out.pluto = p ? { l: Math.round(p.getBoundingClientRect().left), t: Math.round(p.getBoundingClientRect().top), w: Math.round(p.getBoundingClientRect().width) } : null;
      out.charonEl = c ? { l: Math.round(c.getBoundingClientRect().left), t: Math.round(c.getBoundingClientRect().top), w: Math.round(c.getBoundingClientRect().width) } : null;
      const w = p ? p.parentElement : null;
      out.wrap = w ? w.style.transform : null;
      out.scene = getComputedStyle(document.querySelector('.solar-system')).transform.slice(0, 60);
      return out;
    })()`);
    console.log(JSON.stringify(v, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
