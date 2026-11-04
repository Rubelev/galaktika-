'use strict';
// v=1202: Плутон в старом виде + чистые замеры perf (отдельные браузеры, паузы 5 с).
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const LEG = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1; };
  return {
    planets: Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(e => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-planet-id'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width), vis: vis(e) }; }),
    moons: document.querySelectorAll('.moon[data-moon]').length,
    pluto: (() => { const e = document.querySelector('.planet[data-planet-id="pluto"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width), vis: vis(e), inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()
  };
})()`;

async function perfRun(url, label) {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, url, { wait: 11000 });
    const out = [];
    for (let i = 0; i < 3; i++) {
        out.push(await cdp.evaluate(b, pg.sessionId, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`));
        await cdp.sleep(2000);
    }
    await cdp.close(b);
    console.log(label, JSON.stringify(out));
    return out;
}

(async () => {
    const out = {};
    // 1) старый вид: Плутон
    {
        const b = await cdp.launch({ width: 1400, height: 900 });
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 10000 });
        out.legacy = await cdp.evaluate(b, pg.sessionId, LEG);
        await cdp.screenshot(b, pg.sessionId, path.join(OUT, 'cat33-legacy.png'));
        await cdp.close(b);
    }
    await cdp.sleep(5000);
    // 2) каталог-режим: числа, клики, PV
    {
        const b = await cdp.launch({ width: 1400, height: 900 });
        const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 10000 });
        const sid = pg.sessionId;
        out.catalog = await cdp.evaluate(b, sid, `(() => { const st = document.getElementById('catalog-stats'); return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, bodies: document.querySelectorAll('.cat-body').length }; })()`);
        const targets = await cdp.evaluate(b, sid, `(() => Array.from(document.querySelectorAll('.cat-body[data-planet-id]')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.left > 0 && r.top > 0; }).slice(0, 5).map(e => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-planet-id'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2) }; }))()`);
        for (const t of targets) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
            await cdp.sleep(500);
        }
        await cdp.sleep(600);
        out.clicks = await cdp.evaluate(b, sid, `(() => { const st = document.getElementById('catalog-stats'); return st ? st.textContent.replace(/\\s+/g,' ').trim() : null; })()`);
        const pg2 = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 9500 });
        const sid2 = pg2.sessionId;
        const vp = await cdp.evaluate(b, sid2, `(() => { const e = document.querySelector('.cat-body[data-planet-id="vesta"]'); const r = e.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2) }; })()`);
        for (let i = 0; i < 2; i++) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: vp.x, y: vp.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid2);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: vp.x, y: vp.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid2);
            await cdp.sleep(110);
        }
        await cdp.sleep(4000);
        out.dbl = await cdp.evaluate(b, sid2, `(() => ({ href: location.href.replace(/token=[^&]+/, 'token=T'), pv: document.body.classList.contains('pv-mode'), blocks: !!document.getElementById('blocks3d-wrap') }))()`);
        await cdp.screenshot(b, sid, path.join(OUT, 'cat33-catalog.png'));
        await cdp.close(b);
    }
    await cdp.sleep(5000);
    // 3) чистый perf: каталог
    out.perfCatalog = await perfRun(BASE + '?shot=1&onb=1&render=catalog&perf2=1&token=' + token, 'perfCatalog');
    await cdp.sleep(5000);
    // 4) чистый perf: старый вид
    out.perfLegacy = await perfRun(BASE + '?shot=1&onb=1&perf2=1&token=' + token, 'perfLegacy');
    fs.writeFileSync(path.join(OUT, '_33.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify({ legacy: { planets: out.legacy.planets.length, ids: out.legacy.planets.map(p => p.id), moons: out.legacy.moons, pluto: out.legacy.pluto }, catalog: out.catalog, clicks: out.clicks, dbl: out.dbl }, null, 1));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
