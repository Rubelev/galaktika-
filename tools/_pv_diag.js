'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const ST = `(() => { const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && r.width > 2; };
  return { pv: document.body.classList.contains('pv-mode'), blocks: !!document.getElementById('blocks3d-wrap'), blocksVis: vis(document.getElementById('blocks3d-wrap')),
           globe: (() => { const e = document.getElementById('globe-modal'); return e ? getComputedStyle(e).display : 'none'; })(),
           errs: (window.__errs || []).slice(0, 6), pvErr: window.__pvErr || null, solar: vis(document.querySelector('.solar-system-container')),
           loading: (() => { const e = document.getElementById('pv-loading'); return e ? (vis(e) ? 'виден' : 'скрыт') : 'нет'; })() }; })()`;

const GEOM = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); if (r.width < 2) return { invisible: true };
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`;

(async () => {
    const b = await cdp.launch();
    const out = {};
    // 1) прямой вызов PlanetView.open на карте
    let pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    await cdp.evaluate(b, pg.sessionId, `(() => { window.__errs = []; try { window.PlanetView.open('earth'); } catch (e) { window.__errs.push('open: ' + e.message); } return 1; })()`);
    await cdp.sleep(6000);
    out.directOpen = await cdp.evaluate(b, pg.sessionId, ST);
    await cdp.screenshot(b, pg.sessionId, path.join(OUT, '_pv_directopen.png'));
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }

    // 2) глобус -> кнопка спуска (реальный клик)
    pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    await cdp.evaluate(b, pg.sessionId, `(() => { window.__errs = []; try { window.openGlobe('earth'); } catch (e) { window.__errs.push('globe: ' + e.message); } return 1; })()`);
    await cdp.sleep(1500);
    const g = await cdp.evaluate(b, pg.sessionId, GEOM('#globe-surface'));
    out.globeBtnGeom = g;
    if (g && !g.invisible) {
        await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.x, y: g.y, button: 'left', clickCount: 1, buttons: 1 }, pg.sessionId);
        await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.x, y: g.y, button: 'left', clickCount: 1, buttons: 0 }, pg.sessionId);
    }
    await cdp.sleep(1500);
    out.afterDescent1 = await cdp.evaluate(b, pg.sessionId, ST);
    await cdp.sleep(6000);
    out.afterDescent7 = await cdp.evaluate(b, pg.sessionId, ST);
    out.consoleAfterDescent = b.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map(e => (e.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200)).slice(-6);
    await cdp.screenshot(b, pg.sessionId, path.join(OUT, '_pv_descent.png'));
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }

    // 3) ?pv=earth: какой код путь (проверим наличие pv-mode и вызов из параметра)
    pg = await cdp.newPage(b, BASE + '?pv=earth&shot=1&onb=1&token=' + token, { wait: 9000 });
    out.pvParam = await cdp.evaluate(b, pg.sessionId, ST);
    out.pvParamHasOpen = await cdp.evaluate(b, pg.sessionId, `(() => ({ open: typeof window.PlanetView.open, pv: document.body.className }))()`);
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }

    fs.writeFileSync(path.join(OUT, '_pv_diag.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
