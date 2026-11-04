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
    const url = process.argv[2] === 'shot' ? BASE + '?shot=1&onb=1&token=' + token : BASE + '?onb=1&token=' + token;
    const pg = await cdp.newPage(b, url, { wait: 9000 });
    const sid = pg.sessionId;
    const read = `(() => { const e = document.querySelector('.planet[data-planet-id="earth"]'); const w = e ? e.parentElement : null; return { sim: (typeof simulatedTime !== 'undefined' ? simulatedTime : null), tr: w ? w.style.transform : null, raf: window.__rafCount || 0 }; })()`;
    const a = await cdp.evaluate(b, sid, read);
    await cdp.sleep(1500);
    const c = await cdp.evaluate(b, sid, read);
    await cdp.sleep(1500);
    const d = await cdp.evaluate(b, sid, read);
    console.log(url.includes('shot'), JSON.stringify({ a: a, c: c, d: d }));
    // сколько кадров rAF за 1.5 с
    const frames = await cdp.evaluate(b, sid, `(() => new Promise(res => { let n = 0; const t0 = performance.now(); function f(){ n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(n); } requestAnimationFrame(f); }))()`);
    console.log('rAF frames in 1.5 s:', frames);
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
