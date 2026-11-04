'use strict';
// v=1193: финальная проверка наложений, кликов по лунам и радиусов.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const INFO = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1; };
  const rows = Array.from(document.querySelectorAll('.cat-body')).filter(vis).map(e => {
    const r = e.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const t = document.elementFromPoint(x, y);
    const owner = t && t.closest ? t.closest('.cat-body') : null;
    const id = e.getAttribute('data-planet-id') || e.getAttribute('data-moon');
    return { id: id, kind: e.getAttribute('data-moon') ? 'moon' : 'body', x: Math.round(x), y: Math.round(y), w: Math.round(r.width),
             inView: x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight, topOwner: owner ? (owner.getAttribute('data-planet-id') || owner.getAttribute('data-moon')) : null };
  });
  const st = document.getElementById('catalog-stats');
  return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, rows: rows };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    out.info = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat31-tilt0.png'));
    const clickId = async (id) => {
        const p = await cdp.evaluate(b, sid, `(() => { const e = Array.from(document.querySelectorAll('.cat-body')).find(x => (x.getAttribute('data-planet-id')||x.getAttribute('data-moon'))==="${id}"); if (!e) return null; const r = e.getBoundingClientRect(); const x = r.left+r.width/2, y = r.top+r.height/2; const t = document.elementFromPoint(x,y); const o = t && t.closest ? t.closest('.cat-body') : null; return { x: Math.round(x), y: Math.round(y), top: o ? (o.getAttribute('data-planet-id')||o.getAttribute('data-moon')) : null }; })()`);
        if (!p) return { err: 'нет ' + id };
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(600);
        const after = await cdp.evaluate(b, sid, `(() => { const st = document.getElementById('catalog-stats'); return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, sel: window.__selectedBody || null }; })()`);
        return { pos: p, after: after };
    };
    out.problem = [];
    for (const id of ['io', 'moon', 'mimas', 'phobos', 'proteus', 'deimos', 'europa', 'ganymede', 'titan', 'iapetus']) {
        out.problem.push({ id: id, r: await clickId(id) });
    }
    out.five = [];
    for (const id of ['vesta', 'pallas', 'hygiea', 'ceres', 'pluto']) out.five.push({ id: id, r: await clickId(id) });
    // двойной клик
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
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&tilt=45&spin=20&token=' + token }, sid);
    await cdp.sleep(9000);
    out.t45 = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat31-t45.png'));
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&token=' + token }, sid);
    await cdp.sleep(9000);
    out.legacy = await cdp.evaluate(b, sid, `(() => ({ planets: document.querySelectorAll('.planet[data-planet-id]').length, moons: document.querySelectorAll('.moon[data-moon]').length }))()`);
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&perf2=1&token=' + token }, sid);
    await cdp.sleep(11000);
    out.perf = [];
    for (let i = 0; i < 3; i++) { out.perf.push(await cdp.evaluate(b, sid, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`)); await cdp.sleep(2000); }
    fs.writeFileSync(path.join(OUT, '_31.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify({ stats: out.info.stats, bodies: out.info.rows.length, problem: out.problem.map(x => ({ id: x.id, pos: x.r.pos, sel: x.r.after && x.r.after.sel })), dbl: out.dbl, perf: out.perf, legacy: out.legacy }, null, 1).slice(0, 7000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
