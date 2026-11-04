'use strict';
// Живой режим (без freeze): работает ли capSpeed и с какой реальной скоростью
// двигаются борта; плюс счётчик window.__capped.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const KM = 149600000 / 185, C = 299792.458;

const READ = `(() => {
  const out = { sim: (window.__freezeAt !== undefined ? window.__freezeAt : null),
                capped: (typeof window.__capped === 'number' ? window.__capped : 0),
                last: (window.__pubLast ? window.__pubLast.size : -1), pos: {} };
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
    const out = {};
    // 1) живой режим
    let pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&token=' + token, { wait: 9000 });
    const a = await cdp.evaluate(b, pg.sessionId, READ);
    await cdp.sleep(3000);
    const c = await cdp.evaluate(b, pg.sessionId, READ);
    await cdp.sleep(3000);
    const d = await cdp.evaluate(b, pg.sessionId, READ);
    // шаг за 3 с = 3 игровые секунды при 1×
    const steps = {};
    for (const k in a.pos) {
        if (!c.pos[k]) continue;
        const s1 = Math.hypot(c.pos[k][0] - a.pos[k][0], c.pos[k][1] - a.pos[k][1]);
        const s2 = d.pos[k] ? Math.hypot(d.pos[k][0] - c.pos[k][0], d.pos[k][1] - c.pos[k][1]) : null;
        steps[k] = { s3a: +s1.toFixed(2), s3b: s2 === null ? null : +s2.toFixed(2),
                     px45: +(s1 * 45 / 3).toFixed(2), c: +(s1 * KM / 3 / C).toFixed(3),
                     km: Math.round(s1 * KM / 3) };
    }
    out.live = { sim: [a.sim, c.sim, d.sim], capped: [a.capped, c.capped, d.capped], last: [a.last, c.last, d.last], steps: steps };
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    // 2) freeze-режим
    pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token, { wait: 8800 });
    const e = await cdp.evaluate(b, pg.sessionId, READ);
    await cdp.sleep(3000);
    const f = await cdp.evaluate(b, pg.sessionId, READ);
    let moved = 0;
    for (const k in e.pos) if (f.pos[k] && Math.hypot(f.pos[k][0] - e.pos[k][0], f.pos[k][1] - e.pos[k][1]) > 0.05) moved++;
    out.frozen = { sim: [e.sim, f.sim], capped: [e.capped, f.capped], last: [e.last, f.last], movedShips: moved };
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    fs.writeFileSync(path.join(OUT, '_capped.json'), JSON.stringify(out, null, 1), 'utf8');
    const top = Object.entries(steps).sort((x, y) => y[1].s3a - x[1].s3a).slice(0, 10);
    console.log(JSON.stringify({ liveSims: out.live.sim, capped: out.live.capped, pubLast: out.live.last,
        frozen: out.frozen, top: top.map(([k, v]) => k + ' ' + v.s3a + 'px/3s ' + v.px45 + 'px45 ' + v.c + 'c ' + v.km + 'km/s') }, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
