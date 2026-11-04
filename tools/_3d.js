'use strict';
// 3D: матрица ракурсов, числа по DOM + скриншоты 1400×900.
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const VIEWS = [];
for (const t of [-85, -45, 0, 30, 45, 60, 85]) VIEWS.push({ tilt: t, spin: 0, zoom: 0.3, group: 'tilt' });
for (const s of [45, 90, 135, 180, -90]) VIEWS.push({ tilt: 45, spin: s, zoom: 0.3, group: 'spin' });
for (const z of [0.3, 1, 2, 4]) VIEWS.push({ tilt: 0, spin: 0, zoom: z, group: 'zoom0' });
for (const z of [0.3, 1, 2, 4]) VIEWS.push({ tilt: 45, spin: 0, zoom: z, group: 'zoom45' });

const GRAB = String.raw`(() => {
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width/2, cy: r.top + r.height/2 }; };
  const scene = document.querySelector('.solar-system');
  const tr = scene ? (scene.style.transform || '') : '';
  const g = re => { const m = tr.match(re); return m ? +m[1] : null; };
  const cam = { scale: g(/scale\(([-\d.]+)\)/), rotX: g(/rotateX\(([-\d.]+)deg\)/), rotZ: g(/rotateZ\(([-\d.]+)deg\)/), panX: g(/translate\(([-\d.]+)px/), panY: (() => { const m = tr.match(/translate\([-\d.]+px,\s*([-\d.]+)px\)/); return m ? +m[1] : null; })() };
  const t = (window.__freezeAt !== undefined) ? window.__freezeAt : (window.Motion ? window.Motion.now() : Date.now());
  const planets = [];
  document.querySelectorAll('.planet[data-planet-id]').forEach(el => {
    const id = el.getAttribute('data-planet-id');
    const orbit = el.closest('.orbit');
    const rOrbit = orbit ? parseFloat(orbit.style.width) / 2 : null;
    const wc = window.WorldCoords ? window.WorldCoords.planetAt(id, t) : null;
    const pred = (wc && cam.scale) ? window.WorldCoords.toScreen(wc, { scale: cam.scale, tiltDeg: cam.rotX, spinDeg: cam.rotZ, panX: cam.panX, panY: cam.panY }, { width: innerWidth, height: innerHeight }) : null;
    planets.push({ id: id, r: rect(el), orbitR: rOrbit, devOrbit: (wc && rOrbit) ? Math.abs(Math.hypot(wc.x, wc.y) - rOrbit) : null,
                   devScreen: pred ? Math.hypot(rect(el).cx - pred.x, rect(el).cy - pred.y) : null, wc: wc, pred: pred });
  });
  const moons = [];
  document.querySelectorAll('.moon[data-moon]').forEach(el => {
    const r = rect(el);
    let best = null, bd = 1e9;
    planets.forEach(p => { const d = Math.hypot(p.r.cx - r.cx, p.r.cy - r.cy); if (d < bd) { bd = d; best = p.id; } });
    moons.push({ name: el.getAttribute('data-moon'), r: r, planet: best, dist: +bd.toFixed(1) });
  });
  const sun = document.querySelector('.sun');
  const sunR = sun ? rect(sun) : null;
  const ships = Array.from(document.querySelectorAll('.ship-marker')).map(el => { const r = rect(el); return { sid: el.dataset.sid, r: r, vis: getComputedStyle(el).display !== 'none' }; });
  const visShips = ships.filter(s => s.vis);
  const offscreen = visShips.filter(s => s.r.cx < 0 || s.r.cy < 0 || s.r.cx > innerWidth || s.r.cy > innerHeight).length;
  // перекрытия планет
  const overlaps = [];
  for (let i = 0; i < planets.length; i++) for (let j = i + 1; j < planets.length; j++) {
    const a = planets[i].r, b = planets[j].r;
    const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    if (ox > 1 && oy > 1) overlaps.push({ a: planets[i].id, b: planets[j].id, px: Math.round(ox * oy) });
  }
  // что сверху в центрах планет и Солнца
  const topAt = (x, y) => { const e = document.elementFromPoint(x, y); if (!e) return 'null'; const p = e.closest && e.closest('.planet[data-planet-id]'); return p ? p.getAttribute('data-planet-id') : (e.closest && e.closest('.sun') ? 'sun' : (e.className && String(e.className).slice(0, 30) || e.tagName)); };
  const tops = {};
  planets.forEach(p => { tops[p.id] = topAt(p.r.cx, p.r.cy); });
  if (sunR) tops.sun = topAt(sunR.cx, sunR.cy);
  const beltShips = visShips.filter(s => (s.sid || '').indexOf('belt-') === 0);
  return { cam: cam, viewport: [innerWidth, innerHeight], planets: planets, moons: moons, sun: sunR, tops: tops,
           overlaps: overlaps, ships: { total: ships.length, visible: visShips.length, offscreen: offscreen }, beltShips: beltShips.length,
           bodyClass: document.body.className, title: document.title };
})()`;

(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&freeze=100000&token=' + token, { wait: 8000 });
    const sid = pg.sessionId;
    const out = [];
    for (const v of VIEWS) {
        const url = BASE + '?shot=1&onb=1&freeze=100000&tilt=' + v.tilt + '&spin=' + v.spin + '&zoom=' + v.zoom + '&token=' + token;
        await b.send('Page.navigate', { url: url }, sid);
        await cdp.sleep(4500);
        const data = await cdp.evaluate(b, sid, GRAB);
        const png = '3d-' + v.tilt + '-' + v.spin + '-' + v.zoom + '.png';
        await cdp.screenshot(b, sid, path.join(OUT, png));
        out.push({ view: v, data: data, png: png });
        fs.writeFileSync(path.join(OUT, '_3d.json'), JSON.stringify(out, null, 1), 'utf8');
        console.log(v.group, 'tilt', v.tilt, 'spin', v.spin, 'zoom', v.zoom, '| cam', JSON.stringify(data.cam), '| ships off:', data.ships.offscreen, '| overlaps:', data.overlaps.length);
    }
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
