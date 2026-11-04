'use strict';
// v=1223: РѕРґРёРЅ РІР°СЂРёР°РЅС‚ Р·Р° Р·Р°РїСѓСЃРє: node _38.js <index>
const fs = require('fs');
const path = require('path');
const cdp = require('./_cdp.js');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'reports');
const token = fs.readFileSync(path.join(OUT, '_token.txt'), 'utf8').trim();
const BASE = 'https://warbattleuniverse.com/';

const VARIANTS = [{ name: 'catalogReport', q: '&render=catalog', png: 'cat38-report.png' }];

const READ = `(() => {
  const el = document.getElementById('jitter-report');
  const r = window.__jitterReport || null;
  return { text: el ? el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 700) : null, title: document.title, json: r };
})()`;

(async () => {
    const i = parseInt(process.argv[2] || '0', 10);
    const v = VARIANTS[i];
    if (!v) { console.error('bad index'); process.exit(2); }
    const b = await cdp.launch({ width: 1400, height: 900, port: 9500 + Math.floor(Math.random() * 200) });
    const url = BASE + '?shot=1&onb=1&jitter=8000&bodies=planets' + v.q + '&token=' + token;
    const pg = await cdp.newPage(b, url, { wait: 11500 });
    const r = await cdp.evaluate(b, pg.sessionId, READ);
    let diag = null;
    if (i === 0) {
        diag = await cdp.evaluate(b, pg.sessionId, `(() => {
          const g = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
          const planets = Array.from(document.querySelectorAll('.planet[data-planet-id]'));
          const inOrbit = planets.filter(p => p.closest('.orbit')).map(p => p.getAttribute('data-planet-id'));
          const samples = planets.slice(0, 3).map(p => ({ id: p.getAttribute('data-planet-id'), tr: p.style.transform, parent: p.parentElement ? (p.parentElement.className || p.parentElement.tagName) : null }));
          return { transitionPlanet: g('.planet', 'transition'), transitionMoon: g('.moon', 'transition'), transitionOrbit: g('.orbit', 'transition'),
                   planetCount: planets.length, moons: document.querySelectorAll('.moon').length, inOrbit: inOrbit, samples: samples,
                   scene: getComputedStyle(document.querySelector('.solar-system')).transform };
        })()`);
    }
    if (v.png) await cdp.screenshot(b, pg.sessionId, path.join(OUT, v.png));
    fs.writeFileSync(path.join(OUT, '_38_' + v.name + '.json'), JSON.stringify({ name: v.name, text: r.text, title: r.title, json: r.json, diag: diag }, null, 1), 'utf8');
    console.log(v.name, '|', r.title, '| text:', (r.text || '').slice(0, 200));
    if (diag) console.log('diag:', JSON.stringify(diag));
    await cdp.close(b);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

