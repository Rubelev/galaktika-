'use strict';
// Полный замер сцены: последовательные кадры в одном браузере, один JSON.
// node tools/_measure.js
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const CONFIGS = [
    { name: 'z0', freeze: 100000, zoom: 0.95 },
    { name: 'z60', freeze: 100060, zoom: 0.95 },
    { name: 'z120', freeze: 100120, zoom: 0.95 },
    { name: 'z180', freeze: 100180, zoom: 0.95 },
    { name: 'z240', freeze: 100240, zoom: 0.95 },
    { name: 'z300', freeze: 100300, zoom: 0.95 },
    { name: 'z600', freeze: 100600, zoom: 0.95 },
    { name: 'zt45a', freeze: 100000, zoom: 0.95, tilt: 45, spin: 20, png: 'audit-tilt45.png' },
    { name: 'zt45b', freeze: 100600, zoom: 0.95, tilt: 45, spin: 20 },
    { name: 'zt85a', freeze: 100000, zoom: 0.95, tilt: 85, spin: 0, png: 'audit-tilt85.png' },
    { name: 'zt85b', freeze: 100600, zoom: 0.95, tilt: 85, spin: 0 }
];

const GRAB = String.raw`(() => {
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
  const now = (window.__freezeAt !== undefined) ? window.__freezeAt : (window.Motion ? window.Motion.now() : Date.now());
  const layerOf = (el) => el.closest('#fleet-traffic') ? 'fleet' : el.closest('#trade-traffic') ? 'trade' : el.closest('#civil-traffic') ? 'civil' : el.closest('#fleet-dots') ? 'fleet-dots' : el.closest('#gravity-platform') ? 'gravity' : 'other';

  // --- планеты (живые позиции из WorldCoords и из DOM) ---
  const planetPos = {};
  const planets = Array.from(document.querySelectorAll('.planet[data-planet-id]')).map(function (el) {
    const st = getComputedStyle(el), id = el.getAttribute('data-planet-id'), r = rect(el);
    let wc = window.WorldCoords ? window.WorldCoords.planetAt(id, now) : null;
    if (wc) planetPos[id] = { x: wc.x, y: wc.y };
    let pred = null;
    if (wc && cam.scale) pred = window.WorldCoords.toScreen(wc, { scale: cam.scale, tiltDeg: cam.rotX, spinDeg: cam.rotZ, panX: cam.panX, panY: cam.panY }, { width: innerWidth, height: innerHeight });
    return { id: id, r: r, wc: wc, pred: pred, display: st.display, visibility: st.visibility, opacity: st.opacity,
             inView: r.cx > -20 && r.cy > -20 && r.cx < innerWidth + 20 && r.cy < innerHeight + 20,
             truncNaNs: (el.style.transform || '').match(/NaN|Infinity/) ? 1 : 0 };
  });
  // портал
  let portalPos = null;
  const portalEl = document.querySelector('.portal');
  if (portalEl) {
    // из стиля: translate(-50%,-50%) translate(px, py) rotateZ...
    const tr = portalEl.getAttribute('style') || '';
    const m = tr.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    if (m) portalPos = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
  }

  // --- трассы: сопоставляем каждую с парой планет по концам ---
  function parseD(d) {
    const m = (d || '').match(/M\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)[\s,]*[QL]\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)(?:[\s,]*[QL]\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+))?/);
    if (!m) return null;
    const a = { x: +m[1], y: +m[2] };
    if (m[5] !== undefined) return { a: a, cp: { x: +m[3], y: +m[4] }, b: { x: +m[5], y: +m[6] }, quad: true };
    return { a: a, cp: null, b: { x: +m[3], y: +m[4] }, quad: false };
  }
  function nearestBody(p) {
    let best = null, bd = 6;
    for (const id in planetPos) { const d = Math.hypot(planetPos[id].x - p.x, planetPos[id].y - p.y); if (d < bd) { bd = d; best = id; } }
    if (portalPos) { const d = Math.hypot(portalPos.x - p.x, portalPos.y - p.y); if (d < bd) { bd = d; best = 'portal'; } }
    if (!best) { // Солнце
      if (Math.hypot(p.x, p.y) < 12) return 'sun';
    }
    return best;
  }
  const paths = {};
  ['fleet', 'trade', 'civil'].forEach(function (k) {
    const sel = { fleet: '#fleet-traffic path', trade: '#trade-traffic path', civil: '#civil-traffic path' }[k];
    paths[k] = Array.from(document.querySelectorAll(sel)).map(function (p, i) {
      const st = getComputedStyle(p);
      const pd = parseD(p.getAttribute('d') || '');
      let route = null;
      if (pd) { const f = nearestBody(pd.a), t = nearestBody(pd.b); if (f && t) route = f + '>' + t; }
      let pts = [], len = 0;
      try { len = p.getTotalLength(); for (let j = 0; j <= 60; j++) { const q = p.getPointAtLength(len * j / 60); pts.push([q.x, q.y]); } } catch (e) { }
      return { i: i, d: p.getAttribute('d') || '', route: route, len: len, pts: pts,
               display: st.display, visibility: st.visibility, opacity: st.opacity };
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
    // маршрут из заголовка: "Флот · earth → mars · ..." / "торговец · earth → mars"
    let from = null, to = null;
    const mt = (el.title || '').match(/(?:Флот|торговец|рейс)[^·:]*[·:]\s*([a-zа-я]+)\s*→\s*([a-zа-я]+)/i);
    if (mt) { from = mt[1].toLowerCase(); to = mt[2].toLowerCase(); }
    const rec = {
      sid: el.dataset.sid || null, title: el.title || '', role: el.dataset.role || null,
      side: el.dataset.side || null, moving: el.dataset.moving || null,
      cls: el.className, layer: layer, x: x, y: y, ang: ang, scale: sc,
      opacity: st.opacity, display: st.display, visibility: st.visibility,
      w: parseFloat(el.style.width) || null, h: parseFloat(el.style.height) || null,
      r: rect(el), from: from, to: to,
      nan: (tr.match(/NaN|Infinity/) ? 1 : 0)
    };
    if (x !== null && y !== null) {
      let best = Infinity, bi = -1, ownBest = Infinity, ownIdx = -1;
      (paths[layer] || []).forEach(function (p) {
        if (!p.pts.length) return;
        const d = distToPts(x, y, p.pts);
        if (d < best) { best = d; bi = p.i; }
        if (from && to) { const pr = p.route || ''; if (pr === from + '>' + to || pr === to + '>' + from) { if (d < ownBest) { ownBest = d; ownIdx = p.i; } } }
      });
      rec.dLine = best; rec.dLinePath = bi;
      rec.dOwn = isFinite(ownBest) ? ownBest : null; rec.dOwnPath = ownIdx >= 0 ? ownIdx : null;
      rec.layerPaths = (paths[layer] || []).length;
    }
    return rec;
  });

  const moons = Array.from(document.querySelectorAll('.moon')).map(function (el) {
    const r = rect(el), st = getComputedStyle(el);
    return { name: el.getAttribute('data-moon'), r: r, display: st.display, visibility: st.visibility, opacity: st.opacity,
             inView: r.cx > -20 && r.cy > -20 && r.cx < innerWidth + 20 && r.cy < innerHeight + 20 };
  });
  const moonStations = Array.from(document.querySelectorAll('.moon-station')).map(function (el) {
    const r = rect(el); return { title: el.title || '', r: r, display: getComputedStyle(el).display };
  });
  const qa = document.getElementById('qa-report');
  return {
    href: location.href.replace(/token=[^&]+/, 'token=T'), title: document.title,
    build: (document.querySelector('meta[name=app-build]') || {}).content,
    viewport: [innerWidth, innerHeight], now: now, cam: cam, sceneStyle: sceneStyle,
    bodyClass: document.body.className,
    ships: ships, planets: planets,
    moons: moons, moonStations: moonStations,
    portal: portalEl ? { r: rect(portalEl), pos: portalPos, display: getComputedStyle(portalEl).display,
                         title: portalEl.title || ((portalEl.querySelector('.tooltip') || {}).textContent || ''),
                         inView: rect(portalEl).cx > -20 && rect(portalEl).cy > -20 && rect(portalEl).cx < innerWidth + 20 && rect(portalEl).cy < innerHeight + 20 } : null,
    paths: paths,
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
    const b = await cdp.launch();
    const results = [];
    const pg = await cdp.newPage(b, 'about:blank', { wait: 300 });
    const sessionId = pg.sessionId;
    try {
        for (const cfg of CONFIGS) {
            const url = BASE + '?shot=1&onb=1&freeze=' + cfg.freeze + '&token=' + token;
            await b.send('Page.navigate', { url: url }, sessionId);
            await cdp.sleep(9500);
            let tiltApplied = null;
            if (cfg.zoom !== undefined || cfg.tilt !== undefined || cfg.spin !== undefined) {
                tiltApplied = await cdp.evaluate(b, sessionId, `(() => {
                    const out = {};
                    if (typeof scale === 'number' && ${cfg.zoom || 0} > 0) {
                        scale = ${cfg.zoom};
                        if (window.updateSolarTransform) window.updateSolarTransform();
                        out.scale = scale;
                    }
                    if (typeof window.updateTilt === 'function' && ${cfg.tilt !== undefined ? cfg.tilt : 0}) window.updateTilt(${cfg.tilt !== undefined ? cfg.tilt : 0});
                    const want = ${cfg.spin !== undefined ? cfg.spin : 0};
                    let guard = 0;
                    while (typeof rotZ === 'number' && Math.abs(rotZ - want) >= 5 && guard++ < 40) {
                        if (rotZ < want) window.moveView('right'); else window.moveView('left');
                    }
                    out.rotX = (typeof rotX === 'number' ? rotX : null);
                    out.rotZ = (typeof rotZ === 'number' ? rotZ : null);
                    out.body = document.body.className;
                    out.hidden = Array.from(document.querySelectorAll('.ship-marker')).filter(e => getComputedStyle(e).display === 'none').length;
                    return out;
                })()`);
                await cdp.sleep(900);
            }
            const data = await cdp.evaluate(b, sessionId, GRAB);
            if (cfg.png) await cdp.screenshot(b, sessionId, path.join(OUT, cfg.png));
            results.push({ cfg: cfg, tiltApplied: tiltApplied, data: data });
            fs.writeFileSync(path.join(OUT, '_frames.json'), JSON.stringify(results, null, 1), 'utf8');
            console.log('done', cfg.name, 'ships', data.counts.shipMarkers, 'cam', JSON.stringify(data.cam), 'tilt', JSON.stringify(tiltApplied));
        }
    } finally {
        fs.writeFileSync(path.join(OUT, '_frames.json'), JSON.stringify(results, null, 1), 'utf8');
        await cdp.close(b);
    }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
