'use strict';
// Снимок сцены для аудита агентов. Аргументы: name freeze [extraQuery]
// node tools/_snap.js base 100000 "&tilt=0"
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const PAGE = String.raw`(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; };
  const num = (s, re) => { const m = (s || '').match(re); return m ? parseFloat(m[1]) : null; };
  const scene = document.querySelector('.solar-system');
  const sceneStyle = scene ? (scene.getAttribute('style') || '') : '';
  const cam = {
    scale: num(sceneStyle, /scale\(([-\d.]+)\)/),
    rotX: num(sceneStyle, /rotateX\(([-\d.]+)deg\)/),
    rotZ: num(sceneStyle, /rotateZ\(([-\d.]+)deg\)/),
    panX: num(sceneStyle, /translate\(([-\d.]+)px/),
    panY: (() => { const m = sceneStyle.match(/translate\([-\d.]+px,\s*([-\d.]+)px\)/); return m ? parseFloat(m[1]) : null; })()
  };
  const now = (window.__freezeAt !== undefined) ? window.__freezeAt : (window.Motion && window.Motion.now ? window.Motion.now() : Date.now());
  const layerOf = (el) => el.closest('#fleet-traffic') ? 'fleet' : el.closest('#trade-traffic') ? 'trade' : el.closest('#civil-traffic') ? 'civil' : el.closest('#fleet-dots') ? 'fleet-dots' : el.closest('#gravity-platform') ? 'gravity' : 'other';

  // пути по слоям
  const pathInfo = {};
  ['fleet', 'trade', 'civil'].forEach(function (k) {
    const sel = { fleet: '#fleet-traffic path', trade: '#trade-traffic path', civil: '#civil-traffic path' }[k];
    pathInfo[k] = Array.from(document.querySelectorAll(sel)).map(function (p, i) {
      const st = getComputedStyle(p);
      let len = 0, pts = [];
      try { len = p.getTotalLength(); for (let j = 0; j <= 60; j++) { const q = p.getPointAtLength(len * j / 60); pts.push([q.x, q.y]); } } catch (e) {}
      return { i: i, d: p.getAttribute('d') || '', len: len, pts: pts, display: st.display, visibility: st.visibility, opacity: st.opacity, cls: p.getAttribute('class') || '' };
    });
  });
  const distToPts = (x, y, pts) => { let best = Infinity; for (const q of pts) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < best) best = d; } return best; };

  const ships = Array.from(document.querySelectorAll('.ship-marker')).map(function (el) {
    const tr = el.style.transform || '';
    const x = num(tr, /translate\(([-\d.]+)px,\s*[-\d.]+px\)/);
    const y = num(tr, /translate\([-\d.]+px,\s*([-\d.]+)px\)/);
    const ang = num(tr, /rotate\(([-\d.]+)deg\)/);
    const sc = num(tr, /scale\(([-\d.]+)\)/);
    const st = getComputedStyle(el);
    const layer = layerOf(el);
    const rec = {
      sid: el.dataset.sid || null, title: el.title || '', role: el.dataset.role || null,
      side: el.dataset.side || null, route: el.dataset.route || null, moving: el.dataset.moving || null,
      cls: el.className, layer: layer, x: x, y: y, ang: ang, scale: sc,
      opacity: st.opacity, display: st.display, visibility: st.visibility,
      w: parseFloat(el.style.width) || null, h: parseFloat(el.style.height) || null,
      r: rect(el)
    };
    if (x !== null && y !== null && pathInfo[layer] && pathInfo[layer].length) {
      let best = Infinity, bi = -1;
      pathInfo[layer].forEach(function (p) { if (!p.pts.length) return; const d = distToPts(x, y, p.pts); if (d < best) { best = d; bi = p.i; } });
      rec.dLine = best; rec.dLinePath = bi; rec.layerPaths = pathInfo[layer].length;
    }
    if (window.Motion && el.dataset.sid && /^fleet-(\d+)$/.test(el.dataset.sid)) {
      try {
        const ps = window.Motion.shipPose(parseInt(el.dataset.sid.slice(6), 10), now);
        rec.motion = ps ? { x: ps.x, y: ps.y, ang: ps.ang, phase: ps.phase, from: ps.from, to: ps.to } : null;
        rec.motionSpeed = window.Motion.shipSpeed ? window.Motion.shipSpeed(el.art || 'jet_scout', {}) : null;
      } catch (e) { rec.motion = null; }
    }
    return rec;
  });

  const planets = Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(function (el) {
    const st = getComputedStyle(el);
    const id = el.getAttribute('data-planet-id');
    const r = rect(el);
    let wc = null;
    if (window.WorldCoords) { const p = window.WorldCoords.planetAt(id, now); if (p) wc = { x: p.x, y: p.y }; }
    let screenPred = null;
    if (wc && window.WorldCoords && cam.scale) {
      screenPred = window.WorldCoords.toScreen(wc, { scale: cam.scale, tiltDeg: cam.rotX, spinDeg: cam.rotZ, panX: cam.panX, panY: cam.panY }, { width: innerWidth, height: innerHeight });
    }
    const tr = el.style.transform || '';
    return { id: id, title: el.title || ((el.querySelector('.tooltip') || {}).textContent || ''), r: r, wc: wc, screenPred: screenPred,
             display: st.display, visibility: st.visibility, opacity: st.opacity,
             ox: num(tr, /translateX\(([-\d.]+)px\)/), orbitStyle: (el.closest('.orbit') || {}).getAttribute ? (el.closest('.orbit').getAttribute('style') || '') : '' };
  });

  const moons = Array.from(document.querySelectorAll('.moon')).map(function (el) {
    const r = rect(el); const st = getComputedStyle(el);
    return { name: el.getAttribute('data-moon'), title: el.title || ((el.querySelector('.tooltip') || {}).textContent || ''), r: r, display: st.display, visibility: st.visibility, opacity: st.opacity };
  });
  const moonStations = Array.from(document.querySelectorAll('.moon-station')).map(function (el) {
    const r = rect(el); return { title: el.title || '', r: r, display: getComputedStyle(el).display };
  });
  const portal = document.querySelector('.portal.system-extra') || document.querySelector('.portal');
  const body = document.body;
  const qa = document.getElementById('qa-report');
  return {
    href: location.href, title: document.title, build: (document.querySelector('meta[name=app-build]') || {}).content,
    viewport: [innerWidth, innerHeight], now: now, cam: cam,
    sceneStyle: sceneStyle, sceneRect: scene ? rect(scene) : null,
    bodyClass: body.className,
    ships: ships, planets: planets, moons: moons, moonStations: moonStations,
    portal: portal ? { r: rect(portal), display: getComputedStyle(portal).display, title: portal.title || ((portal.querySelector('.tooltip') || {}).textContent || '') } : null,
    paths: pathInfo,
    counts: {
      shipMarkers: ships.length,
      byLayer: ships.reduce(function (a, s) { a[s.layer] = (a[s.layer] || 0) + 1; return a; }, {}),
      planets: planets.length, moons: moons.length, moonStations: moonStations.length,
      stations: document.querySelectorAll('.station').length,
      tethers: document.querySelectorAll('.tether').length,
      trafficShips: document.querySelectorAll('.traffic-ship').length,
      portals: document.querySelectorAll('.portal').length,
      tradePaths: document.querySelectorAll('.trade-path').length,
      fleetPaths: document.querySelectorAll('#fleet-traffic path').length,
      civilPaths: document.querySelectorAll('#civil-traffic path').length,
      canvas: document.querySelectorAll('canvas').length
    },
    qaReport: qa ? qa.textContent : null
  };
})()`;

(async () => {
    const name = process.argv[2] || 'base';
    const freeze = process.argv[3] || '100000';
    const extra = process.argv[4] || '';
    const wait = parseInt(process.env.SNAP_WAIT || '9000', 10);
    const b = await cdp.launch();
    try {
        const url = BASE + '?shot=1&onb=1&freeze=' + freeze + '&token=' + token + extra;
        const { sessionId } = await cdp.newPage(b, url, { wait: wait });
        const val = await cdp.evaluate(b, sessionId, PAGE);
        const out = { name: name, freeze: parseFloat(freeze), extra: extra, url: url.replace(token, 'TOKEN'), data: val };
        fs.writeFileSync(path.join(OUT, '_snap_' + name + '.json'), JSON.stringify(out, null, 1), 'utf8');
        if (process.env.SNAP_PNG) await cdp.screenshot(b, sessionId, path.join(OUT, process.env.SNAP_PNG));
        const d = val || {};
        const c = d.counts || {};
        console.log(JSON.stringify({ name: name, freeze: freeze, extra: extra, title: d.title, now: d.now, cam: d.cam, counts: c, qa: d.qaReport ? 'present' : 'none' }));
    } finally {
        await cdp.close(b);
    }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
