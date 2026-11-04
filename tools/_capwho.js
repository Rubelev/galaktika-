'use strict';
// Кто именно попадает под ограничитель: перехватываем capSpeed и считаем клипы по id.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const KM = 149600000 / 185, C = 299792.458;

const INSTALL = `(() => {
  window.__capLog = {};
  window.__capTotal = 0;
  const orig = window.capSpeed;
  window.capSpeed = function (id, pose) {
    if (!pose) return pose;
    const x0 = pose.x, y0 = pose.y;
    const r = orig(id, pose);
    if (r && (Math.abs(r.x - x0) > 1e-9 || Math.abs(r.y - y0) > 1e-9)) {
      window.__capLog[id] = (window.__capLog[id] || 0) + 1;
      window.__capTotal++;
    }
    return r;
  };
  return typeof orig === 'function';
})()`;

const READ = `(() => {
  const out = { capped: (typeof window.__capped === 'number' ? window.__capped : 0),
                capTotal: window.__capTotal || 0, capLog: window.__capLog || {}, pos: {} };
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
    const installed = await cdp.evaluate(b, sid, INSTALL);
    await cdp.sleep(700);
    const a = await cdp.evaluate(b, sid, READ);
    const t0 = Date.now();
    await cdp.sleep(45000);
    const c = await cdp.evaluate(b, sid, READ);
    const dt = (Date.now() - t0) / 1000;
    const rows = [];
    for (const k in a.pos) {
        if (!c.pos[k]) continue;
        const d = Math.hypot(c.pos[k][0] - a.pos[k][0], c.pos[k][1] - a.pos[k][1]);
        rows.push({ sid: k, d: +d.toFixed(2), px45: +(d * 45 / dt).toFixed(2), c: +(d * KM / dt / C).toFixed(3), clips: c.capLog[k] || 0 });
    }
    rows.sort((x, y) => y.d - x.d);
    const clipped = rows.filter(r => r.clips > 0);
    const res = { installed: installed, dt: +dt.toFixed(1), cappedGlobal: [a.capped, c.capped], capTotal: c.capTotal,
                  clippedCount: clipped.length, clipped: clipped.slice(0, 40), top: rows.slice(0, 12), movedRange: [rows[rows.length - 1].d, rows[0].d] };
    fs.writeFileSync(path.join(OUT, '_capwho.json'), JSON.stringify(res, null, 1), 'utf8');
    console.log(JSON.stringify({ installed, dt: res.dt, cappedGlobal: res.cappedGlobal, capTotal: res.capTotal,
        clippedCount: res.clippedCount, clippedIds: clipped.map(r => r.sid + ':' + r.clips + ':' + r.px45), top: rows.slice(0, 8) }, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
