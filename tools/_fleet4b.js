'use strict';
// Проверка: зависит ли поза флота от момента загрузки страницы (__legEpoch) и
// насколько плавно борт идёт ВНУТРИ одного кадра.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const READ = `(() => {
  const out = { sim: window.__freezeAt, legEpoch: window.__legEpoch || null, span: {}, pos: {} };
  document.querySelectorAll('.ship-marker').forEach(el => {
    const sid = el.dataset.sid || '';
    if (!sid.startsWith('fleet-')) return;
    const m = (el.style.transform || '').match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    out.pos[sid] = m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  });
  try {
    for (let i = 0; i < 7; i++) {
      const p0 = window.Motion.shipPose(i, window.__freezeAt);
      const p1 = window.Motion.shipPose(i, window.__freezeAt + 60000);
      const p2 = window.Motion.shipPose(i, window.__freezeAt + 600000);
      out.span['fleet-' + i] = p0 ? p0.span : null;
      out['core60_' + i] = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : null;
      out['core600_' + i] = p0 && p2 ? Math.hypot(p2.x - p0.x, p2.y - p0.y) : null;
    }
  } catch (e) { out.coreErr = String(e && e.message); }
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const get = async (freeze) => {
        const pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=' + freeze + '&token=' + token, { wait: 8800 });
        await cdp.evaluate(b, pg.sessionId, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
        await cdp.sleep(700);
        const v = await cdp.evaluate(b, pg.sessionId, READ);
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
        return v;
    };
    const a = await get(100000);
    const c = await get(100000);
    const d = await get(100060);
    const diffs = {};
    for (const k in a.pos) {
        if (!c.pos[k] || !a.pos[k]) continue;
        diffs[k] = +Math.hypot(c.pos[k][0] - a.pos[k][0], c.pos[k][1] - a.pos[k][1]).toFixed(1);
    }
    const diffsFreeze = {};
    for (const k in a.pos) {
        if (!d.pos[k] || !a.pos[k]) continue;
        diffsFreeze[k] = +Math.hypot(d.pos[k][0] - a.pos[k][0], d.pos[k][1] - a.pos[k][1]).toFixed(1);
    }
    const res = {
        build: null,
        load1: { sim: a.sim, legEpoch: a.legEpoch, span: a.span, core60: [0, 1, 2, 3, 4, 5, 6].map(i => a['core60_' + i]), core600: [0, 1, 2, 3, 4, 5, 6].map(i => a['core600_' + i]) },
        load2: { sim: c.sim, legEpoch: c.legEpoch, span: c.span },
        load3: { sim: d.sim, legEpoch: d.legEpoch, span: d.span },
        sameFreezeDiff: diffs,
        diffBetweenFreezes: diffsFreeze,
        pos1: a.pos, pos2: c.pos, pos3: d.pos
    };
    fs.writeFileSync(path.join(OUT, '_fleet4b.json'), JSON.stringify(res, null, 1), 'utf8');
    console.log(JSON.stringify({ epochs: [a.legEpoch, c.legEpoch, d.legEpoch], sims: [a.sim, c.sim, d.sim],
        sameFreezeDiff: diffs, diffBetweenFreezes: diffsFreeze,
        core60: res.load1.core60, core600: res.load1.core600, span: a.span }, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
