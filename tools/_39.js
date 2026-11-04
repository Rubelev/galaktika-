'use strict';
// v=1224: геометрия (орбита vs позиция) + зонд джиттера (lowData) на 3 ракурсах.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const FIT = `(() => {
  const rows = [];
  document.querySelectorAll('.planet[data-planet-id]').forEach(e => {
    const id = e.getAttribute('data-planet-id');
    const w = e.parentElement;
    const orbit = e.closest('.orbit');
    const rx = orbit ? parseFloat(orbit.style.width) / 2 : null;
    const ry = orbit ? parseFloat(orbit.style.height) / 2 : null;
    let dist = null;
    if (w && w.style.transform) {
      const m = w.style.transform.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/);
      if (m) dist = Math.hypot(parseFloat(m[1]), parseFloat(m[2]));
    }
    rows.push({ id: id, dist: dist ? +dist.toFixed(1) : null, rx: rx ? +rx.toFixed(1) : null, ry: ry ? +ry.toFixed(1) : null,
                d: (dist !== null && rx) ? +(dist - rx).toFixed(1) : null });
  });
  document.querySelectorAll('.moon[data-moon]').forEach(e => {
    const id = e.getAttribute('data-moon');
    const w = e.parentElement;
    let dist = null, rx = null;
    if (w && w.style.transform) { const m = w.style.transform.match(/translate\\((-?[\\d.]+)px,\\s*(-?[\\d.]+)px\\)/); if (m) dist = Math.hypot(parseFloat(m[1]), parseFloat(m[2])); }
    const orbit = e.closest('.orbit'); if (orbit) rx = parseFloat(orbit.style.width) / 2;
    rows.push({ id: id, moon: true, dist: dist ? +dist.toFixed(1) : null, rx: rx ? +rx.toFixed(1) : null, d: (dist !== null && rx) ? +(dist - rx).toFixed(1) : null });
  });
  return rows;
})()`;

(async () => {
    const out = { fit: {}, jitter: {} };
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    out.fit.tilt0 = await cdp.evaluate(b, sid, FIT);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat39-tilt0.png'));
    for (const [name, q] of [['tilt45', '&tilt=45&spin=20'], ['tilt85', '&tilt=85']]) {
        await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1' + q + '&token=' + token }, sid);
        await cdp.sleep(9000);
        out.fit[name] = await cdp.evaluate(b, sid, FIT);
    }
    // зонд джиттера
    for (const [name, q] of [['tilt0', '&tilt=0'], ['tilt45', '&tilt=45&spin=20'], ['tilt85', '&tilt=85']]) {
        await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&jitter=8000&bodies=planets' + q + '&token=' + token }, sid);
        await cdp.sleep(12500);
        const r = await cdp.evaluate(b, sid, `(() => { const el = document.getElementById('jitter-report'); const j = window.__jitterReport || null; return { text: el ? el.textContent.replace(/\\s+/g,' ').trim().slice(0, 400) : null, title: document.title, json: j }; })()`);
        out.jitter[name] = r;
        if (name === 'tilt0') await cdp.screenshot(b, sid, path.join(OUT, 'cat39-report.png'));
        console.log('jitter', name, '|', r.title, '|', (r.text || '').slice(0, 200));
    }
    fs.writeFileSync(path.join(OUT, '_39.json'), JSON.stringify(out, null, 1), 'utf8');
    for (const k of Object.keys(out.fit)) {
        const rows = out.fit[k];
        const bad = rows.filter(r => r.d !== null && Math.abs(r.d) > 6);
        console.log('FIT', k, 'rows:', rows.length, 'bad(>6px):', bad.map(r => r.id + ':' + r.d));
        console.log('   pluto:', JSON.stringify(rows.find(r => r.id === 'pluto')), 'charon:', JSON.stringify(rows.find(r => r.id === 'Харон')));
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
