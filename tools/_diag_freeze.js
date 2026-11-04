'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const SAMPLE = `(() => {
  const out = { t: performance.now(), sim: (window.__freezeAt!==undefined?window.__freezeAt:null),
                motionNow: (window.Motion&&window.Motion.now)?window.Motion.now():null,
                title: document.title,
                ships: {} };
  document.querySelectorAll('.ship-marker').forEach(el => {
    const sid = el.dataset.sid || el.title;
    const m = (el.style.transform||'').match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    out.ships[sid] = m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  });
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const mk = async () => {
        const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
        const { sessionId } = await cdp.newPage(b, url, { wait: 8000 });
        return sessionId;
    };
    const s1 = await mk();
    const a = await cdp.evaluate(b, s1, SAMPLE);
    await cdp.sleep(3000);
    const a2 = await cdp.evaluate(b, s1, SAMPLE);
    await cdp.sleep(3000);
    const a3 = await cdp.evaluate(b, s1, SAMPLE);
    const s2 = await mk();
    const c = await cdp.evaluate(b, s2, SAMPLE);

    const diffs = (X, Y) => {
        const rows = [];
        for (const k in X.ships) {
            if (!X.ships[k] || !Y.ships[k]) continue;
            const d = Math.hypot(Y.ships[k][0] - X.ships[k][0], Y.ships[k][1] - X.ships[k][1]);
            if (d > 0.01) rows.push({ sid: k, d: +d.toFixed(2), a: X.ships[k], b: Y.ships[k] });
        }
        rows.sort((p, q) => q.d - p.d);
        return rows;
    };
    const res = {
        simA: a.sim, simA2: a2.sim, simA3: a3.sim, simC: c.sim,
        motionA: a.motionNow, motionA2: a2.motionNow, motionC: c.motionNow,
        titleA: a.title, titleC: c.title,
        samePage_0_3s: diffs(a, a2).slice(0, 12),
        samePage_0_6s: diffs(a, a3).slice(0, 12),
        crossLoad_sameFreeze: diffs(a, c).slice(0, 12),
        cnt_samePage3: diffs(a, a2).length,
        cnt_samePage6: diffs(a, a3).length,
        cnt_crossLoad: diffs(a, c).length,
        totalShips: Object.keys(a.ships).length
    };
    console.log(JSON.stringify(res, null, 1));
    fs.writeFileSync(path.join(OUT, '_diag_freeze.json'), JSON.stringify(res, null, 1), 'utf8');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
