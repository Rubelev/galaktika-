'use strict';
// v=1186: луны на лог-шкале, клики, двойной клик, наложения, perf.
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
  const planets = Array.from(document.querySelectorAll('.planet[data-planet-id]')).filter(vis).map(e => {
    const r = e.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const t = document.elementFromPoint(x, y);
    const owner = t && t.closest ? t.closest('.planet[data-planet-id]') : null;
    return { id: e.getAttribute('data-planet-id'), x: Math.round(x), y: Math.round(y), w: Math.round(r.width),
             inView: x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight, top: D(t), topOwner: owner ? owner.getAttribute('data-planet-id') : null };
  });
  const moons = Array.from(document.querySelectorAll('.moon[data-moon]')).filter(vis).map(e => { const r = e.getBoundingClientRect(); return { m: e.getAttribute('data-moon'), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width) }; });
  return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, title: document.title, planets: planets, moons: moons };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const out = {};
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 10000 });
    const sid = pg.sessionId;
    out.info = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat24-tilt0.png'));
    // 5 кликов подряд (пауза 500 мс > 260 мс)
    const targets = (out.info.planets || []).filter(p => p.inView && p.w >= 2).slice(0, 5);
    out.targets = targets.map(t => ({ id: t.id, x: t.x, y: t.y, w: t.w, top: t.top, owner: t.topOwner }));
    for (const t of targets) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 1 }, sid);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 0 }, sid);
        await cdp.sleep(600);
    }
    await cdp.sleep(800);
    out.after5 = await cdp.evaluate(b, sid, `(() => { const st = document.getElementById('catalog-stats'); return { stats: st ? st.textContent.replace(/\\s+/g,' ').trim() : null, href: location.href.replace(/token=[^&]+/, 'token=T'), pv: document.body.classList.contains('pv-mode') }; })()`);
    // двойной клик по vesta на свежей загрузке
    const pg2 = await cdp.newPage(b, BASE + '?shot=1&onb=1&render=catalog&token=' + token, { wait: 9500 });
    const sid2 = pg2.sessionId;
    const vp = await cdp.evaluate(b, sid2, `(() => { const e = document.querySelector('.planet[data-planet-id="vesta"]'); const r = e.getBoundingClientRect(); return { x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), w: Math.round(r.width) }; })()`);
    out.vestaPos = vp;
    for (let i = 0; i < 2; i++) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: vp.x, y: vp.y, button: 'left', clickCount: i + 1, buttons: 1 }, sid2);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: vp.x, y: vp.y, button: 'left', clickCount: i + 1, buttons: 0 }, sid2);
        await cdp.sleep(120);
    }
    await cdp.sleep(4000);
    out.dbl = await cdp.evaluate(b, sid2, `(() => ({ href: location.href.replace(/token=[^&]+/, 'token=T'), hash: location.hash, pv: document.body.classList.contains('pv-mode'), blocks: !!document.getElementById('blocks3d-wrap'), stats: (document.getElementById('catalog-stats')||{}).textContent }))()`);
    try { await b.send('Target.closeTarget', { targetId: pg2.targetId }); } catch (e) { }
    // tilt=45
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&tilt=45&spin=20&token=' + token }, sid);
    await cdp.sleep(9000);
    out.t45 = await cdp.evaluate(b, sid, INFO);
    await cdp.screenshot(b, sid, path.join(OUT, 'cat24-t45.png'));
    // регрессия
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&token=' + token }, sid);
    await cdp.sleep(9000);
    out.legacy = await cdp.evaluate(b, sid, INFO);
    // perf
    await b.send('Page.navigate', { url: BASE + '?shot=1&onb=1&render=catalog&perf2=1&token=' + token }, sid);
    await cdp.sleep(11000);
    out.perf = [];
    for (let i = 0; i < 4; i++) { out.perf.push(await cdp.evaluate(b, sid, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`)); await cdp.sleep(2000); }
    fs.writeFileSync(path.join(OUT, '_24.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1).slice(0, 8000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
