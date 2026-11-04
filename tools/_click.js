'use strict';
// Батарея кликов: elementFromPoint + синтетические pointer/click/dblclick.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();

const BATTERY = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const R = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };
  const vis = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const desc = el => el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')) : 'null';

  const camVal = () => {
    const tr = (document.querySelector('.solar-system') || { style: {} }).style.transform || '';
    const g = (re) => { const m = tr.match(re); return m ? parseFloat(m[1]) : null; };
    return { scale: g(/scale\(([-\d.]+)\)/), rotX: g(/rotateX\(([-\d.]+)deg\)/), rotZ: g(/rotateZ\(([-\d.]+)deg\)/),
             tx: g(/translate\(([-\d.]+)px/), ty: g(/translate\([-\d.]+px,\s*([-\d.]+)px\)/) };
  };
  const state = () => ({
    modals: Array.from(document.querySelectorAll('[id$="-modal"]')).filter(vis).map(e => e.id).join('|'),
    globe: (() => { const g = document.getElementById('globe-modal'); return g ? getComputedStyle(g).display : 'none'; })(),
    toast: (() => { const t = document.querySelector('#toast-box .toast:last-child'); return t ? t.textContent.slice(0, 80) : ''; })(),
    cam: camVal(),
    body: document.body.className,
    checks: Array.from(document.querySelectorAll('input[type=checkbox]')).map(c => c.id + '=' + (c.checked ? 1 : 0)).join(','),
    panels: ['resources-panel', 'chat-panel', 'view-panel'].map(id => { const e = document.getElementById(id); return id + ':' + (e ? getComputedStyle(e).display : '-'); }).join(','),
    viewCls: (document.getElementById('view-panel') || {}).className || '',
    leftItems: (() => { const e = document.getElementById('left-menu-items'); return e ? getComputedStyle(e).display : '-'; })()
  });
  const diff = (a, b) => {
    const out = [];
    ['modals', 'globe', 'toast', 'body', 'checks', 'panels', 'viewCls', 'leftItems'].forEach(k => { if (String(a[k]) !== String(b[k])) out.push(k + ': ' + a[k] + ' -> ' + b[k]); });
    ['scale', 'rotX', 'rotZ', 'tx', 'ty'].forEach(k => { if (a.cam[k] !== b.cam[k]) out.push('cam.' + k + ': ' + a.cam[k] + ' -> ' + b.cam[k]); });
    return out;
  };

  const reset = async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(60);
    try { if (typeof window.closeGlobe === 'function') window.closeGlobe(); } catch (e) { }
    document.querySelectorAll('[id$="-modal"]').forEach(m => { if (getComputedStyle(m).display !== 'none') m.style.display = 'none'; });
    try { if (typeof window.solarReset === 'function') window.solarReset(); } catch (e) { }
    try { if (typeof scale === 'number') { scale = 0.95; if (window.updateSolarTransform) window.updateSolarTransform(); } } catch (e) { }
    const tb = document.getElementById('toast-box'); if (tb) tb.remove();
    const rp = document.getElementById('resources-panel'); if (rp) rp.style.display = 'none';
    const li = document.getElementById('left-menu-items'); if (li) li.style.display = 'flex';
    await sleep(140);
  };

  const fire = (el, x, y, dbl) => {
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0, buttons: 1, pointerId: 1, isPrimary: true, pointerType: 'mouse', detail: 1 };
    const seq = () => {
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, o, { buttons: 0 })));
      el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, o, { buttons: 0 })));
      el.dispatchEvent(new MouseEvent('click', Object.assign({}, o, { buttons: 0 })));
    };
    seq();
    if (dbl) { seq(); el.dispatchEvent(new MouseEvent('dblclick', Object.assign({}, o, { buttons: 0, detail: 2 }))); }
  };

  const results = [];
  async function test(label, kind, sel, dbl, point) {
    await reset();
    const rec = { label: label, kind: kind, sel: sel, dbl: !!dbl, ok: false, note: '', fx: [] };
    let el = null, x, y;
    if (sel) {
      el = document.querySelector(sel);
      if (!el) { rec.note = 'элемент не найден'; results.push(rec); return; }
      if (!vis(el)) { rec.note = 'элемент невидим (display/visibility/0 размер)'; results.push(rec); return; }
      const r = R(el); rec.rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
      x = r.cx; y = r.cy;
    } else { x = point[0]; y = point[1]; }
    rec.cx = Math.round(x); rec.cy = Math.round(y);
    const top = document.elementFromPoint(x, y);
    rec.top = desc(top);
    const hitSelf = !!(el && top && (top === el || el.contains(top) || top.contains(el)));
    rec.hitSelf = el ? hitSelf : null;
    const before = state();
    const shooter = (el && hitSelf) ? top : top;   // кликаем по тому, что реально сверху (как пользователь)
    if (!shooter) { rec.note = 'elementFromPoint=null'; results.push(rec); return; }
    fire(shooter, x, y, dbl);
    await sleep(420);
    const after = state();
    rec.fx = diff(before, after);
    rec.ok = rec.fx.length > 0;
    if (!rec.ok) rec.note = 'состояние не изменилось';
    results.push(rec);
  }

  // --- объекты сцены ---
  try { if (typeof scale === 'number') { scale = 0.95; if (window.updateSolarTransform) window.updateSolarTransform(); } } catch (e) { }
  await sleep(500);
  const hiddenAtStart = Array.from(document.querySelectorAll('.ship-marker')).filter(e => getComputedStyle(e).display === 'none').length;
  const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
  for (const id of planetIds) await test('планета ' + id, 'planet', '.planet[data-planet-id="' + id + '"]', false);
  for (const m of ['Луна', 'Титан', 'Европа', 'Фобос', 'Ио']) await test('луна ' + m, 'moon', '.moon[data-moon="' + m + '"]', false);
  await test('Врата (портал)', 'portal', '.portal', false);
  const ms = Array.from(document.querySelectorAll('.moon-station')).slice(0, 2);
  for (let i = 0; i < ms.length; i++) {
    const st = ms[i];
    const r = R(st);
    await test('станция луны ' + (st.title || i), 'station', null, false, [r.cx, r.cy]);
    results[results.length - 1].sel = '.moon-station[' + i + ']';
  }
  await test('корабль флота fleet-0', 'ship-fleet', '.ship-marker[data-sid="fleet-0"]', false);
  await test('корабль флота fleet-3', 'ship-fleet', '.ship-marker[data-sid="fleet-3"]', false);
  await test('торговец earth->mars', 'ship-trade', '.ship-marker[data-sid="trade-earth-mars-0"]', false);
  await test('торговец jupiter->saturn', 'ship-trade', '.ship-marker[data-sid="trade-jupiter-saturn-2"]', false);
  await test('гражданский civil-5', 'ship-civil', '.ship-marker[data-sid="civil-5"]', false);
  await test('рудный транспорт belt-0', 'ship-belt', '.ship-marker[data-sid="belt-0"]', false);
  await test('пират pirate-0', 'ship-pirate', '.ship-marker[data-sid="pirate-0"]', false);
  // астероид пояса: точка из beltPos
  const ast = (() => {
    try {
      const days = (simulatedTime - EPOCH_MS) / DAY_MS;
      const p = beltPos(0, days);
      const sp = WorldCoords.toScreen(p, { scale: scale, tiltDeg: rotX, spinDeg: rotZ, panX: posX, panY: posY }, { width: innerWidth, height: innerHeight });
      return [sp.x, sp.y];
    } catch (e) { return null; }
  })();
  if (ast) await test('астероид пояса (beltPos 0)', 'asteroid', null, false, ast);

  // --- кнопки панели ---
  await test('кнопка наклона ▲', 'btn', '.d-btn.up', false);
  await test('кнопка наклона ▼', 'btn', '.d-btn.down', false);
  await test('кнопка поворота ◀', 'btn', '.d-btn.left', false);
  await test('кнопка поворота ▶', 'btn', '.d-btn.right', false);
  await test('кнопка сброса •', 'btn', '.d-btn.center', false);
  await test('зум +', 'btn', '.zoom-btn[onclick="solarZoomIn()"]', false);
  await test('зум −', 'btn', '.zoom-btn[onclick="solarZoomOut()"]', false);
  await test('чекбокс Все маршруты', 'check', '#routes-all', false);
  await test('чекбокс Только свои', 'check', '#routes-own', false);
  await test('чекбокс Маршруты флотов', 'check', '#fleet-routes-toggle', false);
  await test('чекбокс Станции и лифты', 'check', '#station-toggle', false);
  await test('кнопка Фильтры', 'btn', '.view-head', false);
  await test('слайдер наклона', 'slider', '#tilt-slider', false);

  // --- меню ---
  await test('кнопка ☰ меню', 'menu', '.menu-toggle', false);
  await test('меню Флот', 'menu', '.menu-btn[onclick="openFleet()"]', false);
  await test('меню Ресурсы', 'menu', '.menu-btn[onclick="openResourcesPanel()"]', false);
  await test('меню Системы', 'menu', '#systems-btn', false);
  await test('меню Торговля', 'menu', '#trade-btn', false);
  await test('меню Разведсводка', 'menu', '#npc-btn', false);
  await test('кнопка Назад (склад)', 'menu', '.back-btn', false);

  // --- наложение кнопок наставника ---
  await test('наставник «Открыть Ресурсы»', 'mentor', '.mentor-open', false);
  await test('наставник «Понятно»', 'mentor', '.mentor-next', false);

  // --- пустые точки ---
  await test('пустое место (700,760)', 'empty', null, false, [700, 760]);
  await test('пустое место (500,120)', 'empty', null, false, [500, 120]);

  // --- двойные клики ---
  await test('двойной клик Земля', 'planet-dbl', '.planet[data-planet-id="earth"]', true);
  await test('двойной клик Марс', 'planet-dbl', '.planet[data-planet-id="mars"]', true);
  await test('двойной клик Луна', 'moon-dbl', '.moon[data-moon="Луна"]', true);
  await test('двойной клик торговец', 'ship-dbl', '.ship-marker[data-sid="trade-earth-mars-0"]', true);
  await test('двойной клик флот fleet-0', 'ship-dbl', '.ship-marker[data-sid="fleet-0"]', true);
  if (ast) await test('двойной клик астероид', 'asteroid-dbl', null, true, ast);

  return { viewport: [innerWidth, innerHeight], hiddenAtStart: hiddenAtStart, results: results };
})()`;

(async () => {
    const b = await cdp.launch();
    const url = 'https://warbattleuniverse.com/?shot=1&onb=1&freeze=100000&token=' + token;
    const { sessionId } = await cdp.newPage(b, url, { wait: 9500 });
    const v = await cdp.evaluate(b, sessionId, BATTERY);
    fs.writeFileSync(path.join(OUT, '_clicks.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log('checks:', v && v.results ? v.results.length : v);
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
