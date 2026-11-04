'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const PROBE = `(() => {
  const cand = Array.from(document.querySelectorAll('div, pre, span')).filter(e => /FPS|fps/.test(e.textContent || '') && (e.textContent || '').length < 400 && e.children.length < 8);
  const el = cand[cand.length - 1];
  return { title: document.title, probe: el ? { id: el.id, cls: el.className, text: (el.textContent || '').trim().slice(0, 400) } : null,
           poss: cand.slice(-4).map(e => ({ id: e.id, cls: String(e.className).slice(0, 40), text: (e.textContent || '').trim().slice(0, 200) })),
           taps: (typeof window.__shipTaps !== 'undefined' ? (typeof window.__shipTaps === 'number' ? window.__shipTaps : Object.keys(window.__shipTaps || {}).length) : null) };
})()`;

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&perf2=1&token=' + token, { wait: 9000 });
    const v = await cdp.evaluate(b, pg.sessionId, PROBE);
    console.log(JSON.stringify(v, null, 1));
    await cdp.screenshot(b, pg.sessionId, path.join(OUT, '_perf_probe.png'));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
