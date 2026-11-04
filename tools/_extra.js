'use strict';
// Дополнительные измерения: пояс, пираты, поведение при наклоне в одной странице,
// размеры маркеров, «пустые» гражданские борта.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const PROBE = String.raw`(() => {
  const out = {};
  const P = [];
  const read = () => {
    const m = {};
    document.querySelectorAll('.ship-marker').forEach(el => {
      const tr = el.style.transform || '';
      const g = (re) => { const q = tr.match(re); return q ? parseFloat(q[1]) : null; };
      m[el.dataset.sid || el.title] = { x: g(/translate\(([-\d.]+)px,\s*[-\d.]+px\)/), y: g(/translate\([-\d.]+px,\s*([-\d.]+)px\)/),
        w: parseFloat(el.style.width) || null, h: parseFloat(el.style.height) || null,
        pe: getComputedStyle(el).pointerEvents, display: getComputedStyle(el).display, title: el.title };
    });
    return m;
  };
  out.scaleNow = (typeof window.__scaleNow === 'number') ? window.__scaleNow : String(window.__scaleNow);
  out.scale = (typeof scale === 'number') ? scale : null;
  out.markerCount = document.querySelectorAll('.ship-marker').length;
  out.markerSample = Array.from(document.querySelectorAll('.ship-marker')).slice(0, 3).map(e => ({
    sid: e.dataset.sid, w: e.style.width, h: e.style.height, pe: getComputedStyle(e).pointerEvents }));
  // пояс: расстояние от рудного транспорта до центральной линии пояса
  try {
    const days = (simulatedTime - EPOCH_MS) / DAY_MS;
    const step = Math.max(1, Math.floor(beltA.length / 900));
    const pts = [];
    for (let i = 0; i < beltA.length; i += step) pts.push(beltPos(i, days));
    const ships = Array.from(document.querySelectorAll('.ship-marker[data-sid^="belt-"]')).map(el => {
      const tr = el.style.transform || '';
      const g = (re) => { const q = tr.match(re); return q ? parseFloat(q[1]) : null; };
      return { sid: el.dataset.sid, x: g(/translate\(([-\d.]+)px/), y: g(/translate\([-\d.]+px,\s*([-\d.]+)px\)/),
               title: el.title, u: el.dataset.u, moving: el.dataset.moving };
    });
    const pirates = Array.from(document.querySelectorAll('.ship-marker[data-sid^="pirate-"]')).map(el => {
      const tr = el.style.transform || '';
      const g = (re) => { const q = tr.match(re); return q ? parseFloat(q[1]) : null; };
      return { sid: el.dataset.sid, x: g(/translate\(([-\d.]+)px/), y: g(/translate\([-\d.]+px,\s*([-\d.]+)px\)/), title: el.title };
    });
    const dist = (s) => { let best = Infinity, bi = -1; pts.forEach((p, i) => { const d = Math.hypot(p.x - s.x, p.y - s.y); if (d < best) { best = d; bi = i; } }); return { d: best, i: bi }; };
    out.belt = { n: beltA.length, sampled: pts.length };
    out.beltShips = ships.map(s => { const r = dist(s); return Object.assign({ d: +r.d.toFixed(2), ri: r.i, rad: +Math.hypot(s.x, s.y).toFixed(1) }, s); });
    out.pirates = pirates.map(s => { const r = dist(s); return Object.assign({ d: +r.d.toFixed(2), rad: +Math.hypot(s.x, s.y).toFixed(1) }, s); });
  } catch (e) { out.beltErr = String(e && e.message); }
  // до/после наклона в одной странице
  const before = read();
  try { rotX = 45; rotZ = 20; window.updateSolarTransform(); } catch (e) { out.tiltErr = String(e && e.message); }
  const after = read();
  const diffs = [];
  for (const k in before) {
    if (!before[k] || !after[k] || before[k].x === null || after[k].x === null) continue;
    const d = Math.hypot(after[k].x - before[k].x, after[k].y - before[k].y);
    if (d > 0.01) diffs.push({ sid: k, d: +d.toFixed(2) });
  }
  out.tiltSamePage = { changed: diffs.length, max: diffs.length ? Math.max.apply(null, diffs.map(x => x.d)) : 0, top: diffs.slice(0, 8) };
  out.camAfter = (document.querySelector('.solar-system').style.transform || '');
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9000 });
    await cdp.evaluate(b, sessionId, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(600);
    const v = await cdp.evaluate(b, sessionId, PROBE);
    fs.writeFileSync(path.join(OUT, '_extra.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log('ok', JSON.stringify({ belt: v.belt, tilt: v.tiltSamePage, scaleNow: v.scaleNow }));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
