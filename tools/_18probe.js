'use strict';
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';
const PROBE = `(() => {
  const counts = {};
  ['.planet', '[data-planet-id]', '.moon', '[data-moon]', '.ship-marker', 'svg', 'svg path', 'canvas', '.orbit', '.solar-system'].forEach(s => { counts[s] = document.querySelectorAll(s).length; });
  const ids = Array.from(document.querySelectorAll('[data-planet-id]')).map(e => e.getAttribute('data-planet-id'));
  const moons = Array.from(document.querySelectorAll('[data-moon]')).map(e => e.getAttribute('data-moon'));
  return { counts, ids, moons, body: document.body.className,
    globals: { Catalog: typeof window.Catalog, SceneModel: typeof window.SceneModel, OrbitKepler: typeof window.OrbitKepler, Bridge: typeof window.CatalogBridge, WC: typeof window.WorldCoords, Motion: typeof window.Motion },
    text: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 300) };
})()`;
(async () => {
    const b = await cdp.launch({ width: 1400, height: 900 });
    const pg = await cdp.newPage(b, BASE + '?shot=1&onb=1&token=' + token, { wait: 12000 });
    const v = await cdp.evaluate(b, pg.sessionId, PROBE);
    console.log(JSON.stringify(v, null, 1));
    await cdp.screenshot(b, pg.sessionId, path.join(OUT, '_18_probe.png'));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
