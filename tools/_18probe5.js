'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
const PROBE = `(() => {
  const t = (window.Motion && window.Motion.now) ? window.Motion.now() : Date.now();
  const out = {};
  try { out.orbitPositionEarth = window.SceneModel.orbitPosition(window.CATALOG.bodies.find(b => b.id === 'earth'), t); } catch (e) { out.orbitPositionEarth = 'ERR:' + e.message; }
  try { out.orbitPositionEarthSec = window.SceneModel.orbitPosition(window.CATALOG.bodies.find(b => b.id === 'earth'), t / 1000); } catch (e) { out.orbitPositionEarthSec = 'ERR:' + e.message; }
  try { out.smKeys = Object.keys(window.SceneModel); } catch (e) { }
  try { out.orbitPositionSrc = String(window.SceneModel.orbitPosition).slice(0, 300); } catch (e) { }
  out.cheapPlanets = Array.from(document.querySelectorAll('.solar-system *')).slice(0, 30).map(e => e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ').slice(0,2).join('.'));
  out.orbits = Array.from(document.querySelectorAll('.orbit.orbit-kepler')).map(e => ({ w: Math.round(parseFloat(e.style.width)), h: Math.round(parseFloat(e.style.height)), tr: e.style.transform.slice(0, 60), kids: e.children.length }));
  return out;
})()`;
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 11000 });
    const v = await cdp.evaluate(b, pg.sessionId, PROBE);
    const errs = b.events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map(e => (e.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200)).slice(0, 10);
    v.consoleErrors = errs;
    fs.writeFileSync(path.join(OUT, '_18_probe5.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log(JSON.stringify(v, null, 1).slice(0, 4000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
