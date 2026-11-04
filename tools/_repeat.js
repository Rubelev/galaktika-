'use strict';
// Повторяемость кадра: две независимые загрузки одного и того же freeze при scale=0.95.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const READ = `(() => {
  const m = {};
  document.querySelectorAll('.ship-marker').forEach(el => {
    const tr = el.style.transform || '';
    const g = re => { const q = tr.match(re); return q ? +q[1] : null; };
    m[el.dataset.sid || el.title] = [g(/translate\\(([-\\d.]+)px,\\s*[-\\d.]+px\\)/), g(/translate\\([-\\d.]+px,\\s*([-\\d.]+)px\\)/)];
  });
  const planets = {};
  document.querySelectorAll('.planet[data-planet-id]').forEach(el => { const r = el.getBoundingClientRect(); planets[el.getAttribute('data-planet-id')] = [+(r.left+r.width/2).toFixed(2), +(r.top+r.height/2).toFixed(2)]; });
  return { sim: window.__freezeAt, ships: m, planets: planets, title: document.title, build: (document.querySelector('meta[name=app-build]')||{}).content };
})()`;

(async () => {
    const b = await cdp.launch();
    const get = async () => {
        const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
        const pg = await cdp.newPage(b, url, { wait: 8800 });
        await cdp.evaluate(b, pg.sessionId, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
        await cdp.sleep(600);
        const v = await cdp.evaluate(b, pg.sessionId, READ);
        try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
        return v;
    };
    const a = await get();
    const c = await get();
    const rows = [];
    for (const k in a.ships) {
        if (!c.ships[k] || a.ships[k][0] === null || c.ships[k][0] === null) continue;
        const d = Math.hypot(c.ships[k][0] - a.ships[k][0], c.ships[k][1] - a.ships[k][1]);
        if (d > 0.05) rows.push({ sid: k, d: +d.toFixed(2) });
    }
    rows.sort((x, y) => y.d - x.d);
    const pr = [];
    for (const k in a.planets) { if (!c.planets[k]) continue; const d = Math.hypot(c.planets[k][0]-a.planets[k][0], c.planets[k][1]-a.planets[k][1]); if (d > 0.05) pr.push({ id: k, d: +d.toFixed(3) }); }
    const res = { a: { sim: a.sim, build: a.build, title: a.title }, c: { sim: c.sim, build: c.build, title: c.title },
                  different: rows.length, total: Object.keys(a.ships).length, max: rows.length ? rows[0].d : 0, top: rows.slice(0, 12),
                  planetsDifferent: pr };
    fs.writeFileSync(path.join(OUT, '_repeat.json'), JSON.stringify(res, null, 1), 'utf8');
    console.log(JSON.stringify(res));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
