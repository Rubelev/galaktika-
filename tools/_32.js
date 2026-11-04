'use strict';
// v=1201: старый вид (9+23), визуал, меню, каталог-режим, perf.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const LEG = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1; };
  const planets = Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(e => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { id: e.getAttribute('data-planet-id'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width), h: Math.round(r.height),
             vis: vis(e), bg: (cs.backgroundImage || '').slice(0, 90), filter: (cs.filter || '').slice(0, 40) };
  });
  const moons = Array.from(document.querySelectorAll('.moon[data-moon]')).map(e => { const r = e.getBoundingClientRect(); return { m: e.getAttribute('data-moon'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width), vis: vis(e) }; });
  const menu = Array.from(document.querySelectorAll('.left-menu .menu-btn, #left-menu button')).map(e => ({ t: (e.textContent || '').trim().slice(0, 30), vis: vis(e) }));
  return { planets: planets, moons: moons, menu: menu.slice(0, 30), sun: (() => { const s = document.querySelector('.sun'); if (!s) return null; const r = s.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width), vis: vis(s) }; })() };
})()`;

const CAT = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1; };
  const st = document.getElementById('catalog-stats');
  const rows = Array.from(document.querySelectorAll('.cat-body')).filter(vis);
  return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, bodies: rows.length, title: document.title };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    // старый вид
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    out.legacy = await cdp.evaluate(b, sid, LEG);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat32-legacy.png'));
    // каталог-режим
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&token=' + token }, sid);
    await cdp.sleep(10000);
    out.catalog = await cdp.evaluate(b, sid, CAT);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat32-catalog.png'));
    // 5 кликов по cat-body
    const targets = await cdp.evaluate(b, sid, `(() => Array.from(document.querySelectorAll('.cat-body[data-planet-id]')).filter(e => { const r = e.getBoundingClientRect(); return r.width > 1 && r.left > 0 && r.top > 0; }).slice(0, 5).map(e => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-planet-id'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2) }; }))()`);
    for (const t of targets) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(500);
    }
    await cdp.sleep(600);
    out.afterClicks = await cdp.evaluate(b, sid, `(() => { const st = document.getElementById('catalog-stats'); return st ? st.textContent.replace(/\\s+/g,' ').trim() : null; })()`);
    // двойной клик по vesta
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
    try { await b.send('Target.closeTarget', { targetId: pg2.targetId }); } catch (e) { }
    // perf каталог
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&perf2=1&token=' + token }, sid);
    await cdp.sleep(11000);
    out.perfCat = [];
    for (let i = 0; i < 3; i++) { out.perfCat.push(await cdp.evaluate(b, sid, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`)); await cdp.sleep(2000); }
    // perf старый
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&perf2=1&token=' + token }, sid);
    await cdp.sleep(11000);
    out.perfLegacy = [];
    for (let i = 0; i < 3; i++) { out.perfLegacy.push(await cdp.evaluate(b, sid, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`)); await cdp.sleep(2000); }
    fs.writeFileSync(path.join(OUT, '_32.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify({ legacy: { planets: out.legacy.planets.length, vis: out.legacy.planets.filter(p => p.vis).length, ids: out.legacy.planets.map(p => p.id), moons: out.legacy.moons.length, sun: out.legacy.sun, menu: out.legacy.menu }, catalog: out.catalog, clicks: out.afterClicks, dbl: out.dbl, perfCat: out.perfCat, perfLegacy: out.perfLegacy }, null, 1).slice(0, 7000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
