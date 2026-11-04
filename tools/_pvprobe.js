'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const STATE = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2; };
  const canv = Array.from(document.querySelectorAll('canvas')).map(c => ({ id: c.id, w: c.width, h: c.height, vis: vis(c),
    gl: (() => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })() }));
  return {
    href: location.href.replace(/token=[^&]+/, 'token=T'),
    title: document.title,
    body: document.body.className,
    pvMode: document.body.classList.contains('pv-mode'),
    blocks: !!document.getElementById('blocks3d-wrap'), blocksVis: vis(document.getElementById('blocks3d-wrap')),
    pvFly: !!document.getElementById('pv-fly'), pvFlyVis: vis(document.getElementById('pv-fly')),
    pvBar: !!document.getElementById('pv-bar'), pvBarVis: vis(document.getElementById('pv-bar')),
    loading: (() => { const e = document.getElementById('pv-loading'); return e ? (vis(e) ? 'виден' : 'скрыт') : 'нет элемента'; })(),
    solar: (() => { const e = document.querySelector('.solar-system-container'); if (!e) return 'нет'; return vis(e) ? 'виден' : 'скрыт'; })(),
    globe: (() => { const e = document.getElementById('globe-modal'); return e ? (vis(e) ? 'виден' : 'скрыт') : 'нет'; })(),
    canvases: canv,
    errBanner: (document.body.innerText.match(/Не удалось загрузить игру|интерфейс не отрисовался|Игра не загрузилась/g) || []).length,
    text: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 200)
  };
})()`;

(async () => {
    const b = await cdp.launch();
    const out = {};
    // 1) ?pv=earth
    let pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?pv=earth&shot=1&onb=1&token=' + token, { wait: 11000 });
    out.pv = await cdp.evaluate(b, pg.sessionId, STATE);
    out.pvUrlHtml = await cdp.evaluate(b, pg.sessionId, `document.documentElement.outerHTML.length`);
    await cdp.screenshot(b, pg.sessionId, path.join(OUT, '_pv_probe.png'));
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    // 2) обычная страница + openGlobe('earth'): кнопки в модалке
    pg = await cdp.newPage(b, 'https://warbattleuniverse.com/?shot=1&onb=1&token=' + token, { wait: 9000 });
    await cdp.evaluate(b, pg.sessionId, `(() => { try { if (typeof window.openGlobe === 'function') window.openGlobe('earth'); return typeof window.openGlobe; } catch(e) { return 'ERR:' + e.message; } })()`);
    await cdp.sleep(1500);
    out.globe = await cdp.evaluate(b, pg.sessionId, STATE);
    out.globeButtons = await cdp.evaluate(b, pg.sessionId, `(() => {
      const m = document.getElementById('globe-modal');
      if (!m) return null;
      const D = e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0,2).join('.') : ''));
      return Array.from(m.querySelectorAll('button,[onclick],[role=button]')).map(e => ({ d: D(e), text: (e.textContent || '').trim().slice(0, 40), onclick: (e.getAttribute('onclick') || '').slice(0, 60) }));
    })()`);
    out.pvApi = await cdp.evaluate(b, pg.sessionId, `(() => ({ PlanetView: typeof window.PlanetView, open: window.PlanetView ? typeof window.PlanetView.open : null, descent: typeof window.descentTo, toGlobe: typeof window.pvToGlobe }))()`);
    try { await b.send('Target.closeTarget', { targetId: pg.targetId }); } catch (e) { }
    fs.writeFileSync(path.join(OUT, '_pvprobe.json'), JSON.stringify(out, null, 1), 'utf8');
    console.log(JSON.stringify(out, null, 1));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
