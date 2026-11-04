'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const PROBE = `(() => {
  const D = el => el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '')) : 'null';
  const info = el => { if (!el) return null; const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return { d: D(el), r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
             pe: s.pointerEvents, z: s.zIndex, pos: s.position, op: s.opacity, bg: s.backgroundColor, tag: el.tagName }; };
  const stack = (x, y) => (document.elementsFromPoint(x, y) || []).slice(0, 8).map(info);
  const out = { points: {} };
  const add = (name, x, y) => { out.points[name] = { x: Math.round(x), y: Math.round(y), stack: stack(x, y) }; };
  const c = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { e: e, x: r.left + r.width / 2, y: r.top + r.height / 2, r: r }; };
  const earth = c('.planet[data-planet-id="earth"]');
  if (earth) add('earth', earth.x, earth.y);
  const menu = c('.menu-btn[onclick="openFleet()"]');
  if (menu) add('menu-fleet', menu.x, menu.y);
  const zi = c('.zoom-btn[onclick="solarZoomIn()"]');
  if (zi) add('zoom-in', zi.x, zi.y);
  add('empty', 700, 760);
  add('empty2', 500, 120);
  const tr = document.getElementById('tr-wrap');
  out.trWrap = tr ? Object.assign(info(tr), { html: tr.outerHTML.slice(0, 300) }) : null;
  out.trWrapCount = document.querySelectorAll('#tr-wrap').length;
  out.bodyChildren = Array.from(document.body.children).map(e => D(e) + ' z=' + getComputedStyle(e).zIndex + ' pe=' + getComputedStyle(e).pointerEvents + ' d=' + getComputedStyle(e).display);
  const ps = (sel) => { const e = document.querySelector(sel); if (!e) return null; const s = getComputedStyle(e); return { sel: sel, pe: s.pointerEvents, z: s.zIndex, pos: s.position, display: s.display, opacity: s.opacity, w: e.getBoundingClientRect().width }; };
  out.styles = ['.orbit', '.planet-wrapper', '.planet', '.planet-surface', '.moon', '.moon-orbit', '.ship-marker', '.tooltip', '#asteroid-canvas', '.solar-system', '#tr-wrap'].map(ps);
  out.scale = (typeof scale === 'number' ? scale : null);
  out.civil0 = (() => { const e = document.querySelector('.ship-marker[data-sid="civil-0"]'); return e ? { html: e.outerHTML.slice(0, 300), display: getComputedStyle(e).display } : null; })();
  return out;
})()`;

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9500 });
    await cdp.evaluate(b, sessionId, `(() => { try { if (typeof scale === 'number') { scale = 0.95; window.updateSolarTransform(); } } catch(e){} return 1; })()`);
    await cdp.sleep(600);
    const v = await cdp.evaluate(b, sessionId, PROBE);
    fs.writeFileSync(path.join(OUT, '_hit.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log('ok');
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
