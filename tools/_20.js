'use strict';
// v=1180: новый рендер из каталога — числа, клики, PV, скриншоты, регрессия, perf.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const STATS = `(() => {
  const el = document.getElementById('catalog-stats');
  const t = document.title;
  const bodies = document.querySelectorAll('[data-body-id], .catalog-body, .planet[data-planet-id], .moon[data-moon]');
  const orbits = document.querySelectorAll('.orbit, .orbit-kepler, svg ellipse, svg path[data-orbit]');
  return { stats: el ? el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 500) : null, title: t,
           bodies: bodies.length, orbits: orbits.length,
           planetIds: Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(e => e.getAttribute('data-planet-id')),
           moonCount: document.querySelectorAll('.moon[data-moon]').length,
           shipCount: document.querySelectorAll('.ship-marker').length,
           bodyClass: document.body.className,
           tapCount: (() => { const el = document.getElementById('catalog-taps') || document.querySelector('[data-taps]'); return el ? el.textContent.trim() : null; })(),
           canvas: document.querySelectorAll('canvas').length };
})()`;

async function shot(b, sid, name) { await cdp.screenshot(b, sid, path.join(OUT, name)); }

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = { build: null };
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    out.catalog = await cdp.evaluate(b, sid, STATS);
    await shot(b, sid, 'cat20-tilt0.png');
    // клики по планетам
    const clickRes = await cdp.evaluate(b, sid, `(() => {
      const els = Array.from(document.querySelectorAll('.planet[data-planet-id], [data-body-id]')).slice(0, 5);
      window.__clicks = [];
      els.forEach(e => { const r = e.getBoundingClientRect(); try { e.click(); window.__clicks.push(e.getAttribute('data-planet-id') || e.getAttribute('data-body-id')); } catch (err) {} });
      const st = document.getElementById('catalog-stats');
      return { clicked: window.__clicks, stats: st ? st.textContent.replace(/\\s+/g, ' ').trim() : null, title: document.title };
    })()`);
    out.clicks = clickRes;
    await cdp.sleep(500);
    out.afterClicks = await cdp.evaluate(b, sid, STATS);
    // PV по двойному клику (через реальный dblclick по первому телу)
    const dbl = await cdp.evaluate(b, sid, `(() => { const e = document.querySelector('.planet[data-planet-id], [data-body-id]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), id: e.getAttribute('data-planet-id') || e.getAttribute('data-body-id') }; })()`);
    out.dblTarget = dbl;
    if (dbl) {
        const before = (await (await fetch('http://127.0.0.1:' + b.port + '/json/list')).json()).filter(t => t.type === 'page').length;
        for (let i = 0; i < 2; i++) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dbl.x, y: dbl.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dbl.x, y: dbl.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
            await cdp.sleep(90);
        }
        await cdp.sleep(2500);
        const list = (await (await fetch('http://127.0.0.1:' + b.port + '/json/list')).json()).filter(t => t.type === 'page');
        out.dbl = { before: before, after: list.length, urls: list.map(t => (t.url || '').replace(/token=[^&]+/, 'token=T').slice(0, 90)), state: await cdp.evaluate(b, sid, STATS) };
    }
    // system=war
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&system=war&token=' + token }, sid);
    await cdp.sleep(8000);
    out.war = await cdp.evaluate(b, sid, STATS);
    // tilt=45 и 85
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&tilt=45&spin=20&token=' + token }, sid);
    await cdp.sleep(8000);
    out.t45 = await cdp.evaluate(b, sid, STATS);
    await shot(b, sid, 'cat20-tilt45.png');
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&tilt=85&token=' + token }, sid);
    await cdp.sleep(8000);
    out.t85 = await cdp.evaluate(b, sid, STATS);
    await shot(b, sid, 'cat20-tilt85.png');
    // регрессия без флага
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&token=' + token }, sid);
    await cdp.sleep(9000);
    out.legacy = await cdp.evaluate(b, sid, STATS);
    await shot(b, sid, 'cat20-legacy.png');
    // perf
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&perf2=1&token=' + token }, sid);
    await cdp.sleep(11000);
    const perf = [];
    for (let i = 0; i < 4; i++) { perf.push(await cdp.evaluate(b, sid, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; })()`)); await cdp.sleep(2000); }
    out.perf = perf;
    fs.writeFileSync(path.join(OUT, '_20.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1).slice(0, 6000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
