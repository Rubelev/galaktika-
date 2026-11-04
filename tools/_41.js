'use strict';
// v=1232: fit 9/9, ориентация (аспект/угол путей), дубли путей, пересборка через 3 с.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const SNAP = `(() => {
  const paths = Array.from(document.querySelectorAll('svg path')).filter(p => (p.getAttribute('d') || '').length > 20);
  const info = paths.map(p => {
    let mn = 1e9, mx = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const L = p.getTotalLength ? p.getTotalLength() : 0;
    try { for (let i = 0; i <= 60; i++) { const q = p.getPointAtLength(L * i / 60); const r = Math.hypot(q.x, q.y); if (r < mn) mn = r; if (r > mx) mx = r; if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x; if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y; } } catch (e) {}
    return { dLen: (p.getAttribute('d') || '').length, mn: +mn.toFixed(1), mx: +mx.toFixed(1), w: +(maxX - minX).toFixed(1), h: +(maxY - minY).toFixed(1), d: (p.getAttribute('d') || '').slice(0, 60) };
  });
  const rows = [];
  document.querySelectorAll('.planet[data-planet-id]').forEach(e => {
    const id = e.getAttribute('data-planet-id');
    const w = e.parentElement;
    let px = null, py = null;
    if (w && w.style.transform) { const m = w.style.transform.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/); if (m) { px = parseFloat(m[1]); py = parseFloat(m[2]); } }
    let best = 1e9, bi = null;
    if (px !== null) paths.forEach((p, idx) => {
      try { const L = p.getTotalLength(); let prev = p.getPointAtLength(0);
        for (let i = 1; i <= 200; i++) { const q = p.getPointAtLength(L * i / 200); const dx = q.x - prev.x, dy = q.y - prev.y; const l2 = dx*dx + dy*dy; let t = l2 > 0 ? ((px - prev.x)*dx + (py - prev.y)*dy)/l2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(px - (prev.x + t*dx), py - (prev.y + t*dy)); if (d < best) { best = d; bi = idx; } prev = q; }
      } catch (e) {}
    });
    rows.push({ id: id, d: best < 1e9 ? +best.toFixed(2) : null, pathIdx: bi });
  });
  return { count: paths.length, info: info.slice(0, 14), rows: rows };
})()`;

(async () => {
    const out = {};
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    out.t1 = await cdp.evaluate(b, sid, SNAP);
    await cdp.sleep(3500);
    out.t2 = await cdp.evaluate(b, sid, SNAP);
    await cdp.sleep(3500);
    out.t3 = await cdp.evaluate(b, sid, SNAP);
    // ракурсы
    out.fit = {};
    for (const [name, q] of [['tilt45', '&tilt=45&spin=20'], ['tilt85', '&tilt=85'], ['spin-40', '&spin=-40']]) {
        await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1' + q + '&token=' + token }, sid);
        await cdp.sleep(10000);
        out.fit[name] = await cdp.evaluate(b, sid, SNAP);
    }
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&token=' + token }, sid);
    await cdp.sleep(9000);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat41-tilt0.png'));
    fs.writeFileSync(path.join(OUT, '_41.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log('t1 paths:', out.t1.count, 'max d:', Math.max(...out.t1.rows.map(r => r.d)));
    console.log('t2 paths:', out.t2.count, 'max d:', Math.max(...out.t2.rows.map(r => r.d)));
    console.log('t3 paths:', out.t3.count, 'max d:', Math.max(...out.t3.rows.map(r => r.d)));
    console.log('t1 rows:', out.t1.rows.map(r => r.id + ':' + r.d).join(' '));
    console.log('t3 rows:', out.t3.rows.map(r => r.id + ':' + r.d).join(' '));
    console.log('orbit-like paths (t3):', out.t3.info.filter(p => p.mn > 50).map(p => `mn${p.mn}/mx${p.mx} w${p.w}/h${p.h}`).slice(0, 12).join(' | '));
    for (const k of Object.keys(out.fit)) console.log('FIT', k, 'paths:', out.fit[k].count, 'max d:', Math.max(...out.fit[k].rows.map(r => r.d)), out.fit[k].rows.map(r => r.id + ':' + r.d).join(' '));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
