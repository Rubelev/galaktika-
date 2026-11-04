'use strict';
// v=1138: все объекты каталога — движение (5 кадров × 60 с), орбита, изображение, 3 ракурса.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const GRAB = String.raw`(() => {
  const rect = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, r.left + r.width/2, r.top + r.height/2]; };
  const t = (window.__freezeAt !== undefined) ? window.__freezeAt : (window.Motion ? window.Motion.now() : 0);
  const cam = (() => { const s = document.querySelector('.solar-system'); const tr = s ? (s.style.transform || '') : '';
    const g = re => { const m = tr.match(re); return m ? +m[1] : null; };
    return { scale: g(/scale\(([-\d.]+)\)/), rotX: g(/rotateX\(([-\d.]+)deg\)/), rotZ: g(/rotateZ\(([-\d.]+)deg\)/) }; })();
  const wcAll = (window.WorldCoords && window.WorldCoords.planetsAt) ? window.WorldCoords.planetsAt(t) : {};
  const bodies = [];
  document.querySelectorAll('.planet[data-planet-id]').forEach(el => {
    const id = el.getAttribute('data-planet-id');
    bodies.push({ kind: 'planet', id, r: rect(el), vis: getComputedStyle(el).display !== 'none', wc: wcAll[id] || null,
                  cls: el.className, bg: (getComputedStyle(el).backgroundImage || '').slice(0, 80) });
  });
  document.querySelectorAll('.moon[data-moon]').forEach(el => {
    const nm = el.getAttribute('data-moon');
    bodies.push({ kind: 'moon', id: nm, r: rect(el), vis: getComputedStyle(el).display !== 'none', wc: null, cls: el.className });
  });
  document.querySelectorAll('.ship-marker').forEach(el => {
    const sid = el.dataset.sid || '';
    const r = rect(el);
    bodies.push({ kind: 'ship', id: sid, r, vis: getComputedStyle(el).display !== 'none', wc: null, cls: el.className });
  });
  const paths = Array.from(document.querySelectorAll('svg path, svg ellipse, svg circle')).map(p => ({ tag: p.tagName, d: p.getAttribute('d') || null, ell: p.tagName === 'ellipse' ? [p.getAttribute('cx'), p.getAttribute('cy'), p.getAttribute('rx'), p.getAttribute('ry')] : null }));
  const sun = document.querySelector('.sun');
  return { t: t, cam: cam, bodies: bodies, paths: paths.slice(0, 60), pathCount: paths.length,
           sun: sun ? { r: rect(sun), br: getComputedStyle(sun).borderRadius, tr: (getComputedStyle(sun).transform || '').slice(0, 60) } : null,
           errors: (document.body.innerText.match(/Не удалось загрузить игру|интерфейс не отрисовался/g) || []).length,
           loadErr: !!document.getElementById('load-error'), title: document.title };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const views = [[0, 0], [45, 20], [85, 0]];
    const out = { views: [], meta: {} };
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 9000 });
    const sid = pg.sessionId;
    const base = await cdp.evaluate(b, sid, `(window.__freezeAt !== undefined ? window.__freezeAt : (window.Motion && window.Motion.now ? window.Motion.now() : Date.now()))`);
    for (const [tilt, spin] of views) {
        const url = BASE + '?shot=1&onb=1&freeze=100000&tilt=' + tilt + '&spin=' + spin + '&token=' + token;
        await b.send('Page.navigate', { url: url }, sid);
        await cdp.sleep(5000);
        const frames = [];
        for (let k = 0; k < 5; k++) {
            await cdp.evaluate(b, sid, `(() => { window.__freezeAt = ${base} + ${k * 60000}; return 1; })()`);
            await cdp.sleep(700);
            frames.push(await cdp.evaluate(b, sid, GRAB));
        }
        const png = '3d18-' + tilt + '-' + spin + '.png';
        await cdp.screenshot(b, sid, path.join(OUT, png));
        out.views.push({ tilt: tilt, spin: spin, frames: frames, png: png });
        fs.writeFileSync(path.join(OUT, '_18.json'), JSON.stringify(out, null, 1), 'utf8');
        console.log('view', tilt, spin, 'bodies:', frames[0].bodies.length, 'paths:', frames[0].pathCount, 'sun:', JSON.stringify(frames[0].sun));
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
