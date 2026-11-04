'use strict';
// v=1207: perf старого вида с ?off=... — по одному варианту за запуск (аргумент argv[2]).
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const VARIANTS = {
    base: '',
    sync: '&off=sync',
    catalog: '&off=catalog',
    boot: '&off=boot',
    all: '&off=sync,catalog,boot'
};

(async () => {
    const key = process.argv[2];
    if (!VARIANTS.hasOwnProperty(key)) { console.error('usage: node _37.js base|sync|catalog|boot|all'); process.exit(2); }
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 100) });
    const url = BASE + '?shot=1&onb=1&perf2=1' + VARIANTS[key] + '&token=' + token;
    const pg = await cdp.newPage(b, url, { wait: 11000 });
    const samples = [];
    for (let i = 0; i < 3; i++) {
        samples.push(await cdp.evaluate(b, pg.sessionId, `(() => { const el = document.getElementById('perf-probe'); return el ? el.textContent.replace(/\\s+/g,' ').trim() : null; })()`));
        await cdp.sleep(3000);
    }
    const globals = await cdp.evaluate(b, pg.sessionId, `(() => ({ buildSynced: window.__buildSynced, catalogClicks: window.__catalogClicks, systems: Array.isArray(window.__systems) ? window.__systems.length : (window.__systems && typeof window.__systems === 'object' ? Object.keys(window.__systems).length : window.__systems), sceneScale: typeof window.SceneScale, catRender: typeof window.CatalogRender }))()`);
    const file = path.join(OUT, '_37_' + key + '.json');
    fs.writeFileSync(file, JSON.stringify({ name: key, samples: samples, globals: globals }, null, 1), 'utf8');
    console.log(key, JSON.stringify(samples), JSON.stringify(globals));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
