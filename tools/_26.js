'use strict';
// v=1188: .cat-body, клики 5/42, глобус не открывается, dblclick -> PV.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const INFO = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1; };
  const D = e => e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + String(e.className).trim().split(/\\s+/).slice(0,3).join('.') : '')) : 'null';
  const st = document.getElementById('catalog-stats');
  const catBodies = Array.from(document.querySelectorAll('.cat-body[data-planet-id]')).filter(vis).map(e => {
    const r = e.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const t = document.elementFromPoint(x, y);
    const owner = t && t.closest ? (t.closest('.cat-body[data-planet-id]') || t.closest('.planet[data-planet-id]')) : null;
    return { id: e.getAttribute('data-planet-id'), x: Math.round(x), y: Math.round(y), w: Math.round(r.width),
             inView: x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight, top: D(t), owner: owner ? (owner.getAttribute('data-planet-id')) : null };
  });
  const moons = Array.from(document.querySelectorAll('.cat-body[data-moon], .moon[data-moon]')).filter(vis).map(e => { const r = e.getBoundingClientRect(); return { m: e.getAttribute('data-moon'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2) }; });
  return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, planetsOld: document.querySelectorAll('.planet').length,
           catBodiesCount: document.querySelectorAll('.cat-body').length, catPlanets: catBodies, moons: moons };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    out.info = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat26-tilt0.png'));
    const names = ['vesta', 'pallas', 'hygiea', 'ceres', 'pluto'];
    out.steps = [];
    for (const nm of names) {
        const pos = await cdp.evaluate(b, sid, `(() => { const e = document.querySelector('.cat-body[data-planet-id="${nm}"]') || document.querySelector('[data-planet-id="${nm}"]'); if (!e) return null; const r = e.getBoundingClientRect(); const x = r.left+r.width/2, y = r.top+r.height/2; const t = document.elementFromPoint(x,y); const o = t && t.closest ? (t.closest('.cat-body') || t.closest('.planet')) : null; return { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), top: t ? t.tagName.toLowerCase()+(t.id?'#'+t.id:'')+'.'+String(t.className).split(' ')[0] : 'null', owner: o ? (o.getAttribute('data-planet-id')) : null }; })()`);
        if (!pos) { out.steps.push({ nm: nm, err: 'нет цели' }); continue; }
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(700);
        const after = await cdp.evaluate(b, sid, `(() => { const st = document.getElementById('catalog-stats'); const g = document.getElementById('globe-modal'); return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, globe: g ? getComputedStyle(g).display : 'нет', sel: window.__selectedBody || null }; })()`);
        out.steps.push({ nm: nm, pos: pos, after: after });
    }
    // двойной клик по vesta на свежей загрузке
    const pg2 = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 9500 });
    const sid2 = pg2.sessionId;
    const vp = await cdp.evaluate(b, sid2, `(() => { const e = document.querySelector('.cat-body[data-planet-id="vesta"]') || document.querySelector('[data-planet-id="vesta"]'); const r = e.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2) }; })()`);
    for (let i = 0; i < 2; i++) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: vp.x, y: vp.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid2);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: vp.x, y: vp.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid2);
        await cdp.sleep(110);
    }
    await cdp.sleep(4500);
    out.dbl = await cdp.evaluate(b, sid2, `(() => ({ href: location.href.replace(/token=[^&]+/, 'token=T'), pv: document.body.classList.contains('pv-mode'), blocks: !!document.getElementById('blocks3d-wrap'), sel: window.__selectedBody || null, globe: (() => { const g = document.getElementById('globe-modal'); return g ? getComputedStyle(g).display : 'нет'; })() }))()`);
    try { await b.send('Target.closeTarget', { targetId: pg2.targetId }); } catch (e) { }
    // tilt=45
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&tilt=45&spin=20&token=' + token }, sid);
    await cdp.sleep(9000);
    out.t45 = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat26-t45.png'));
    // регрессия
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&token=' + token }, sid);
    await cdp.sleep(9000);
    out.legacy = await cdp.evaluate(b, sid, `(() => ({ planets: document.querySelectorAll('.planet[data-planet-id]').length, moons: document.querySelectorAll('.moon[data-moon]').length, title: document.title }))()`);
    // perf
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&perf2=1&token=' + token }, sid);
    await cdp.sleep(11000);
    out.perf = [];
    for (let i = 0; i < 3; i++) { out.perf.push(await cdp.evaluate(b, sid, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`)); await cdp.sleep(2000); }
    fs.writeFileSync(path.join(OUT, '_26.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify({ info: { stats: out.info.stats, planetsOld: out.info.planetsOld, catBodies: out.info.catBodiesCount, catPlanets: out.info.catPlanets.slice(0,20), moons: out.info.moons.length }, steps: out.steps.map(s => ({ nm: s.nm, pos: s.pos, after: s.after })), dbl: out.dbl, perf: out.perf, legacy: out.legacy }, null, 1).slice(0, 7000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
