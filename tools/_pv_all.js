'use strict';
// A) Все тела: ?pv=<id> — открывается ли поверхность. Плюс сбор списка тел и world-id.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const STATE = `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2; };
  const b3 = document.getElementById('blocks3d-wrap');
  return { blocks: !!b3, blocksVis: vis(b3), pv: document.body.classList.contains('pv-mode'),
           solar: (() => { const e = document.querySelector('.solar-system-container'); return e ? (vis(e) ? 'виден' : 'скрыт') : 'нет'; })(),
           loading: (() => { const e = document.getElementById('pv-loading'); return e ? (vis(e) ? 'виден' : 'скрыт') : 'нет'; })(),
           globe: (() => { const e = document.getElementById('globe-modal'); return e ? (vis(e) ? 'виден' : 'скрыт') : 'нет'; })(),
           canv: Array.from(document.querySelectorAll('canvas')).filter(c => vis(c)).map(c => { try { return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }),
           errBanner: (document.body.innerText.match(/Не удалось загрузить игру|интерфейс не отрисовался|Игра не загрузилась/g) || []).length,
           title: document.title };
})()`;

const LIST = `(() => {
  const planets = Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(e => ({ id: e.getAttribute('data-planet-id'), name: (e.querySelector('.tooltip') || {}).textContent || '' }));
  const moons = Array.from(document.querySelectorAll('.moon[data-moon]')).map(e => {
    let slug = null;
    try { slug = (typeof MOON_SLUG !== 'undefined' && MOON_SLUG[e.getAttribute('data-moon')]) || null; } catch (err) { }
    return { name: e.getAttribute('data-moon'), slug: slug };
  });
  let worlds = [];
  try { worlds = Object.keys(window.PlanetView.worlds || {}); } catch (e) { }
  return { planets: planets, moons: moons, worlds: worlds };
})()`;

async function surfaceState(b, sid) { return await cdp.evaluate(b, sid, STATE); }

async function waitSurface(b, sid, maxMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        const ok = await cdp.evaluate(b, sid, `(() => { const e = document.getElementById('blocks3d-wrap'); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && e.getBoundingClientRect().width > 2; })()`);
        if (ok) return +((Date.now() - t0) / 1000).toFixed(1);
        await cdp.sleep(150);
    }
    return null;
}

(async () => {
    const b = await cdp.launch();
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    const list = await cdp.evaluate(b, sid, LIST);
    const results = { list: list, pv: [] };
    fs.writeFileSync(path.join(OUT, '_pv_all.json'), JSON.stringify(results, null, 1), 'utf8');
    const bodies = [];
    for (const p of list.planets) bodies.push({ kind: 'планета', name: p.name || p.id, id: p.id });
    for (const m of list.moons) bodies.push({ kind: 'луна', name: m.name, id: m.slug || m.name });
    console.log('тел:', bodies.length, 'worlds:', list.worlds.length);
    for (const body of bodies) {
        const url = BASE + '?pv=' + encodeURIComponent(body.id) + '&shot=1&onb=1&token=' + token;
        await b.send('Page.navigate', { url: url }, sid);
        await cdp.sleep(2500);
        const t = await waitSurface(b, sid, 12000);
        const st = await surfaceState(b, sid);
        const rec = { kind: body.kind, name: body.name, id: body.id, url: url.replace(/token=[^&]+/, 'token=T'), surfaceSec: t, state: st };
        results.pv.push(rec);
        fs.writeFileSync(path.join(OUT, '_pv_all.json'), JSON.stringify(results, null, 1), 'utf8');
        console.log(body.kind, body.name, '(' + body.id + ')', 'surface:', t, 'pv:', st.pv, 'solar:', st.solar, 'err:', st.errBanner);
    }
    // вернуть страницу на карту для дальнейших скриптов не нужно
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
