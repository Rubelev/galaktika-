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
  const out = { t: t };
  try { out.catalog_count = window.CATALOG ? { bodies: (CATALOG.bodies||[]).length, agents: (CATALOG.agents||[]).length, ships: (CATALOG.ships||[]).length } : null; } catch (e) { out.catalog_count = 'ERR:' + e.message; }
  try { out.bodySample = (CATALOG.bodies || []).slice(0, 3); } catch (e) { out.bodySample = 'ERR'; }
  try { out.agents = (CATALOG.agents || []).slice(0, 3); } catch (e) { }
  try { out.ships = (CATALOG.ships || []).slice(0, 3); } catch (e) { }
  try { out.bridge = { count: window.CatalogBridge.count(), planets: window.CatalogBridge.planets().slice(0, 12) }; } catch (e) { out.bridge = 'ERR:' + e.message; }
  try { out.posEarth = window.CatalogBridge.pos('earth', t); } catch (e) { out.posEarth = 'ERR:' + e.message; }
  try { out.posMoon = window.CatalogBridge.pos('moon', t); } catch (e) { out.posMoon = 'ERR:' + e.message; }
  try { out.project = window.SceneModel.project ? window.SceneModel.project({ x: 0, y: 100, z: 0 }) : null; } catch (e) { out.project = 'ERR:' + e.message; }
  try { out.frame = window.SceneModel.frame ? Object.keys(window.SceneModel.frame(t)) : null; } catch (e) { out.frame = 'ERR:' + e.message; }
  try { out.findEarth = window.CatalogBridge.find ? window.CatalogBridge.find('earth') : null; } catch (e) { out.findEarth = 'ERR:' + e.message; }
  return out;
})()`;
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 11000 });
    const v = await cdp.evaluate(b, pg.sessionId, PROBE);
    fs.writeFileSync(path.join(OUT, '_18_probe4.json'), JSON.stringify(v, null, 1), 'utf8');
    console.log(JSON.stringify(v, null, 1).slice(0, 7000));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
