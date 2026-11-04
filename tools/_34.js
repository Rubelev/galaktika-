'use strict';
// v=1203: Плутон в кадре, лун 23, Уран/Нептун на месте, perf, каталог.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const LEG = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1; };
  const rows = Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(e => {
    const r = e.getBoundingClientRect();
    return { id: e.getAttribute('data-planet-id'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width), vis: vis(e),
             inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  });
  return { rows: rows, moons: document.querySelectorAll('.moon[data-moon]').length };
})()`;

(async () => {
    const out = {};
    // старый вид
    {
        const b = await cdp.launch({ width: 1400, height: 900 });
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 10000 });
        out.legacy = await cdp.evaluate(b, pg.sessionId, LEG);
        await cdp.screenshot(b, pg.sessionId, path.join(OUT, 'cat34-legacy.png'));
        await cdp.close(b);
    }
    await cdp.sleep(5000);
    // каталог
    {
        const b = await cdp.launch({ width: 1400, height: 900 });
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 10000 });
        out.catalog = await cdp.evaluate(b, pg.sessionId, `(() => { const st = document.getElementById('catalog-stats'); return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, bodies: document.querySelectorAll('.cat-body').length }; })()`);
        await cdp.close(b);
    }
    await cdp.sleep(5000);
    // perf старый вид
    {
        const b = await cdp.launch({ width: 1400, height: 900 });
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&perf2=1&token=' + token, { wait: 11000 });
        out.perfLegacy = [];
        for (let i = 0; i < 3; i++) { out.perfLegacy.push(await cdp.evaluate(b, pg.sessionId, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`)); await cdp.sleep(2000); }
        await cdp.close(b);
    }
    fs.writeFileSync(path.join(OUT, '_34.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify({ legacy: { planets: out.legacy.rows.length, ids: out.legacy.rows.map(p => p.id), moons: out.legacy.moons,
        pluto: out.legacy.rows.find(p => p.id === 'pluto'), uranus: out.legacy.rows.find(p => p.id === 'uranus'), neptune: out.legacy.rows.find(p => p.id === 'neptune'),
        notInView: out.legacy.rows.filter(p => !p.inView).map(p => p.id) }, catalog: out.catalog, perfLegacy: out.perfLegacy }, null, 1));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
