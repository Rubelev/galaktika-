'use strict';
// Честная скорость флота: двигаем игровое время ВНУТРИ одной страницы (без перезагрузки),
// чтобы расписание (__legEpoch) не менялось между кадрами.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const POS = `(() => {
  const out = { sim: window.__freezeAt, legEpoch: window.__legEpoch || null, pos: {} };
  document.querySelectorAll('.ship-marker').forEach(el => {
    const sid = el.dataset.sid || '';
    if (!sid.startsWith('fleet-')) return;
    const m = (el.style.transform || '').match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
    out.pos[sid] = m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  });
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token, { wait: 8800 });
    const sid = pg.sessionId;
    await cdp.evaluate(b, sid, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(700);
    const p0 = await cdp.evaluate(b, sid, POS);
    const t0 = p0.sim;

    const step = async (dt) => {
        await cdp.evaluate(b, sid, `(() => { window.__freezeAt = ${t0} + ${dt}; return window.__freezeAt; })()`);
        await cdp.sleep(450);
        return await cdp.evaluate(b, sid, POS);
    };
    const p60 = await step(60000);
    const p600 = await step(600000);
    const p660 = await step(660000);

    const disp = (a, c) => {
        const r = {};
        for (const k in a.pos) {
            if (!c.pos[k] || !a.pos[k]) continue;
            r[k] = +Math.hypot(c.pos[k][0] - a.pos[k][0], c.pos[k][1] - a.pos[k][1]).toFixed(2);
        }
        return r;
    };
    const res = {
        sims: [p0.sim, p60.sim, p600.sim, p660.sim],
        epochs: [p0.legEpoch, p60.legEpoch, p600.legEpoch, p660.legEpoch],
        d60: disp(p0, p60),
        d600: disp(p0, p600),
        d660_from600: disp(p600, p660),
        pos0: p0.pos, pos60: p60.pos, pos600: p600.pos
    };
    fs.writeFileSync(path.join(OUT, '_fleet4c.json'), JSON.stringify(res, null, 1), 'utf8');
    const kmPerPx = 149600000 / 185;
    const rows = Object.keys(res.d60).map(k => ({
        sid: k, d60: res.d60[k], d600: res.d600[k],
        v60: res.d60[k] * kmPerPx / 60, c60: res.d60[k] * kmPerPx / 60 / 299792.458,
        px45: res.d60[k] * 45 / 60
    }));
    console.log(JSON.stringify({ epochs: res.epochs, sims: res.sims, rows }, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
