'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
const PROBE = `(() => {
  const svg = document.querySelector('.solar-system svg');
  const g = document.querySelector('.orbit.orbit-kepler');
  const fl = document.querySelector('.fleet-layer');
  const globals = {};
  ['__catalog','CATALOG','catalog','SceneModel','OrbitKepler','CatalogBridge','WorldCoords','Motion'].forEach(k => { try { globals[k] = typeof window[k] + (window[k] && typeof window[k] === 'object' ? ':' + Object.keys(window[k]).slice(0,8).join(',') : ''); } catch (e) { globals[k] = 'ERR'; } });
  let frame = null;
  try { frame = window.SceneModel.frame(window.Motion.now ? window.Motion.now() : Date.now()); } catch (e) { frame = 'ERR:' + e.message; }
  let frameKeys = null, frameSample = null;
  if (frame && typeof frame === 'object') { frameKeys = Object.keys(frame).slice(0, 12); const k = frameKeys[0]; frameSample = JSON.stringify(frame[k]).slice(0, 400); }
  return { svg: svg ? svg.outerHTML.slice(0, 1200) : null,
           orbit: g ? g.outerHTML.slice(0, 900) : null,
           fleet: fl ? fl.innerHTML.slice(0, 400) : null,
           globals: globals, frameKeys: frameKeys, frameSample: frameSample,
           svgKids: svg ? Array.from(svg.children).map(e => e.tagName + ':' + (e.getAttribute('class') || '') + ':' + Array.from(e.children).length) : null };
})()`;
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 11000 });
    const v = await cdp.evaluate(b, pg.sessionId, PROBE);
    fs.writeFileSync(path.join(OUT, '_18_probe3.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log(JSON.stringify(v, null, 1).slice(0, 7000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
