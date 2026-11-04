'use strict';
// v=1226: строгая проверка «планета ↔ SVG-путь орбиты» (расстояние до сегментов).
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const PROBE = `(() => {
  const svgs = Array.from(document.querySelectorAll('svg'));
  const meta = svgs.map(s => ({ cls: String(s.className || ''), kids: Array.from(s.children).map(c => c.tagName + '.' + String(c.getAttribute('class') || '')), vb: s.getAttribute('viewBox'), tr: s.getAttribute('transform') }));
  return { svgCount: svgs.length, meta: meta, paths: document.querySelectorAll('svg path').length };
})()`;

const FIT = `(() => {
  // пути орбит: все path в svg, у которых d не пустой
  const paths = Array.from(document.querySelectorAll('svg path')).filter(p => (p.getAttribute('d') || '').length > 20);
  const out = [];
  document.querySelectorAll('.planet[data-planet-id]').forEach(e => {
    const id = e.getAttribute('data-planet-id');
    const w = e.parentElement;
    let px = null, py = null;
    if (w && w.style.transform) { const m = w.style.transform.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/); if (m) { px = parseFloat(m[1]); py = parseFloat(m[2]); } }
    let best = 1e9, bestPath = null;
    if (px !== null) {
      paths.forEach((p, idx) => {
        try {
          const L = p.getTotalLength();
          let prev = p.getPointAtLength(0);
          for (let i = 1; i <= 200; i++) {
            const q = p.getPointAtLength(L * i / 200);
            // расстояние до отрезка prev-q
            const dx = q.x - prev.x, dy = q.y - prev.y;
            const len2 = dx*dx + dy*dy;
            let t = len2 > 0 ? ((px - prev.x) * dx + (py - prev.y) * dy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const cx = prev.x + t * dx, cy = prev.y + t * dy;
            const d = Math.hypot(px - cx, py - cy);
            if (d < best) { best = d; bestPath = idx; }
            prev = q;
          }
        } catch (err) {}
      });
    }
    out.push({ id: id, x: px, y: py, d: best < 1e9 ? +best.toFixed(2) : null, pathIdx: bestPath });
  });
  return { paths: paths.length, rows: out };
})()`;

(async () => {
    const out = {};
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    out.probe = await cdp.evaluate(b, sid, PROBE);
    out.fit = {};
    for (const [name, q] of [['tilt0', ''], ['tilt45', '&tilt=45&spin=20'], ['tilt85', '&tilt=85'], ['spin-40', '&spin=-40']]) {
        if (name !== 'tilt0') { await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1' + q + '&token=' + token }, sid); await cdp.sleep(9000); }
        out.fit[name] = await cdp.evaluate(b, sid, FIT);
        if (name === 'tilt0') await cdp.screenshot(b, sid, path.join(OUT, 'cat40-tilt0.png'));
        if (name === 'tilt45') await cdp.screenshot(b, sid, path.join(OUT, 'cat40-tilt45.png'));
    }
    fs.writeFileSync(path.join(OUT, '_40.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log('probe:', JSON.stringify(out.probe).slice(0, 800));
    for (const k of Object.keys(out.fit)) {
        const f = out.fit[k];
        const max = Math.max(...f.rows.map(r => r.d === null ? -1 : r.d));
        console.log('FIT', k, 'paths:', f.paths, 'rows:', f.rows.length, 'maxΔ:', max, '| bad>6:', f.rows.filter(r => r.d !== null && r.d > 6).map(r => r.id + ':' + r.d));
        console.log('   ', f.rows.map(r => r.id + ':' + r.d).join(' '));
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
