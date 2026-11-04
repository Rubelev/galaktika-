'use strict';
// Живой режим, длинный интервал: насколько ограничитель держит быстрые слои.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const KM = 149600000 / 185, C = 299792.458;

const READ = `(() => {
  const out = { capped: (typeof window.__capped === 'number' ? window.__capped : 0), pos: {} };
  document.querySelectorAll('.ship-marker').forEach(el => {
    const sid = el.dataset.sid || el.title;
    if (!sid) return;
    const m = (el.style.transform || '').match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    if (m) out.pos[sid] = [parseFloat(m[1]), parseFloat(m[2])];
  });
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(600);
    const a = await cdp.evaluate(b, sid, READ);
    const t0 = Date.now();
    await cdp.sleep(20000);
    const c = await cdp.evaluate(b, sid, READ);
    const dt = (Date.now() - t0) / 1000;
    const rows = [];
    for (const k in a.pos) {
        if (!c.pos[k]) continue;
        const d = Math.hypot(c.pos[k][0] - a.pos[k][0], c.pos[k][1] - a.pos[k][1]);
        rows.push({ sid: k, d: +d.toFixed(2), px45: +(d * 45 / dt).toFixed(2), c: +(d * KM / dt / C).toFixed(3), km: Math.round(d * KM / dt) });
    }
    rows.sort((x, y) => y.d - x.d);
    const res = { dt: +dt.toFixed(1), cappedBefore: a.capped, cappedAfter: c.capped, cappedPerSec: Math.round((c.capped - a.capped) / dt), top: rows.slice(0, 12) };
    fs.writeFileSync(path.join(OUT, '_capped20.json'), JSON.stringify(res, null, 1), 'utf8');
    console.log(JSON.stringify(res, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
