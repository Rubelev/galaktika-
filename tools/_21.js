'use strict';
// v=1182: повторная проверка каталог-рендера.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const INFO = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1; };
  const st = document.getElementById('catalog-stats');
  const planets = Array.from(document.querySelectorAll('.planet[data-planet-id]'));
  const moons = Array.from(document.querySelectorAll('.moon[data-moon]'));
  const suns = Array.from(document.querySelectorAll('.sun'));
  const visPlanets = planets.filter(vis).map(e => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-planet-id'), x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w: Math.round(r.width), h: Math.round(r.height) }; });
  const visMoons = moons.filter(vis).map(e => { const r = e.getBoundingClientRect(); return { m: e.getAttribute('data-moon'), x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; });
  const sunRects = suns.filter(vis).map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), w: Math.round(r.width) }; });
  return { stats: st ? st.textContent.replace(/\\s+/g, ' ').trim() : null, title: document.title,
           planetsTotal: planets.length, planetsVisible: visPlanets.length, planetIds: visPlanets.map(p => p.id),
           moonsTotal: moons.length, moonsVisible: visMoons.length,
           sunsTotal: suns.length, sunsVisible: sunRects.length, sunRects: sunRects,
           visPlanets: visPlanets.slice(0, 12), canvas: document.querySelectorAll('canvas').length,
           canvasVis: Array.from(document.querySelectorAll('canvas')).filter(vis).length };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    out.t0 = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat21-tilt0.png'));
    // клики по узлам каталога
    const targets = (out.t0.visPlanets || []).slice(0, 5);
    out.clicked = targets.map(t => t.id);
    for (const t of targets) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(450);
    }
    await cdp.sleep(800);
    out.afterClicks = await cdp.evaluate(b, sid, `(() => { const st = document.getElementById('catalog-stats'); return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, title: document.title }; })()`);
    // двойной клик по узлу каталога
    if (targets[0]) {
        const t = targets[0];
        const before = (await (await fetch('http://127.0.0.1:' + b.port + '/json/list')).json()).filter(x => x.type === 'page').length;
        for (let i = 0; i < 2; i++) {
            await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid);
            await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid);
            await cdp.sleep(90);
        }
        await cdp.sleep(2500);
        const list = (await (await fetch('http://127.0.0.1:' + b.port + '/json/list')).json()).filter(x => x.type === 'page');
        out.dbl = { target: t.id, before: before, after: list.length, urls: list.map(x => (x.url || '').replace(/token=[^&]+/, 'token=T').slice(0, 110)) };
        for (const x of list.slice(before)) { try { await b.send('Target.closeTarget', { targetId: x.id }); } catch (e) { } }
    }
    // tilt 45 и 85
    for (const [name, q] of [['t45', '&tilt=45&spin=20'], ['t85', '&tilt=85']]) {
        await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog' + q + '&token=' + token }, sid);
        await cdp.sleep(9000);
        out[name] = await cdp.evaluate(b, sid, INFO);
        await cdp.screenshot(b, sid, path.join(OUT, 'cat21-' + name + '.png'));
    }
    // system=war
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&system=war&token=' + token }, sid);
    await cdp.sleep(9000);
    out.war = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat21-war.png'));
    // регрессия
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&token=' + token }, sid);
    await cdp.sleep(9000);
    out.legacy = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat21-legacy.png'));
    // perf
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&perf2=1&token=' + token }, sid);
    await cdp.sleep(10000);
    out.perf = [];
    for (let i = 0; i < 4; i++) { out.perf.push(await cdp.evaluate(b, sid, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`)); await cdp.sleep(2000); }
    fs.writeFileSync(path.join(OUT, '_21.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1).slice(0, 7000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
